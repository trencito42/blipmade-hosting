// Draws the picture that a link of the site shows when it is shared.
//
// The picture is drawn by a browser, because it is a picture: the typefaces
// of the site and the logo of the platform are drawn by the same machinery
// that draws the pages.
//
// The browser is the one of Playwright, or the one of the machine. The
// picture is written to public/og.png and is part of the build.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const here = resolve('scripts');
const fonts = [
  ['node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2', 'hanken-grotesk-latin-wght-normal.woff2'],
  ['node_modules/@fontsource-variable/funnel-display/files/funnel-display-latin-wght-normal.woff2', 'funnel-display-latin-wght-normal.woff2'],
];

const directory = mkdtempSync(join(tmpdir(), 'blipmade-og-'));
try {
  for (const [from, to] of fonts) copyFileSync(resolve(from), join(directory, to));
  copyFileSync(resolve('public/favicon.svg'), join(directory, 'logo.svg'));
  copyFileSync(join(here, 'og-image.html'), join(directory, 'og.html'));

  const browser = process.env.CHROME_BIN ?? 'chromium';
  const result = spawnSync(
    browser,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--screenshot=' + resolve('public/og.png'),
      '--window-size=1200,630',
      'file://' + join(directory, 'og.html'),
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    console.error('The browser could not draw the picture.');
    process.exit(result.status ?? 1);
  }
  if (!existsSync(resolve('public/og.png'))) {
    console.error('The picture was not written.');
    process.exit(1);
  }
  console.log('public/og.png written');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
