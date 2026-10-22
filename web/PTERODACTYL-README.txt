BLIPMADE SOURCE (2) — READY FOR PTERODACTYL

This package is the actual content of blipmade-source(2).zip, flattened
from blipmade/ to the archive root. Added server.mjs and an index.js fallback.

PTERODACTYL /home/container:
  1. Stop the instance. Back up the existing files if needed.
  2. Upload this zip and Unarchive directly in /home/container.
     If a folder named blipmade/ remains, move its contents to /home/container.
  3. Recommended startup command:
     cd /home/container && npm ci --include=dev && npm run build && exec node server.mjs
  4. Use the Node.js 25 image currently running in the container.
  5. Start. Look for: Blipmade site listening on 0.0.0.0:30001
  6. Check https://test.apps.blipmade.com/ and /login

If the Egg's startup command cannot be edited but MAIN_FILE can be set to
index.js, the included compatibility launcher installs, builds and serves.
It is slower on boot, but avoids serving an outdated dist/ directory.

IMPORTANT:
- This is the React/Vite FRONTEND only, not a full commercial platform.
- Login source explicitly says no backend connected; it does not log in users.
- The resource configurator currently uses illustrative prices.
- No customer API keys, Stripe keys, or Pterodactyl API keys belong here.
- Does not touch VM 103 Fastify, Docker, PostgreSQL or Redis.

Build has not been verified end-to-end in this environment because npm
package installation could not complete. Pterodactyl will run build on startup.
