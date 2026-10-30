import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { precompressBuild } from './src/lib/perf-precompress.mjs';

/**
 * Compresses the built site once the build has written it.
 *
 * The forms are written next to the files they come from, and the server
 * picks the one that matches what the client accepts. The request therefore
 * costs a read of the disk and nothing more, which is what a small machine
 * needs.
 */
function precompressAssets(): Plugin {
  let build: { root: string; outDir: string } | null = null;
  return {
    name: 'blipmade:precompress-assets',
    apply: 'build',
    configResolved(config) {
      // The bundle that writes the site to the disk is not sent to a
      // browser, so it is not compressed: the file is read once, by Node.
      if (config.build.ssr) return;
      build = { root: config.root, outDir: config.build.outDir };
    },
    closeBundle() {
      if (build) precompressBuild(build.root, build.outDir);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precompressAssets()],
  build: {
    // A font is never written into the stylesheet as a data: address: the
    // policy of the server only lets fonts come from this site.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined),
    rollupOptions: {
      output: {
        // The library of React changes when the library changes and not when
        // the site changes. The bundle that holds it therefore keeps its name
        // and its place in the cache of the browser between two versions of
        // the site, and a visitor who comes back only downloads what really
        // changed.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
