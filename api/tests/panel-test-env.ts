import type { env as Env } from '../src/env.js';

/** The panel fields the client reads from the shared env object. */
type PanelEnv = {
  PTERODACTYL_URL: string;
  PTERODACTYL_APP_KEY: string;
  pterodactylEnabled: boolean;
};

/**
 * The env object is frozen in its type because production code only reads it.
 * The panel client already holds that object when a test starts, so the test
 * has to change the fields the client will read.
 */
export function panelEnv(target: typeof Env): PanelEnv {
  return target as PanelEnv;
}
