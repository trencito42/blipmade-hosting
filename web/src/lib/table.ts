import type { ReactNode } from 'react';

/**
 * The columns of a table.
 *
 * A column is described once and used twice: for the header and for the
 * cells. The width, the alignment, the line breaks and the cut of a long
 * value are therefore the same in both, and the columns of the header always
 * stand on the columns of the rows.
 */
export interface TableColumn<T> {
  /** The identity of the column. It is used for the key of the cells. */
  key: string;
  /** The name of the column, read by everyone. */
  header: string;
  /** The content of the cell of a row. */
  render: (row: T) => ReactNode;
  /**
   * The width of the column, as a CSS width. It is the same for the header
   * and for the cells, so the columns cannot drift apart.
   */
  width?: string;
  /** The alignment of the column. */
  align?: 'left' | 'right' | 'center';
  /** A number, a date or a state stays on one line. */
  nowrap?: boolean;
  /**
   * A long value is cut with an ellipsis. The full value stays in the title
   * of the cell, so nothing is lost.
   */
  truncate?: boolean;
  /** The header is only read by a screen reader. */
  srOnlyHeader?: boolean;
  /** Extra classes for the cell of the body. */
  className?: string;
}

/** The alignment of a column, as a class. */
export function alignClass(align: TableColumn<unknown>['align']): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

/**
 * The classes of the header of a column.
 *
 * The header is a header: it is never cut and it never wraps, so the row of
 * the headers always has the same height.
 */
export function headerClass<T>(column: TableColumn<T>): string {
  return [
    'px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3',
    alignClass(column.align),
    column.nowrap ? 'whitespace-nowrap' : '',
    column.srOnlyHeader ? 'sr-only' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The classes of the cell of a column.
 *
 * The first and the last cell of a row carry the rounded ends of the row, so
 * the row is a card without the row itself being a box: the cells keep the
 * layout of a table.
 */
export function cellClass<T>(column: TableColumn<T>, index: number, total: number): string {
  return [
    'px-3 py-3 align-middle text-[14px] text-ink',
    'bg-s2',
    index === 0 ? 'rounded-l-2xl' : '',
    index === total - 1 ? 'rounded-r-2xl' : '',
    alignClass(column.align),
    column.nowrap ? 'whitespace-nowrap' : '',
    column.truncate ? 'max-w-0 truncate' : '',
    column.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}
