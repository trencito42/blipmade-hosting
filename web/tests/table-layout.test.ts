/**
 * The layout of the tables.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * A table that works has one description of its columns, and the header and
 * the cells of a column are built from it. These tests check that the classes
 * of the header and of the cells of a column agree, so the header can never
 * drift away from the column below it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { alignClass, cellClass, headerClass, type TableColumn } from '../src/lib/table.ts';

function column(overrides: Partial<TableColumn<unknown>> = {}): TableColumn<unknown> {
  return {
    key: 'total',
    header: 'Total',
    render: () => null,
    ...overrides,
  };
}

test('the header and the cell of a column are aligned the same way', () => {
  for (const align of ['left', 'right', 'center'] as const) {
    const col = column({ align });
    assert.ok(headerClass(col).includes(alignClass(align)));
    assert.ok(cellClass(col, 0, 3).includes(alignClass(align)));
  }
});

test('a column without an alignment is on the left', () => {
  assert.equal(alignClass(undefined), 'text-left');
  assert.ok(headerClass(column()).includes('text-left'));
  assert.ok(cellClass(column(), 0, 3).includes('text-left'));
});

test('a number, a date or a state stays on one line in the header and in the cell', () => {
  const col = column({ nowrap: true });
  assert.ok(headerClass(col).includes('whitespace-nowrap'));
  assert.ok(cellClass(col, 0, 3).includes('whitespace-nowrap'));
});

test('a long value is cut in the cell and not in the header', () => {
  const col = column({ truncate: true });
  assert.ok(!headerClass(col).includes('truncate'));
  assert.ok(cellClass(col, 0, 3).includes('truncate'));
  assert.ok(cellClass(col, 0, 3).includes('max-w-0'));
});

test('the rows are divided by a line and are not cards', () => {
  const col = column();
  for (const index of [0, 1, 2]) {
    const cell = cellClass(col, index, 3);
    // A line above every cell of a row; the table takes it away from the first row, so none is under the last.
    assert.ok(cell.includes('border-t'));
    assert.ok(cell.includes('border-line'));
    assert.ok(!cell.includes('rounded-l-2xl'));
    assert.ok(!cell.includes('rounded-r-2xl'));
    assert.ok(!cell.includes('bg-card'));
  }
});

test('the extra classes of a column reach the cell and not the header', () => {
  const col = column({ className: 'tabular-nums' });
  assert.ok(cellClass(col, 0, 3).includes('tabular-nums'));
  assert.ok(!headerClass(col).includes('tabular-nums'));
});

test('a header that is only read by a screen reader stays out of sight', () => {
  const col = column({ srOnlyHeader: true });
  assert.ok(headerClass(col).includes('sr-only'));
  assert.ok(!cellClass(col, 0, 1).includes('sr-only'));
});
