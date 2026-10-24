/**
 * The types of the compressed forms of the built site.
 *
 * The file itself is plain JavaScript, so that the server and the build can
 * read it without a compiler. This declaration says what it offers.
 */

export interface CompressedFile {
  /** The file that was compressed. */
  file: string;
  /** The size of the original, in bytes. */
  raw: number;
  /** The size of the gzip form, in bytes. */
  gzip: number;
  /** The size of the brotli form, in bytes. */
  brotli: number;
}

export declare const COMPRESSIBLE_EXTENSIONS: Set<string>;
export declare const ENCODING_SUFFIXES: { gzip: string; br: string };

export declare function precompressFile(file: string): CompressedFile;
export declare function precompressDirectory(directory: string): CompressedFile[];
export declare function precompressSite(directory: string): CompressedFile[];
export declare function precompressBuild(root: string, outDir: string): CompressedFile[];
export declare function sizeOf(file: string): number;
