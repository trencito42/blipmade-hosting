import { describe, expect, it } from 'vitest';
import { planStartupChange, type EggStartupInfo } from '../src/services/startup-settings.js';

const info: EggStartupInfo = {
  variables: [
    { key: 'MAIN_FILE', name: 'Main file', description: '', defaultValue: 'index.js', viewable: true, editable: true },
    { key: 'PORT', name: 'Port', description: '', defaultValue: '3000', viewable: true, editable: false },
  ],
  images: { 'Node 22': 'img:22', 'Node 25': 'img:25' },
};
const current = { image: 'img:22', command: 'node {{MAIN_FILE}}', environment: { MAIN_FILE: 'index.js', PORT: '3000', P_SERVER_UUID: 'x' } };

describe('planStartupChange', () => {
  it('changes an editable variable and keeps the rest', () => {
    const plan = planStartupChange(info, current, { environment: { MAIN_FILE: 'app.js' } });
    expect(plan.environment).toEqual({ MAIN_FILE: 'app.js', PORT: '3000', P_SERVER_UUID: 'x' });
    expect(plan.image).toBeUndefined();
  });
  it('refuses a variable that is not editable or unknown', () => {
    expect(() => planStartupChange(info, current, { environment: { PORT: '1' } })).toThrow(/PORT/);
    expect(() => planStartupChange(info, current, { environment: { MY_KEY: 'a' } })).toThrow(/MY_KEY/);
    expect(() => planStartupChange(info, current, { environment: { P_SERVER_UUID: 'y' } })).toThrow(/P_SERVER_UUID/);
  });
  it('lets an unchanged value through', () => {
    expect(() => planStartupChange(info, current, { environment: { PORT: '3000' } })).not.toThrow();
  });
  it('takes an image only from the egg', () => {
    expect(planStartupChange(info, current, { image: 'img:25' }).image).toBe('img:25');
    expect(() => planStartupChange(info, current, { image: 'evil/miner' })).toThrow(/not one/);
  });
  it('does not change the command', () => {
    expect(() => planStartupChange(info, current, { command: 'sh' })).toThrow(/command/);
    expect(() => planStartupChange(info, current, { command: current.command })).not.toThrow();
  });
});
