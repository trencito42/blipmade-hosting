import { badRequest } from '../lib/errors.js';
import { applicationRequest } from './pterodactyl/application.js';

/**
 * What a customer may change in the startup of a server.
 *
 * The panel keeps the variables of the egg (the ones the app is meant to read) and a set of values it makes itself
 * (the id of the server, the memory, the startup command). A variable that the egg does not know is dropped by the
 * panel, so a "new variable" could never be saved. The customer sees and changes only the variables of the egg that
 * the egg marks as editable, picks the image from the images the egg offers, and does not change the command.
 * Their own variables go in a `.env` file in the files of the server.
 */

export interface EggVariable {
  key: string;
  name: string;
  description: string;
  defaultValue: string;
  viewable: boolean;
  editable: boolean;
}

export interface EggStartupInfo {
  variables: EggVariable[];
  /** Label to image. The images the egg offers. */
  images: Record<string, string>;
}

interface EggAttributes {
  docker_images?: Record<string, string>;
  relationships?: {
    variables?: {
      data?: {
        attributes: {
          env_variable: string;
          name?: string;
          description?: string;
          default_value?: string | null;
          user_viewable?: boolean;
          user_editable?: boolean;
        };
      }[];
    };
  };
}

/** The variables and the images of the egg of a server, as the panel states them. */
export async function readEggStartupInfo(nest: number, egg: number): Promise<EggStartupInfo> {
  const result = await applicationRequest<{ attributes: EggAttributes }>('GET', `/api/application/nests/${nest}/eggs/${egg}?include=variables`);
  const rows = result.attributes.relationships?.variables?.data ?? [];
  return {
    variables: rows.map((row) => ({
      key: row.attributes.env_variable,
      name: row.attributes.name ?? row.attributes.env_variable,
      description: row.attributes.description ?? '',
      defaultValue: row.attributes.default_value ?? '',
      viewable: row.attributes.user_viewable !== false,
      editable: row.attributes.user_editable !== false,
    })),
    images: result.attributes.docker_images ?? {},
  };
}

/** The variables the customer sees, with the value of the server. */
export function visibleVariables(info: EggStartupInfo, environment: Record<string, string>) {
  return info.variables
    .filter((variable) => variable.viewable)
    .map((variable) => ({
      key: variable.key,
      name: variable.name,
      description: variable.description,
      value: environment[variable.key] ?? variable.defaultValue,
      editable: variable.editable,
    }));
}

/**
 * The environment to send to the panel after the change the customer asked for. Refuses a variable that is not
 * editable, an image the egg does not offer and a new command. Pure, so the rule can be proved without a panel.
 */
export function planStartupChange(
  info: EggStartupInfo,
  current: { image: string; command: string; environment: Record<string, string> },
  body: { image?: string; command?: string; environment?: Record<string, string> },
): { image: string | undefined; environment: Record<string, string> } {
  const editable = new Set(info.variables.filter((variable) => variable.editable).map((variable) => variable.key));
  const refused: string[] = [];
  const environment = { ...current.environment };
  for (const [key, value] of Object.entries(body.environment ?? {})) {
    if (environment[key] === value) continue;
    if (!editable.has(key)) {
      refused.push(key);
      continue;
    }
    environment[key] = value;
  }
  if (refused.length > 0) {
    throw badRequest(`These variables cannot be changed here: ${refused.join(', ')}. Put your own variables in a .env file in the files of the server.`);
  }
  if (body.command !== undefined && body.command !== current.command) {
    throw badRequest('The startup command cannot be changed from here.');
  }
  let image: string | undefined;
  if (body.image !== undefined && body.image !== current.image) {
    if (!Object.values(info.images).includes(body.image)) throw badRequest('That image is not one this app offers. Pick one from the list.');
    image = body.image;
  }
  return { image, environment };
}
