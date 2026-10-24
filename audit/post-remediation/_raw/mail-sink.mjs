/**
 * Minimal SMTP sink for the customer-journey audit.
 * Accepts every message and writes it to /tmp/cj/mail-sink/<n>.json so the
 * audit can read the real tokens that the platform sends.
 * It is a sink: nothing leaves the machine.
 */
import net from 'node:net';
import fs from 'node:fs';

const PORT = Number(process.env.SINK_PORT || 3525);
const DIR = process.env.SINK_DIR || '/tmp/cj/mail-sink';
fs.mkdirSync(DIR, { recursive: true });

let seq = 0;

const server = net.createServer((socket) => {
  let buffer = '';
  let inData = false;
  let dataLines = [];
  let from = '';
  let to = [];

  const write = (line) => socket.write(line + '\r\n');

  write('220 cj-mail-sink ESMTP ready');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      if (inData) {
        if (line === '.') {
          inData = false;
          const raw = dataLines.join('\n');
          seq += 1;
          const file = `${DIR}/${String(seq).padStart(4, '0')}.json`;
          fs.writeFileSync(file, JSON.stringify({ from, to, raw }, null, 2));
          write('250 2.0.0 Ok: queued as ' + String(seq));
          dataLines = [];
        } else {
          dataLines.push(line.startsWith('..') ? line.slice(1) : line);
        }
        continue;
      }

      const cmd = line.trim();
      const verb = cmd.split(/[: ]/)[0].toUpperCase();
      if (verb === 'EHLO') {
        write('250-cj-mail-sink greets you');
        write('250 SIZE 52428800');
      } else if (verb === 'HELO') {
        write('250 cj-mail-sink');
      } else if (verb === 'MAIL') {
        from = cmd.slice(cmd.indexOf(':') + 1).trim();
        write('250 2.1.0 Ok');
      } else if (verb === 'RCPT') {
        to.push(cmd.slice(cmd.indexOf(':') + 1).trim());
        write('250 2.1.5 Ok');
      } else if (verb === 'DATA') {
        inData = true;
        write('354 End data with <CR><LF>.<CR><LF>');
      } else if (verb === 'RSET') {
        from = ''; to = []; write('250 2.0.0 Ok');
      } else if (verb === 'NOOP') {
        write('250 2.0.0 Ok');
      } else if (verb === 'QUIT') {
        write('221 2.0.0 Bye');
        socket.end();
      } else {
        write('250 2.0.0 Ok');
      }
    }
  });
  socket.on('error', () => {});
});

server.listen(PORT, '127.0.0.1', () => console.log(`mail sink on ${PORT}, writing to ${DIR}`));

// A tiny reader so the audit can fetch the captured messages over HTTP.
import http from 'node:http';
const READ_PORT = Number(process.env.SINK_READ_PORT || 3526);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  if (url.pathname === '/messages') {
    const items = files.map((f) => {
      const m = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      return { file: f, to: m.to, from: m.from, subject: (m.raw.match(/^Subject: (.*)$/m) || [])[1] ?? '' };
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(items));
  }
  const name = url.pathname.replace(/^\/messages\//, '');
  if (name && files.includes(name)) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(fs.readFileSync(`${DIR}/${name}`, 'utf8'));
  }
  res.writeHead(404); res.end('{}');
}).listen(READ_PORT, '127.0.0.1', () => console.log(`mail sink reader on ${READ_PORT}`));
