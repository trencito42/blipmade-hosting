/*
 * The service worker of the dashboard. It exists so the site can be installed like an app, and it
 * keeps one rule: nothing about an account is ever stored. Requests go to the network as they are.
 * Only when a page cannot be reached at all (no connection) does it answer with a short offline page.
 */
const OFFLINE = new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#090b0a;color:#f1f5ef;font:16px system-ui,sans-serif"><main style="max-width:28rem;padding:2rem"><h1 style="font-size:1.4rem">You are offline</h1><p style="color:#b5c0b8">Blipmade needs a connection to show your services. Check your network and try again.</p></main>',
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => OFFLINE.clone()));
});
