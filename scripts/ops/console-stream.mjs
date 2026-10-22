/**
 * Captures the live console output of a server through the panel Client API.
 *
 * The saved browser session is reused so the panel's reCAPTCHA is not involved.
 *
 * TLS verification is never switched off. When the panel certificate is not
 * trusted the script stops and says how to install the CA certificate.
 *
 * Environment:
 *   PTERODACTYL_URL     the panel (default https://panel.blipmade.com)
 *   COOKIE_FILE         the session saved by scripts/ops/browser-session.mjs
 *   PROBE_SERVER_UUID   the uuid of the server to read
 *   WS_HOST             the address of the node daemon
 *   CONSOLE_SECONDS     how long to listen (default 30)
 */
import fs from 'node:fs';

const BASE = process.env.PTERODACTYL_URL ?? 'https://panel.blipmade.com';
const COOKIE_FILE = process.env.COOKIE_FILE ?? '/tmp/panel-cookie.json';
const SERVER_UUID = process.env.PROBE_SERVER_UUID ?? '';
const WS_HOST = process.env.WS_HOST ?? '10.77.0.11:8080';
const SECONDS = Number(process.env.CONSOLE_SECONDS ?? 30);

const TLS_HINT = [
  'The certificate of the panel is not trusted by this machine.',
  'Install the CA certificate and point Node at it, for example:',
  '  SSL_CERT_FILE=/etc/ssl/certs/blipmade-ca.pem node scripts/ops/console-stream.mjs',
  'or export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/blipmade-ca.pem',
].join('\n');

const TLS_CODES = [
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
];

/** Tell whether an error is a certificate problem and print what to do. */
function reportError(error, context) {
  const code = String(error?.code ?? error?.cause?.code ?? '');
  if (TLS_CODES.some((candidate) => code.includes(candidate))) {
    console.error(`${context}: ${error.message}`);
    console.error(TLS_HINT);
    return true;
  }
  console.error(`${context}: ${error.message}`);
  return false;
}

if (!SERVER_UUID) {
  console.error('error: PROBE_SERVER_UUID is not set (the uuid of the server to read).');
  process.exit(1);
}

const WS_MODULE = process.env.WS_MODULE ??
  '/opt/blipmade/tools/browser/node_modules/ws/index.js';
const wsModule = await import(WS_MODULE);
const WebSocket = wsModule.WebSocket ?? wsModule.default?.WebSocket;

let saved;
try {
  saved = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
} catch (error) {
  console.error(`error: the session file ${COOKIE_FILE} could not be read: ${error.message}`);
  console.error('Create it first with scripts/ops/browser-session.mjs.');
  process.exit(1);
}
const cookieHeader = saved.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const xsrf = saved.cookies.find((c) => c.name === 'XSRF-TOKEN');

let res;
let text;
try {
  res = await fetch(`${BASE}/api/client/servers/${SERVER_UUID}/websocket`, {
    headers: {
      Accept: 'application/json',
      Cookie: cookieHeader,
      ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf.value) } : {}),
    },
  });
  text = await res.text();
} catch (error) {
  reportError(error, 'the websocket endpoint could not be reached');
  process.exit(1);
}
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
      reportError(err, '  error');
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
