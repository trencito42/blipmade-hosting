import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

/**
 * The shared library of the interface (`src/ui-app.tsx`).
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the file for us, the same way the build does. The markup is rendered on the
 * server, without a browser, which is enough to see the classes and the
 * attributes the components write.
 */

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

interface SharedUi {
  StatusPill: (props: { status: string; label?: string }) => unknown;
  ButtonLink: (props: Record<string, unknown>) => unknown;
  SoftButton: (props: Record<string, unknown>) => unknown;
  DangerButton: (props: Record<string, unknown>) => unknown;
  Segmented: (props: Record<string, unknown>) => unknown;
}

let ui: SharedUi;
let server: ViteDevServer;

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  ui = (await server.ssrLoadModule('/src/ui-app.tsx')) as SharedUi;
});

after(async () => {
  await server.close();
});

function render(element: unknown): string {
  return renderToStaticMarkup(element as never);
}

describe('StatusPill', () => {
  it('draws every state with the same size, so a status looks the same everywhere', () => {
    for (const status of ['active', 'failed', 'verified', 'current', 'unavailable', 'a_state_without_a_tone']) {
      const html = render(createElement(ui.StatusPill, { status }));
      assert.match(html, /rounded-full px-2\.5 py-1 text-\[12px\] font-bold/);
    }
  });

  it('paints the new states: a confirmed account and the current session are good news', () => {
    assert.match(render(createElement(ui.StatusPill, { status: 'verified' })), /bg-acc\/12 text-acc/);
    assert.match(render(createElement(ui.StatusPill, { status: 'current' })), /bg-acc\/12 text-acc/);
  });

  it('paints a state without a colour of its own like the neutral one', () => {
    assert.match(render(createElement(ui.StatusPill, { status: 'unavailable' })), /bg-s3 text-ink2/);
    assert.match(render(createElement(ui.StatusPill, { status: 'neutral' })), /bg-s3 text-ink2/);
  });

  it('keeps the colours of the states it already knew', () => {
    assert.match(render(createElement(ui.StatusPill, { status: 'active' })), /bg-acc\/12 text-acc/);
    assert.match(render(createElement(ui.StatusPill, { status: 'failed' })), /bg-bad\/12 text-bad/);
    assert.match(render(createElement(ui.StatusPill, { status: 'past_due' })), /bg-warn\/12 text-warn/);
  });

  it('writes the label of the caller and falls back to the state itself', () => {
    assert.match(render(createElement(ui.StatusPill, { status: 'current', label: 'This device' })), />This device</);
    assert.match(render(createElement(ui.StatusPill, { status: 'awaiting_customer' })), />awaiting customer</);
  });
});

describe('ButtonLink', () => {
  it('draws a route of the site as a link with the primary step of a button', () => {
    const html = render(createElement(ui.ButtonLink, { to: '/app/deploy' }, 'Deploy new'));
    assert.match(html, /^<a href="\/app\/deploy"/);
    assert.match(html, /h-11/);
    assert.match(html, /rounded-full/);
    assert.match(html, /bg-acc/);
    assert.match(html, /px-5/);
    assert.match(html, /text-\[14\.5px\]/);
    assert.match(html, />Deploy new</);
  });

  it('draws the soft step and the danger step with the same classes as the buttons', () => {
    const soft = render(createElement(ui.ButtonLink, { to: '/apps', variant: 'soft' }, 'Catalog'));
    assert.match(soft, /bg-s3/);
    assert.match(soft, /text-ink/);
    const danger = render(createElement(ui.ButtonLink, { to: '/apps', variant: 'danger' }, 'Delete'));
    assert.match(danger, /bg-bad\/12/);
    assert.match(danger, /text-bad/);
  });

  it('draws an address outside of the site as a plain link', () => {
    const html = render(
      createElement(
        ui.ButtonLink,
        { href: 'https://invoice.test/1', variant: 'soft', target: '_blank', rel: 'noreferrer noopener' },
        'Open invoice',
      ),
    );
    assert.match(html, /^<a href="https:\/\/invoice\.test\/1"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noreferrer noopener"/);
    assert.match(html, /bg-s3/);
  });

  it('adds the classes of the caller to the step of the button', () => {
    const html = render(createElement(ui.ButtonLink, { to: '/app/deploy', className: 'w-full sm:w-auto' }, 'Deploy'));
    assert.match(html, /w-full sm:w-auto/);
    assert.match(html, /bg-acc/);
  });
});

describe('SoftButton', () => {
  it('draws the secondary step of a button', () => {
    const html = render(createElement(ui.SoftButton, null, 'Clear filters'));
    assert.match(html, /^<button/);
    assert.match(html, /bg-s3/);
    assert.match(html, /h-11/);
    assert.match(html, /px-5/);
    assert.match(html, /text-\[14\.5px\]/);
  });

  it('sinks one level on a raised surface, so the button stays visible', () => {
    const html = render(createElement(ui.SoftButton, { surface: 's1' }, 'Copy'));
    assert.match(html, /bg-s1/);
    assert.doesNotMatch(html, /\bbg-s3\b/);
  });

  it('uses the same disabled state everywhere', () => {
    const html = render(createElement(ui.SoftButton, { disabled: true }, 'Coming soon'));
    assert.match(html, /disabled=""/);
    assert.match(html, /disabled:cursor-not-allowed/);
    assert.match(html, /disabled:opacity-50/);
  });
});

describe('DangerButton', () => {
  it('keeps the danger step for the action that destroys something', () => {
    const html = render(createElement(ui.DangerButton, null, 'Delete'));
    assert.match(html, /^<button/);
    assert.match(html, /bg-bad\/12/);
    assert.match(html, /text-bad/);
    assert.match(html, /hover:bg-bad\/20/);
  });
});

describe('Segmented', () => {
  let band = '';

  before(() => {
    band = render(
      createElement(ui.Segmented, {
        role: 'group',
        ariaLabel: 'Filter instances by status',
        options: [
          { value: 'all', label: 'All' },
          { value: 'running', label: 'Running' },
        ],
        value: 'running',
        onChange: () => {},
      }),
    );
  });

  it('draws a filter band as a group of pressed buttons', () => {
    assert.match(band, /role="group"/);
    assert.match(band, /aria-label="Filter instances by status"/);
    assert.match(band, /aria-pressed="true"[^>]*>Running</);
    assert.match(band, /aria-pressed="false"[^>]*>All</);
  });

  it('draws the segments with the size of the interface', () => {
    assert.match(band, /h-11/);
    assert.match(band, /px-3\.5/);
    assert.match(band, /text-\[13\.5px\]/);
  });

  it('keeps the buttons of the band reachable with the keyboard', () => {
    assert.match(band, /<button type="button"/);
    assert.match(band, /focus-visible:ring-2 focus-visible:ring-acc/);
  });
});
