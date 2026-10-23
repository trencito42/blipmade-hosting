// One-off read-only audit helper: reports the panel's allocation port layout,
// removes the stray device node that a bad `docker cp /dev/null` left behind,
// and deletes itself. Runs inside the api container.
const { listAllocations } = await import('/app/dist/services/pterodactyl/application.js');
const alloc = await listAllocations(1);
const ports = alloc.map((a) => a.port).sort((a, b) => a - b);
const ranges = [];
for (const p of ports) {
  const last = ranges[ranges.length - 1];
  if (last && p === last[1] + 1) last[1] = p;
  else ranges.push([p, p]);
}
const free = alloc.filter((a) => !a.assigned);
console.log('total allocations:', alloc.length);
console.log('port ranges:', ranges.map((r) => (r[0] === r[1] ? String(r[0]) : `${r[0]}-${r[1]}`)).join(', '));
console.log('ports >= 30000 (inside the published DNAT 30000-39999):', ports.filter((p) => p >= 30000).length);
console.log('ports < 30000 (NOT published):', ports.filter((p) => p < 30000).length);
console.log('unassigned:', free.length, '| unassigned >= 30000:', free.filter((a) => a.port >= 30000).length, '| unassigned < 30000:', free.filter((a) => a.port < 30000).length);

const fs = await import('node:fs');
for (const f of ['/app/alloc-ports.mjs', '/app/zz-alloc-ports.mjs', '/app/zz-selfclean.mjs']) {
  try { fs.unlinkSync(f); console.log('removed', f); } catch { /* not there */ }
}
process.exit(0);
