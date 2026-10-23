import { listAllocations } from './services/pterodactyl/application.js';
const alloc = await listAllocations(1);
const ports = alloc.map(a => a.port).sort((a,b)=>a-b);
const ranges = [];
for (const p of ports) {
  const last = ranges[ranges.length-1];
  if (last && p === last[1] + 1) last[1] = p; else ranges.push([p,p]);
}
console.log('total allocations:', alloc.length);
console.log('port ranges:', ranges.map(r=>r[0]===r[1]?`${r[0]}`:`${r[0]}-${r[1]}`).join(', '));
const ge30000 = ports.filter(p=>p>=30000).length;
const lt30000 = ports.filter(p=>p<30000).length;
console.log('ports >= 30000 (published in DNAT 30000-39999):', ge30000);
console.log('ports < 30000 (NOT published):', lt30000);
const free = alloc.filter(a=>!a.assigned);
const freePreferred = free.filter(a=>a.port>=30000);
const freeBelow = free.filter(a=>a.port<30000);
console.log('unassigned total:', free.length, '| unassigned >=30000:', freePreferred.length, '| unassigned <30000:', freeBelow.length);
