/**
 * Checks that the environment template of the egg resolves now.
 *
 * It calls the function of the platform itself, so the check proves the same
 * thing the provisioning does. Nothing is written.
 */
import { eggEnvironmentTemplate } from '/opt/blipmade/api/src/services/pterodactyl/application.js';

const eggId = Number(process.argv[2] ?? 15);

async function main() {
  const template = await eggEnvironmentTemplate(eggId);
  const keys = Object.keys(template).sort();
  console.log(`OK: the template of egg ${eggId} resolves.`);
  console.log(`   variables: ${keys.length} -> ${keys.join(', ')}`);
  for (const [key, value] of Object.entries(template)) {
    const shown = key.toUpperCase().includes('TOKEN') || key.toUpperCase().includes('PASSWORD')
      ? '(hidden)'
      : String(value);
    console.log(`   ${key} = ${shown}`);
  }
  const leaked = keys.filter((k) => k.startsWith('P_SERVER_'));
  console.log(`   per-server variables that must not be in a template: ${leaked.length}`);
}

main().catch((error) => {
  console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
