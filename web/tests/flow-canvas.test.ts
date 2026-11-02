/**
 * The map of the bots, checked without a screen: where the blocks are put when the operator has not moved them.
 *
 *     node --test web/tests/
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
let server: ViteDevServer;
let autoLayout: (flow: { start: string; nodes: Record<string, Record<string, unknown>> }) => Record<string, { x: number; y: number }>;

before(async () => {
  server = await createServer({ root: webRoot, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  autoLayout = ((await server.ssrLoadModule('/src/admin/FlowCanvas.tsx')) as { autoLayout: typeof autoLayout }).autoLayout;
});
after(async () => {
  await server.close();
});

describe('the automatic layout of a flow', () => {
  const flow = {
    start: 'menu',
    nodes: {
      menu: { type: 'buttons', text: 'Pick', options: [{ id: 'a', label: 'A', next: 'one' }, { id: 'b', label: 'B', next: 'two' }] },
      one: { type: 'message', text: 'one', next: 'bye' },
      two: { type: 'message', text: 'two', next: 'bye' },
      bye: { type: 'end' },
      lost: { type: 'end' },
    },
  };

  it('puts each block one column after the block that leads to it', () => {
    const layout = autoLayout(flow);
    assert.equal(layout.menu!.x, 0);
    assert.ok(layout.one!.x > layout.menu!.x);
    assert.equal(layout.one!.x, layout.two!.x);
    assert.ok(layout.bye!.x > layout.one!.x);
  });

  it('puts blocks of one column in different rows, so no two cards overlap', () => {
    const layout = autoLayout(flow);
    assert.notEqual(layout.one!.y, layout.two!.y);
    const seen = new Set(Object.values(layout).map((pos) => `${pos.x}:${pos.y}`));
    assert.equal(seen.size, Object.keys(flow.nodes).length);
  });

  it('puts a block that cannot be reached in a column of its own, after the others', () => {
    const layout = autoLayout(flow);
    assert.ok(layout.lost!.x > layout.bye!.x);
  });

  it('copes with a flow that loops back and with a connection to a block that does not exist', () => {
    const looping = { start: 'q', nodes: { q: { type: 'buttons', text: 'x', options: [{ id: 'a', label: 'A', next: 'q' }, { id: 'b', label: 'B', next: 'ghost' }] } } };
    assert.deepEqual(Object.keys(autoLayout(looping)), ['q']);
  });
});
