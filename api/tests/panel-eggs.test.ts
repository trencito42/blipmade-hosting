import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The eggs of the panel and the environment the platform writes.
 *
 * The panel refuses a server whose environment does not carry every variable
 * of the egg, and it refuses a value that breaks the rule of the variable.
 * The platform therefore holds a template for every egg it uses, and the
 * template has to carry exactly the variables of the egg.
 *
 * The eggs are the official files of Pterodactyl, kept in `pterodactyl-eggs`.
 * The test reads those files, so the template and the file cannot drift
 * apart: an egg that is updated and a template that is not are caught here
 * instead of in front of a customer.
 */

const ROOT = resolve(process.cwd(), '..');

interface EggVariable {
  name: string;
  env_variable: string;
  default_value: string;
  rules: string;
  user_editable: boolean;
  user_viewable: boolean;
}

interface EggFile {
  name: string;
  description: string;
  meta?: { version?: string; update_url?: string | null };
  docker_images: Record<string, string>;
  startup: string;
  scripts?: { installation?: { script?: string; container?: string; entrypoint?: string } };
  variables?: EggVariable[];
}

const EGGS = ['postgres16.json', 'code-server.json', 'uptime-kuma.json'];

/** The egg of the panel that the product of the catalog names. */
const PRODUCTS = [
  { slug: 'postgresql', egg: 'Postgres 16', file: 'postgres16.json' },
  { slug: 'code-server', egg: 'Code-Server', file: 'code-server.json' },
  { slug: 'uptime-kuma', egg: 'Uptime Kuma', file: 'uptime-kuma.json' },
];

async function readEgg(file: string): Promise<EggFile> {
  const raw = await readFile(join(ROOT, 'pterodactyl-eggs', file), 'utf-8');
  return JSON.parse(raw) as EggFile;
}

/**
 * Checks a value against the rule of an egg variable.
 *
 * The rules of the eggs are written as the rules of Laravel: `required`,
 * `string`, `max:20`, `boolean` and `nullable`. Only the ones the eggs of the
 * platform use are checked here.
 */
function breaksRule(value: string, rules: string): string | null {
  const parts = rules.split('|').map((part) => part.trim());
  if (parts.includes('required') && value === '') return 'the value is empty';
  if (parts.includes('string') && typeof value !== 'string') return 'the value is not a string';
  const max = parts.find((part) => part.startsWith('max:'));
  if (max && value.length > Number(max.slice(4))) {
    return `the value is longer than ${max.slice(4)} characters`;
  }
  if (parts.includes('boolean') && !['0', '1', 'true', 'false'].includes(value)) {
    return 'the value is not a boolean';
  }
  return null;
}

const { EGG_ENVIRONMENT_TEMPLATES } = await import('../src/services/pterodactyl/application.js');

describe('the eggs of the panel', () => {
  it('are in the format the panel reads', async () => {
    for (const file of EGGS) {
      const egg = await readEgg(file);
      // The panel refuses a file whose version it does not know.
      expect(['PTDL_v1', 'PTDL_v2'], `${file} must be a file the panel reads`).toContain(egg.meta?.version);
      expect(egg.name, `${file} must name the egg`).toBeTruthy();
      expect(Object.keys(egg.docker_images).length, `${file} must carry an image`).toBeGreaterThan(0);
      expect(egg.startup, `${file} must carry a startup command`).toBeTruthy();
      expect(egg.scripts?.installation?.script, `${file} must carry an installation script`).toBeTruthy();
    }
  });

  it('are the eggs the products of the catalog name', async () => {
    const seed = await readFile(join(ROOT, 'api', 'prisma', 'seed.ts'), 'utf-8');
    for (const product of PRODUCTS) {
      const egg = await readEgg(product.file);
      expect(egg.name, `the file ${product.file} must hold the egg ${product.egg}`).toBe(product.egg);
      // The catalog names the egg, so the number the panel gives it does not
      // matter.
      expect(seed, `the product ${product.slug} must name the egg ${product.egg}`).toContain(
        `eggName: '${product.egg}'`,
      );
    }
  });
});

describe('the environment the platform writes for an egg', () => {
  it('carries exactly the variables of the egg', async () => {
    for (const file of EGGS) {
      const egg = await readEgg(file);
      const template = EGG_ENVIRONMENT_TEMPLATES[egg.name.trim().toLowerCase()];
      expect(template, `the platform must know the template of ${egg.name}`).toBeTruthy();

      const expected = (egg.variables ?? []).map((variable) => variable.env_variable).sort();
      expect(
        Object.keys(template!).sort(),
        `the template of ${egg.name} must carry the variables of the egg and nothing else`,
      ).toEqual(expected);
    }
  });

  it('carries values the egg accepts', async () => {
    for (const file of EGGS) {
      const egg = await readEgg(file);
      const template = EGG_ENVIRONMENT_TEMPLATES[egg.name.trim().toLowerCase()] ?? {};
      for (const variable of egg.variables ?? []) {
        const value = template[variable.env_variable];
        expect(value, `${egg.name} must write ${variable.env_variable}`).toBeTypeOf('string');
        expect(breaksRule(value!, variable.rules), `${egg.name}: ${variable.env_variable}`).toBeNull();
      }
    }
  });

  it('makes a password that the egg accepts', async () => {
    // The password of the database and the password of the editor are made
    // for every instance, and they have to fit the rule of the egg: the panel
    // refuses a server whose value is too long.
    const { generateVariables } = await import('../src/services/instance-credentials.js');
    const cases = [
      { file: 'postgres16.json', variable: 'PGPASSWORD' },
      { file: 'code-server.json', variable: 'PASSWORD' },
    ];
    for (const entry of cases) {
      const egg = await readEgg(entry.file);
      const variable = (egg.variables ?? []).find((candidate) => candidate.env_variable === entry.variable);
      expect(variable, `${egg.name} must have the variable ${entry.variable}`).toBeTruthy();

      const values = generateVariables({ [entry.variable]: { length: 20 } });
      expect(breaksRule(values[entry.variable]!, variable!.rules), `${egg.name}: ${entry.variable}`).toBeNull();
    }
  });
});
