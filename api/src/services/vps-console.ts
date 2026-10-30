import type { FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import * as pve from './proxmox.js';

/**
 * The serial console of a server, in the browser.
 *
 * The browser opens this socket with its session cookie. The API asks Proxmox for a terminal
 * and pipes the two sockets together, so the token of Proxmox never reaches the browser and
 * only the owner of the server (or the staff acting for them) gets a console.
 *
 * What the browser sends is the text the customer types, except a line that starts with a NUL
 * byte and "resize:", which carries the size of the window.
 */
export async function relayVpsConsole(socket: WebSocket, request: FastifyRequest, admin = false): Promise<void> {
  const user = request.user;
  if (!user) return void socket.close(4401, 'Sign in to use the console.');
  let id: string;
  try {
    id = z.object({ id: z.string() }).parse(request.params).id;
  } catch {
    return void socket.close(4400, 'Bad request.');
  }
  if (admin && user.role === 'CUSTOMER') return void socket.close(4403, 'Not allowed.');
  const service = await prisma.vpsService.findFirst({ where: admin ? { id } : { id, userId: user.id } });
  if (!service || service.status !== 'ACTIVE' || !service.vmid) return void socket.close(4404, 'The server is not available.');

  let terminal: WebSocket;
  let ticket: pve.TerminalTicket;
  try {
    ticket = await pve.openTerminal(service.vmid);
    const target = pve.terminalSocket(service.vmid, ticket);
    terminal = new WebSocket(target.url, { headers: target.headers, rejectUnauthorized: false });
  } catch {
    return void socket.close(1011, 'The console could not be opened.');
  }
  await audit({ actorId: user.id, actorEmail: user.email, action: admin ? 'admin.vps.console' : 'vps.console', targetType: 'vps', targetId: id, ip: request.ip });

  let ready = false;
  const keepAlive = setInterval(() => {
    if (terminal.readyState === WebSocket.OPEN) terminal.send('2');
  }, 20_000);
  const end = () => {
    clearInterval(keepAlive);
    if (terminal.readyState <= WebSocket.OPEN) terminal.close();
    if (socket.readyState <= WebSocket.OPEN) socket.close();
  };

  terminal.on('open', () => terminal.send(`${ticket.user}:${ticket.ticket}\n`));
  terminal.on('message', (data) => {
    const text = data.toString('utf-8');
    if (!ready) {
      // The first answer is "OK" and it is not for the customer.
      ready = true;
      if (text.startsWith('OK')) {
        const rest = text.slice(2);
        if (rest) socket.send(rest);
        return;
      }
    }
    if (socket.readyState === WebSocket.OPEN) socket.send(text);
  });
  terminal.on('close', end);
  terminal.on('error', end);

  socket.on('message', (raw) => {
    if (terminal.readyState !== WebSocket.OPEN) return;
    const text = raw.toString('utf-8');
    const resize = /^\u0000resize:(\d{1,3}):(\d{1,3})$/.exec(text);
    if (resize) {
      terminal.send(`1:${resize[1]}:${resize[2]}:`);
      return;
    }
    terminal.send(`0:${Buffer.byteLength(text)}:${text}`);
  });
  socket.on('close', end);
  socket.on('error', end);
}
