// Compatibility launcher for Pterodactyl eggs still pointing MAIN_FILE to index.js.
// Builds React on each boot; recommended startup is the direct command in README.
import { spawnSync } from 'node:child_process';
function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const p = spawnSync(cmd, args, { cwd: process.cwd(), stdio: 'inherit' });
  if (p.error) { console.error(p.error); process.exit(1); }
  if (p.status !== 0) process.exit(p.status || 1);
}
run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund']);
run('npm', ['run', 'build']);
await import('./server.mjs');
