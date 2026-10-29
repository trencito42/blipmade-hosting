import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fillRequiredVariables,
  generatedValueForVariable,
} from '../src/services/pterodactyl/environment.js';

/**
 * The environment of the instances of the platform.
 *
 * The panel builds the environment of a container out of the variables of the
 * egg and nothing else: a key that the egg does not know never reaches the
 * container. The panel also refuses to create a server whose variable is
 * marked as required and left empty. The eggs of the games ask for such a
 * variable and give it no value: the token of the server of Unturned is the
 * one, and the server of that game was refused with "The GSLT variable field
 * is required" before it ever started.
 *
 * The platform therefore makes the value of the variables that have to be
 * filled, the same way it makes the passwords of the products it sells.
 */

describe('the values made for the variables of an egg', () => {
  it('makes a number for the token of a Steam server', () => {
    const value = generatedValueForVariable('GSLT');
    expect(value).toMatch(/^\d{10}$/);
  });

  it('makes a long text for a secret', () => {
    const value = generatedValueForVariable('SERVICE_PASSWORD');
    expect(value).toHaveLength(20);
    expect(value).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('makes a short text for anything else', () => {
    const value = generatedValueForVariable('SERVERNAME');
    expect(value).toHaveLength(12);
  });

  it('makes a different value every time', () => {
    const values = new Set(Array.from({ length: 20 }, () => generatedValueForVariable('SERVICE_PASSWORD')));
    expect(values.size).toBe(20);
  });
});

describe('the environment of an instance', () => {
  const specs = [
    { env_variable: 'SERVER_JARFILE', default_value: 'server.jar', rules: 'required|regex:/^([\\w\\d._-]+)(\\.jar)$/' },
    { env_variable: 'GSLT', default_value: null, rules: 'required|string|max:20' },
    { env_variable: 'SERVERNAME', default_value: 'Bedrock Dedicated Server', rules: 'required|string|max:50' },
    { env_variable: 'DL_PATH', default_value: '', rules: 'nullable|string' },
  ];

  it('fills a variable that has to be filled and that is empty', () => {
    const environment = fillRequiredVariables({ SERVER_JARFILE: 'server.jar', GSLT: '' }, specs);
    expect(environment.GSLT).toMatch(/^\d{10}$/);
  });

  it('leaves a value that is already there', () => {
    const environment = fillRequiredVariables({ GSLT: '1234567890' }, specs);
    expect(environment.GSLT).toBe('1234567890');
  });

  it('leaves a variable that does not have to be filled alone', () => {
    const environment = fillRequiredVariables({ DL_PATH: '' }, specs);
    expect(environment.DL_PATH).toBe('');
  });

  it('does not touch the environment it is given', () => {
    const environment = { GSLT: '' };
    fillRequiredVariables(environment, specs);
    expect(environment.GSLT).toBe('');
  });
});

describe('the eggs of Minecraft', () => {
  const dir = path.resolve(__dirname, '../../pterodactyl-eggs');

  it('carry the variable of the EULA', async () => {
    const files = (await readdir(dir)).filter((file) => file.endsWith('.json') && file !== 'manifest.json');
    const eggs = await Promise.all(
      files.map(async (file) => JSON.parse(await readFile(path.join(dir, file), 'utf-8'))),
    );
    const minecraft = eggs.filter((egg) => Array.isArray(egg.features) && egg.features.includes('eula'));
    expect(minecraft.length).toBeGreaterThan(0);

    for (const egg of minecraft) {
      const eula = egg.variables.find((variable: { env_variable: string }) => variable.env_variable === 'EULA');
      expect(eula, `${egg.name} has no EULA variable`).toBeTruthy();
      expect(eula.default_value).toBe('TRUE');
      expect(egg.scripts.installation.script).toContain('eula.txt');
    }
  });
});
