import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

interface PremiumUi {
  ButtonGroup: (props: Record<string, unknown>) => unknown;
  AsyncCombobox: (props: Record<string, unknown>) => unknown;
  DomainInput: (props: Record<string, unknown>) => unknown;
  NumberStepper: (props: Record<string, unknown>) => unknown;
  ResourceSliderStepper: (props: Record<string, unknown>) => unknown;
  QuoteSummary: (props: Record<string, unknown>) => unknown;
  FileDropzone: (props: Record<string, unknown>) => unknown;
  PageEditorShell: (props: Record<string, unknown>) => unknown;
}

let ui: PremiumUi;
let server: ViteDevServer;

before(async () => {
  server = await createServer({ root: webRoot, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ui = (await server.ssrLoadModule('/src/app/components/premium.tsx')) as PremiumUi;
});

after(async () => server.close());

function render(element: unknown): string {
  return renderToStaticMarkup(element as never);
}

describe('premium customer controls', () => {
  it('groups related actions as one accessible control with joined geometry', () => {
    const html = render(createElement(ui.ButtonGroup, { label: 'Power controls' }, [
      createElement('button', { key: 'start' }, 'Start'),
      createElement('button', { key: 'stop' }, 'Stop'),
    ]));
    assert.match(html, /role="group"/);
    assert.match(html, /aria-label="Power controls"/);
    assert.match(html, /first:rounded-l-xl/);
    assert.match(html, /last:rounded-r-xl/);
  });

  it('renders an exact bounded stepper with named keyboard controls and provider limits', () => {
    const html = render(createElement(ui.NumberStepper, {
      label: 'Memory', value: 2048, min: 1024, max: 8192, step: 512, unit: 'MiB', onChange: () => {},
    }));
    assert.match(html, /aria-label="Decrease Memory"/);
    assert.match(html, /aria-label="Increase Memory"/);
    assert.match(html, /min="1024"/);
    assert.match(html, /max="8192"/);
    assert.match(html, /step="512"/);
    assert.match(html, /1024–8192 MiB, in steps of 512/);
  });

  it('renders a remote-capable accessible combobox without exposing a raw selected ID', () => {
    const html = render(createElement(ui.AsyncCombobox, {
      label: 'Related service', value: 'instance-secret-id', selectedLabel: 'Production API', onChange: () => {},
      loadOptions: async () => [], hint: 'Search only your services.',
    }));
    assert.match(html, /role="combobox"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /value="Production API"/);
    assert.doesNotMatch(html, /value="instance-secret-id"/);
    assert.match(html, /Clear Related service/);
  });

  it('renders a specialized hostname field with an IDN DNS preview', () => {
    const html = render(createElement(ui.DomainInput, {
      value: 'münchen.example', onChange: () => {}, error: 'Check this hostname.',
    }));
    assert.match(html, /inputMode="url"/);
    assert.match(html, /xn--mnchen-3ya\.example/);
    assert.match(html, /aria-invalid="true"/);
    assert.match(html, /role="alert"/);
  });

  it('keeps slider and exact entry in one resource control', () => {
    const html = render(createElement(ui.ResourceSliderStepper, {
      label: 'Disk', value: 40, min: 20, max: 100, step: 10, unit: 'GiB', onChange: () => {},
      marks: [{ value: 20, label: 'Starter' }, { value: 100, label: 'Maximum' }],
    }));
    assert.match(html, /type="range"/);
    assert.match(html, />Starter</);
    assert.match(html, />Maximum</);
    assert.match(html, /aria-label="Increase Disk"/);
  });

  it('shows exact server-supplied minor-unit quote lines and total', () => {
    const html = render(createElement(ui.QuoteSummary, {
      lines: [{ label: 'Plan', amount: 1299 }, { label: 'VAT', amount: 247 }],
      total: 1546, currency: 'EUR', period: 'month',
    }));
    assert.match(html, /Plan/);
    assert.match(html, /VAT/);
    assert.match(html, /Total/);
    assert.match(html, /15\.46/);
  });

  it('provides an accessible multi-file drop target with real quotas and error wiring', () => {
    const html = render(createElement(ui.FileDropzone, {
      files: [], onFilesChange: () => {}, accept: ['image/png', 'application/pdf'], maxFiles: 5, maxBytes: 5 * 1024 * 1024,
      error: 'One file needs attention.',
    }));
    assert.match(html, /type="file"/);
    assert.match(html, /multiple=""/);
    assert.match(html, /accept="image\/png,application\/pdf"/);
    assert.match(html, /aria-invalid="true"/);
    assert.match(html, /role="alert"/);
    assert.match(html, /Up to 5 files, 5\.0 MB each/);
  });

  it('renders the dedicated editor contract: one title, a way back, dirty state and the actions after the form', () => {
    const html = render(createElement(ui.PageEditorShell, {
      eyebrow: 'Support', title: 'Open a ticket', backTo: '/app/tickets', backLabel: 'Back to support', dirty: true,
      actions: createElement('button', null, 'Save'), children: createElement('p', null, 'Form'),
    }));
    // Outside of the shell there is no top bar to carry the way back, so the page shows it itself.
    assert.match(html, /href="\/app\/tickets"/);
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    assert.equal((html.match(/<main/g) ?? []).length, 0);
    assert.equal((html.match(/<footer/g) ?? []).length, 0);
    assert.match(html, /Unsaved changes/);
    assert.doesNotMatch(html, /fixed inset-x-0/);
    assert.doesNotMatch(html, /sticky bottom-3/);
    assert.match(html, />Save</);
  });

  it('keeps long-form actions in the card even when stickyActions is still passed', () => {
    const html = render(createElement(ui.PageEditorShell, {
      eyebrow: 'Support', title: 'Open a ticket', backTo: '/app/tickets', backLabel: 'Back to support', stickyActions: true,
      actions: createElement('button', null, 'Save'), children: createElement('p', null, 'Form'),
    }));
    assert.doesNotMatch(html, /sticky bottom-3/);
    assert.doesNotMatch(html, /fixed inset-x-0/);
    assert.doesNotMatch(html, /backdrop-blur/);
    assert.match(html, />Save</);
  });

  it('keeps the ticket reply composer in document flow', () => {
    const src = readFileSync(join(webRoot, 'src/app/TicketDetail.tsx'), 'utf8');
    assert.doesNotMatch(src, /sticky bottom-3/);
    assert.doesNotMatch(src, /shadow-\[0_8px_30px/);
  });
});

describe('the first dedicated customer editor migration', () => {
  it('registers /app/tickets/new before the dynamic ticket route', () => {
    const routes = readFileSync(join(webRoot, 'src/routes.tsx'), 'utf8');
    const specific = routes.indexOf("pattern: '/app/tickets/new'");
    const dynamic = routes.indexOf("pattern: '/app/tickets/:id'");
    assert.ok(specific >= 0);
    assert.ok(dynamic > specific);
  });

  it('moves creation out of the ticket list and keeps the exact API and upload integration on the editor page', () => {
    const list = readFileSync(join(webRoot, 'src/app/Tickets.tsx'), 'utf8');
    const editor = readFileSync(join(webRoot, 'src/app/NewTicket.tsx'), 'utf8');
    assert.match(list, /to="\/app\/tickets\/new"/);
    assert.doesNotMatch(list, /function NewTicketForm/);
    assert.match(editor, /post<\{ ticket: Ticket; initialMessageId: string \}>\('\/tickets'/);
    assert.match(editor, /uploadTicketAttachment/);
    assert.match(editor, /useUnsavedChangesGuard/);
    assert.match(editor, /PageEditorShell/);
  });
});
