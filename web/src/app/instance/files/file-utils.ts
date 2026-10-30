import type { IconName } from '../../../icons';

/**
 * What the file manager knows about a file from its name.
 *
 * The kind decides how a file opens: text in the editor, an image or a video
 * as a preview, an archive with the way to extract it, and anything else as a
 * file that can only be downloaded.
 */
export type FileKind = 'text' | 'image' | 'pdf' | 'video' | 'audio' | 'archive' | 'binary';

const ARCHIVES = ['zip', 'gz', 'tgz', 'tar', 'rar', '7z', 'bz2', 'xz'];
const IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp'];
const VIDEOS = ['mp4', 'webm', 'mov', 'm4v'];
const AUDIOS = ['mp3', 'ogg', 'wav', 'm4a', 'flac'];
const BINARIES = ['jar', 'war', 'class', 'exe', 'dll', 'so', 'bin', 'dat', 'db', 'sqlite', 'mca', 'nbt', 'woff', 'woff2', 'ttf', 'otf', 'pak', 'vpk', 'mkv', 'avi'];
const CODE = ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'yml', 'yaml', 'py', 'sh', 'lua', 'php', 'java', 'go', 'rs', 'html', 'css', 'toml', 'xml', 'sql'];
const DOCS = ['txt', 'md', 'log', 'cfg', 'conf', 'ini', 'properties', 'env'];

export function extensionOf(name: string): string {
  const cut = name.lastIndexOf('.');
  return cut <= 0 ? '' : name.slice(cut + 1).toLowerCase();
}

export function kindOf(name: string): FileKind {
  const extension = extensionOf(name);
  if (ARCHIVES.includes(extension)) return 'archive';
  if (IMAGES.includes(extension)) return 'image';
  if (extension === 'pdf') return 'pdf';
  if (VIDEOS.includes(extension)) return 'video';
  if (AUDIOS.includes(extension)) return 'audio';
  if (BINARIES.includes(extension)) return 'binary';
  return 'text';
}

/** The type the browser needs to show a preview of the file. */
export function previewMime(name: string): string | null {
  const extension = extensionOf(name);
  const table: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
    svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp', pdf: 'application/pdf',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac',
  };
  return table[extension] ?? null;
}

/** The icon of a file, from its name. */
export function iconOfFile(name: string): IconName {
  const extension = extensionOf(name);
  if (ARCHIVES.includes(extension) || extension === 'jar') return 'fileZip';
  if (IMAGES.includes(extension)) return 'fileImage';
  if (CODE.includes(extension)) return 'fileCode';
  if (extension === 'pdf') return 'filePdf';
  if (DOCS.includes(extension)) return 'doc';
  return 'file';
}

/**
 * True when the content of a file is not text.
 *
 * The node may send the bytes of a binary file as base64 and call them text,
 * so the content is looked at as well as the name.
 */
export function looksBinary(name: string, content: string): boolean {
  if (kindOf(name) !== 'text') return true;
  if (content.includes('\u0000')) return true;
  return content.length > 400 && /^[A-Za-z0-9+/=]+$/.test(content.slice(0, 400)) && !content.slice(0, 400).includes(' ');
}

/** Text files are editable, base64 is decoded when it is text. */
export function decodeContent(content: string, encoding: string): { text: string; binary: boolean } {
  const kind = (encoding || '').toLowerCase();
  if (!kind || kind === 'utf8' || kind === 'utf-8') return { text: content, binary: false };
  if (kind === 'base64') {
    try {
      const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), binary: false };
    } catch {
      return { text: '', binary: true };
    }
  }
  return { text: content, binary: false };
}

/** Puts a downloaded file on the disk of the browser. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** A name that is not in the folder yet: "a.txt" becomes "a copy.txt", then "a copy 2.txt". */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const cut = name.lastIndexOf('.');
  const stem = cut > 0 ? name.slice(0, cut) : name;
  const extension = cut > 0 ? name.slice(cut) : '';
  let candidate = `${stem} copy${extension}`;
  for (let index = 2; taken.has(candidate); index += 1) candidate = `${stem} copy ${index}${extension}`;
  return candidate;
}

/** True when `path` is `folder` or lives inside it. */
export function isInside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder.endsWith('/') ? folder : `${folder}/`);
}
