/**
 * Captures the live console output of a server through the panel Client API.
 *
 * The saved browser session is reused so the panel's reCAPTCHA is not involved.
 */
import fs from 'node:fs';

const WS_MODULE = process.env.WS_MODULE ??
  '/opt/blipmade/tools/browser/node_modules/ws/index.js';
const wsModule = await import(WS_MODULE);
const WebSocket = wsModule.WebSocket ?? wsModule.default?.WebSocket;

const BASE = process.env.PTERODACTYL_URL ?? 'https://panel.blipmade.com';
const COOKIE_FILE = process.env.COOKIE_FILE ?? '/tmp/panel-cookie.json';
const SERVER_UUID = process.env.PROBE_SERVER_UUID ?? '';
const WS_HOST = process.env.WS_HOST ?? '10.77.0.11:8080';
const SECONDS = Number(process.env.CONSOLE_SECONDS ?? 30);

const saved = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
const cookieHeader = saved.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const xsrf = saved.cookies.find((c) => c.name === 'XSRF-TOKEN');

const res = await fetch(`${BASE}/api/client/servers/${SERVER_UUID}/websocket`, {
  headers: {
    Accept: 'application/json',
    Cookie: cookieHeader,
    ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf.value) } : {}),
  },
});
const text = await res.text();
console.log('websocket endpoint ->', res.status);
if (!text.trim().startsWith('{')) {
  console.log(text.slice(0, 300));
  process.exit(1);
}
const payload = JSON.parse(text);
const token = payload.token ?? payload.data?.token;
const socket = payload.socket ?? payload.data?.socket;
console.log('socket:', socket);

const paths = [
  `wss://${WS_HOST}${new URL(socket).pathname}?token=${encodeURIComponent(token)}`,
  `wss://${WS_HOST}${new URL(socket).pathname}`,
];

for (const url of paths) {
  console.log('\n--- trying', url.replace(token, '<token>'));
  const ok = await new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const conn = new WebSocket(url, {
      rejectUnauthorized: false,
      headers: {
        Origin: BASE,
        Authorization: `Bearer ${token}`,
        'X-Pterodactyl-Client': 'blipmade',
      },
    });
    const lines = [];
    conn.on('open', () => console.log('  open'));
    conn.on('message', (data) => {
      const raw = data.toString();
      try {
        const parsed = JSON.parse(raw);
        if (parsed.event === 'console output') {
          const line = parsed.args?.output ?? JSON.stringify(parsed.args);
          console.log('  [console]', line);
          lines.push(line);
        } else {
          console.log('  [event]', JSON.stringify(parsed).slice(0, 260));
        }
      } catch {
        console.log('  [raw]', raw.slice(0, 260));
        lines.push(raw);
      }
    });
    conn.on('error', (err) => {
      console.log('  error:', err.message);
      done(false);
    });
    conn.on('close', (code, reason) => {
      console.log('  closed:', code, String(reason).slice(0, 120));
      if (lines.length) {
        fs.writeFileSync('/tmp/console-output.txt', lines.join('\n'));
        console.log('  captured lines:', lines.length);
        done(true);
      } else {
        done(false);
      }
    });
    setTimeout(() => {
      conn.close();
      if (lines.length) {
        fs.writeFileSync('/tmp/console-output.txt', lines.join('\n'));
        console.log('  captured lines:', lines.length);
      }
      done(lines.length > 0);
    }, SECONDS * 1000);
  });
  if (ok) break;
}
