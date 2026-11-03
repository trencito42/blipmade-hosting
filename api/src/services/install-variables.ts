/**
 * Git install variables are filled by the egg or by a stored import.
 * A quote must not demand them again. An empty repository is a file upload, not a fake URL.
 */

export const INSTALLATION_VARIABLES = ['GIT_ADDRESS', 'BRANCH', 'USERNAME', 'ACCESS_TOKEN', 'USER_UPLOAD'] as const;

const INSTALLATION = new Set<string>(INSTALLATION_VARIABLES);

export function installationVariable(name: string): boolean {
  return INSTALLATION.has(name);
}

/** A quote does not require an installation variable. The egg allows it to be empty. */
export function checkoutSpecs<T extends { required?: boolean }>(specs: Record<string, T>): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [name, spec] of Object.entries(specs)) {
    next[name] = installationVariable(name) ? { ...spec, required: false } : spec;
  }
  return next;
}

export interface StoredImportRef {
  kind: string;
  repoUrl: string | null;
  branch: string | null;
}

/**
 * Puts the repository the customer already gave onto the egg, or marks the install as an upload.
 * A managed import is not asked for the URL a second time, and no placeholder URL is invented.
 */
export function applyInstallVariables(
  environment: Record<string, string>,
  source: StoredImportRef | null,
): Record<string, string> {
  if (!('GIT_ADDRESS' in environment) && !('USER_UPLOAD' in environment)) return environment;
  const next = { ...environment };
  if (source?.kind === 'git' && source.repoUrl) {
    next.GIT_ADDRESS = source.repoUrl;
    if (source.branch && 'BRANCH' in next) next.BRANCH = source.branch;
    if ('USER_UPLOAD' in next) next.USER_UPLOAD = '0';
    return next;
  }
  if (!next.GIT_ADDRESS && 'USER_UPLOAD' in next) next.USER_UPLOAD = '1';
  return next;
}
