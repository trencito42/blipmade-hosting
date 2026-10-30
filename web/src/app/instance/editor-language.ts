/** The language of a file of an instance, for the editor. It is apart from the editor so the page can name a language without loading the editor. */

export type EditorLanguage = 'json' | 'yaml' | 'javascript' | 'properties' | 'text';

/** The language of a file, read from its name. */
export function languageOf(name: string): EditorLanguage {
  if (/\.json5?$/i.test(name)) return 'json';
  if (/\.ya?ml$/i.test(name)) return 'yaml';
  if (/\.(m?js|cjs|jsx|tsx?)$/i.test(name)) return 'javascript';
  if (/\.(properties|cfg|conf|ini|env|toml|txt)$/i.test(name) || /^\./.test(name)) return 'properties';
  return 'text';
}

/** The words a reader sees for a language. */
export const LANGUAGE_LABEL: Record<EditorLanguage, string> = {
  json: 'JSON',
  yaml: 'YAML',
  javascript: 'JavaScript',
  properties: 'Settings',
  text: 'Plain text',
};

