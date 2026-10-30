/**
 * The colours and the styles of a line of console output.
 *
 * The console of a server writes the escape sequences of a terminal: colours
 * for the level of a log line, bold for a name. A page that shows them as they
 * are shows `[32m` in the middle of the text. This reads the sequences that
 * set a colour or a style and drops every other one, so a line is a list of
 * pieces of text, each with the style it was written in.
 */

export interface AnsiStyle {
  color?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}

export interface AnsiPiece {
  text: string;
  style: AnsiStyle;
}

/** The sixteen colours of a terminal, tuned for the dark console of the platform. */
const BASIC = [
  '#5b6b60', '#ff8f86', '#4ee595', '#f0b232', '#6aa8ff', '#c792ea', '#5fd4d4', '#d7e0d9',
  '#8c988f', '#ffaba4', '#7af0b0', '#ffd06b', '#8dc0ff', '#dbb0f5', '#8ae6e6', '#ffffff',
];

/** The colour of an entry of the 256 colour table. */
function indexed(n: number): string | undefined {
  if (n < 0 || n > 255) return undefined;
  if (n < 16) return BASIC[n];
  if (n >= 232) {
    const level = 8 + (n - 232) * 10;
    return `rgb(${level}, ${level}, ${level})`;
  }
  const cube = n - 16;
  const step = (value: number) => (value === 0 ? 0 : 55 + value * 40);
  return `rgb(${step(Math.floor(cube / 36))}, ${step(Math.floor((cube % 36) / 6))}, ${step(cube % 6)})`;
}

/** Applies the parameters of one sequence that sets a style. */
function apply(style: AnsiStyle, codes: number[]): AnsiStyle {
  let next = { ...style };
  for (let i = 0; i < codes.length; i += 1) {
    const code = codes[i]!;
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 4) next.underline = true;
    else if (code === 22) {
      next.bold = false;
      next.dim = false;
    } else if (code === 24) next.underline = false;
    else if (code >= 30 && code <= 37) next.color = BASIC[code - 30];
    else if (code >= 90 && code <= 97) next.color = BASIC[code - 90 + 8];
    else if (code === 39) next.color = undefined;
    else if (code === 38) {
      if (codes[i + 1] === 5) {
        next.color = indexed(codes[i + 2] ?? -1);
        i += 2;
      } else if (codes[i + 1] === 2) {
        next.color = `rgb(${codes[i + 2] ?? 0}, ${codes[i + 3] ?? 0}, ${codes[i + 4] ?? 0})`;
        i += 4;
      }
    }
  }
  return next;
}

// Every escape sequence a terminal can send: the ones that set a style end in
// `m`, the others move the cursor or clear the screen, and a line of a log has
// no use for them.
// eslint-disable-next-line no-control-regex
const SEQUENCE = /\u001b(?:\[([0-9;]*)([A-Za-z])|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[()][A-Za-z0-9])/g;

/** Splits a line into pieces of text with their style. */
export function parseAnsi(line: string, start: AnsiStyle = {}): { pieces: AnsiPiece[]; style: AnsiStyle } {
  const pieces: AnsiPiece[] = [];
  let style = start;
  let last = 0;
  SEQUENCE.lastIndex = 0;
  for (let match = SEQUENCE.exec(line); match; match = SEQUENCE.exec(line)) {
    if (match.index > last) pieces.push({ text: line.slice(last, match.index), style });
    last = match.index + match[0].length;
    if (match[2] === 'm') style = apply(style, (match[1] || '0').split(';').map((part) => Number(part || 0)));
  }
  if (last < line.length) pieces.push({ text: line.slice(last), style });
  return { pieces, style };
}

/** The text of a line without its sequences, for copying and downloading. */
export function stripAnsi(line: string): string {
  return line.replace(SEQUENCE, '');
}
