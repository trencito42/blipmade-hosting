/**
 * The boundary of the interface, checked without a browser.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the file for us, the same way the build does.
 *
 * A boundary is a class, and the contract of a boundary is two calls: React
 * asks it for a state when a child throws, and it draws that state again. The
 * server renderer of React rethrows instead of letting a boundary catch, so
 * the test drives those two calls itself. What is checked is the code of the
 * boundary and the page it falls back to, not the catching of React.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

interface BoundaryState {
  error: Error | null;
}

interface BoundaryInstance {
  state: BoundaryState;
  render: () => ReactElement;
}

interface BoundaryClass {
  new (props: { children: unknown }): BoundaryInstance;
  getDerivedStateFromError(error: Error): BoundaryState;
}

let server: ViteDevServer;
let ErrorBoundary: BoundaryClass;

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  const mod = (await server.ssrLoadModule('/src/ErrorBoundary.tsx')) as {
    ErrorBoundary: BoundaryClass;
  };
  ErrorBoundary = mod.ErrorBoundary;
});

after(async () => {
  await server.close();
});

/** A child that throws while it is drawn. */
function Boom(): never {
  throw new Error('the page could not be drawn');
}

function render(element: unknown): string {
  return renderToStaticMarkup(element as never);
}

describe('the error boundary', () => {
  it('draws its children while nothing goes wrong', () => {
    const boundary = new ErrorBoundary({ children: createElement('p', null, 'the page of the customer') });
    const html = render(boundary.render());
    assert.match(html, /the page of the customer/);
  });

  it('shows its fallback when a child throws', () => {
    const error = new Error('the page could not be drawn');

    // The child really throws.
    assert.throws(() => render(createElement(Boom)), /the page could not be drawn/);

    // React asks the boundary for a state when a child throws, and draws the
    // boundary again with that state. These are the two calls React makes.
    const boundary = new ErrorBoundary({ children: createElement(Boom) });
    const derived = ErrorBoundary.getDerivedStateFromError(error);
    boundary.state = { ...boundary.state, ...derived };

    const html = render(boundary.render());
    assert.match(html, /Something went wrong/);
    assert.match(html, /could not be shown because of an error/i);
    // The technical detail is there for the person who has to look for it.
    assert.match(html, /the page could not be drawn/);
  });

  it('does not leave the page blank when it catches an error', () => {
    const boundary = new ErrorBoundary({ children: createElement(Boom) });
    boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError(new Error('boom')) };
    const html = render(boundary.render());
    assert.ok(html.length > 400, `the fallback is only ${html.length} characters long`);
    assert.match(html, /<h1/);
  });
});

describe('the page of the boundary', () => {
  let html = '';

  before(() => {
    const boundary = new ErrorBoundary({ children: createElement(Boom) });
    boundary.state = {
      ...boundary.state,
      ...ErrorBoundary.getDerivedStateFromError(new Error('the page could not be drawn')),
    };
    html = render(boundary.render());
  });

  it('announces the error', () => {
    assert.match(html, /role="alert"/);
  });

  it('puts the focus on the title of the page', () => {
    assert.match(html, /<h1[^>]*tabindex="-1"/);
  });

  it('has a way back to the site', () => {
    assert.match(html, /href="\/"/);
    assert.match(html, /Back to the homepage/);
  });

  it('offers a way to try again', () => {
    assert.match(html, /Try again/);
  });

  it('names a contact for the support without inventing one', () => {
    assert.match(html, /TODO\(operator\)/);
    assert.match(html, /support email address/);
  });

  it('does not name an address that does not exist', () => {
    // The only address on the page is the way back to the site.
    const addresses = html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
    assert.deepEqual(addresses, [], `the page names an address: ${addresses.join(', ')}`);
  });
});

describe('the page of a failure of the server', () => {
  it('is a page of its own', async () => {
    const mod = await server.ssrLoadModule('/src/pages/ServerError.tsx');
    const html = render(createElement(mod.default as never));
    assert.match(html, /The server could not answer/);
    assert.match(html, /role="alert"/);
    assert.match(html, /<h1[^>]*tabindex="-1"/);
    assert.match(html, /href="\/"/);
  });
});
