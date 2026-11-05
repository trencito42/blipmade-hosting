/**
 * Writes the draft Minecraft plugin presets into the catalogue. Nothing is published and no product, price or server
 * is touched. Without --apply it only says what it would create.
 *
 *   npx tsx scripts/seed-draft-presets.ts          # dry run
 *   npx tsx scripts/seed-draft-presets.ts --apply  # writes the drafts
 */
import { prisma } from '../src/db.js';
import { ensureDraftPluginPresets } from '../src/services/catalog-drafts.js';

const apply = process.argv.includes('--apply');
const result = await ensureDraftPluginPresets(!apply);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...result }));
await prisma.$disconnect();
