import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAnsi, stripAnsi } from '../src/lib/ansi.ts';

describe('the output of the console', () => {
  it('keeps the text of a line that has no sequence', () => {
    assert.deepEqual(parseAnsi('Server started').pieces, [{ text: 'Server started', style: {} }]);
  });

  it('reads a colour and the reset that ends it', () => {
    const { pieces } = parseAnsi('\u001b[32mOK\u001b[0m done');
    assert.equal(pieces.length, 2);
    assert.equal(pieces[0]!.text, 'OK');
    assert.ok(pieces[0]!.style.color);
    assert.deepEqual(pieces[1], { text: ' done', style: {} });
  });

  it('reads bold and the 256 colour and the true colour forms', () => {
    assert.equal(parseAnsi('\u001b[1mA').pieces[0]!.style.bold, true);
    assert.ok(parseAnsi('\u001b[38;5;196mA').pieces[0]!.style.color?.startsWith('rgb('));
    assert.equal(parseAnsi('\u001b[38;2;1;2;3mA').pieces[0]!.style.color, 'rgb(1, 2, 3)');
  });

  it('drops the sequences that move the cursor or set a title', () => {
    assert.equal(stripAnsi('a\u001b[2K\u001b[1Ab\u001b]0;title\u0007c'), 'abc');
  });

  it('carries the style from one line to the next', () => {
    const first = parseAnsi('\u001b[31mred');
    const second = parseAnsi('still red', first.style);
    assert.equal(second.pieces[0]!.style.color, first.pieces[0]!.style.color);
  });
});
