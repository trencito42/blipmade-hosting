/**
 * A tiny SMTP server that keeps the messages it receives.
 *
 * It is used to prove that the platform can really deliver a message through
 * SMTP, which is the path the production platform cannot use yet because no
 * relay is configured. It listens on the loopback address only and it never
 * sends anything anywhere.
 *
 * Usage: node smtp-sink.mjs [port] [directory]
 */
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 2525);
const DIR = process.argv[3] ?? '/tmp/blipmade-e2e/smtp';

mkdirSync(DIR, { recursive: true });

let counter = 0;

const server = createServer((socket) => {
  let buffer = '';
  let inData = false;
  let message = '';

  const write = (line) => socket.write(`${line}\r\n`);

  // The greeting comes first: a client waits for it before it says anything.
  write('220 smtp-sink ESMTP ready');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');

    while (buffer.includes('\r\n')) {
      const index = buffer.indexOf('\r\n');
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);

      if (inData) {
        if (line === '.') {
          inData = false;
          counter += 1;
          const file = join(DIR, `message-${String(counter).padStart(4, '0')}.eml`);
          writeFileSync(file, message, 'utf8');
          message = '';
          write('250 2.0.0 Ok: queued');
        } else {
          message += `${line.startsWith('..') ? line.slice(1) : line}\n`;
        }
        continue;
      }

      const upper = line.toUpperCase();
      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        write('250-smtp-sink');
        write('250 AUTH PLAIN LOGIN');
      } else if (upper.startsWith('MAIL FROM') || upper.startsWith('RCPT TO')) {
        write('250 2.1.0 Ok');
      } else if (upper.startsWith('DATA')) {
        inData = true;
        write('354 End data with <CR><LF>.<CR><LF>');
      } else if (upper.startsWith('QUIT')) {
        write('221 2.0.0 Bye');
        socket.end();
        break;
      } else if (upper.startsWith('RSET') || upper.startsWith('NOOP')) {
        write('250 2.0.0 Ok');
      } else {
        write('250 2.0.0 Ok');
      }
    }
  });

  socket.on('error', () => {});
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`smtp-sink listening on 127.0.0.1:${PORT}, writing to ${DIR}`);
});
