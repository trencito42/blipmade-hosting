/**
 * The compressed forms of the built site.
 *
 * The site is built once and then served many times, so the bytes that are
 * sent over and over are compressed once, here, when the build is finished.
 * The server then only picks the file that matches what the client accepts:
 * the cost of a request is a read of the disk and a write of the socket, not a
 * compression.
 *
 * The machine that serves the site is small, and the compression of a 300 kB
 * bundle costs it far more CPU than the delivery of the result. That is the
 * whole reason this file exists.
 *
 * The forms are written next to the file they come from, with the suffix of
 * the encoding (`index.js.gz`, `index.js.br`). This is the convention that
 * every server and every cache understands.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/**
 * The files that are worth compressing.
 *
 * The list holds the extensions of text. The pictures and the fonts are left
 * alone: they are already compressed, and compressing them again costs CPU and
 * makes the file bigger.
 */
export const COMPRESSIBLE_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.map',
  '.svg',
  '.txt',
  '.webmanifest',
]);

/** The suffix of every form that is written. */
export const ENCODING_SUFFIXES = { gzip: '.gz', br: '.br' };

/**
 * The quality of the compression.
 *
 * The files are compressed once, so the quality is the highest one that
 * `zlib` offers: every byte that is saved is saved for every visitor, for the
 * whole life of the build.
 */
const GZIP_LEVEL = 9;
const BROTLI_QUALITY = 11;

/**
 * Compresses one file and writes both of its forms.
 *
 * The two forms are written next to the file, so the server finds them by
 * name. The answer says what was written and how big the forms are.
 */
export function precompressFile(file) {
  const bytes = readFileSync(file);
  const gzip = gzipSync(bytes, { level: GZIP_LEVEL });
  const brotli = brotliCompressSync(bytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  });
  writeFileSync(file + ENCODING_SUFFIXES.gzip, gzip);
  writeFileSync(file + ENCODING_SUFFIXES.br, brotli);
  return { file, raw: bytes.length, gzip: gzip.length, brotli: brotli.length };
}

/**
 * Compresses every file of a directory that is worth compressing.
 *
 * The walk does not follow the forms it has just written: a file whose name
 * ends in `.gz` or `.br` is not in the list of extensions, so it is left
 * alone.
 */
export function precompressDirectory(directory) {
  const written = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!COMPRESSIBLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      written.push(precompressFile(path));
    }
  };
  walk(directory);
  return written;
}

/**
 * Compresses the built site and says what it did.
 *
 * The build says it out loud, so the size of the delivery is visible in the
 * log of the build and not only in the bytes on the wire.
 */
export function precompressSite(directory) {
  if (!existsSync(directory)) return [];
  const written = precompressDirectory(directory);
  const raw = written.reduce((sum, entry) => sum + entry.raw, 0);
  const gzip = written.reduce((sum, entry) => sum + entry.gzip, 0);
  const brotli = written.reduce((sum, entry) => sum + entry.brotli, 0);
  console.log(
    `Compressed ${written.length} files: ${(raw / 1024).toFixed(1)} kB raw, ` +
      `${(gzip / 1024).toFixed(1)} kB gzip, ${(brotli / 1024).toFixed(1)} kB brotli.`,
  );
  return written;
}

/** The size of a file, or zero when the file is not there. */
export function sizeOf(file) {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

/**
 * Compresses the site that the build has written.
 *
 * The build says where it writes, the helper says what to compress. The path
 * of the output is worked out here, so the build script does not have to know
 * anything about the disk.
 */
export function precompressBuild(root, outDir) {
  return precompressSite(resolve(root, outDir));
}
