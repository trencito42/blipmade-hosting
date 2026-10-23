/**
 * The application that the platform puts into a new container.
 *
 * The audit found that the container of a sold product held only `.npm/` and
 * `bm-test.txt`, and that the start-up command `npm run start` had nothing to
 * run. A container that answers "online" but holds no application is not a
 * working product, so the application is part of the provisioning, not an
 * afterthought.
 *
 * The files are written into the container before the start-up command runs.
 * The egg of the panel starts the container with `npm run start`, so the
 * `start` script of the package is what turns the container into a service.
 *
 * The application here is the smallest one that is real: an HTTP server that
 * answers on the health path of the product and on every other path. The
 * code of a product replaces it by writing its own files over it.
 */

export interface StarterFile {
  /** The path of the file, relative to the home directory of the container. */
  path: string;
  /** The content of the file. */
  content: string;
}

export interface StarterAppInput {
  /** The slug of the product. */
  slug: string;
  /** The name of the product, as it is shown to the customer. */
  name: string;
  /** The path the health check of the product uses. */
  healthPath: string;
  /** The port the application listens on. */
  port?: number;
}

function packageJson(input: StarterAppInput): string {
  return JSON.stringify(
    {
      name: input.slug,
      version: '1.0.0',
      private: true,
      description: `${input.name}, deployed by Blipmade.`,
      main: 'index.js',
      scripts: { start: 'node index.js' },
      engines: { node: '>=18' },
    },
    null,
    2,
  ) + '\n';
}

function indexJs(input: StarterAppInput): string {
  const port = input.port ?? 3000;
  return `// ${input.name}, deployed by Blipmade.
//
// The application that the platform starts in this container. It answers on
// the health path of the product, so a deployment is only reported as
// successful when the application really responds.
const http = require('node:http');

const port = Number(process.env.PORT || ${port});
const healthPath = ${JSON.stringify(input.healthPath)};
const startedAt = Date.now();

const server = http.createServer((request, response) => {
  const path = (request.url || '/').split('?')[0];
  if (path === healthPath) {
    const body = JSON.stringify({
      status: 'ok',
      app: ${JSON.stringify(input.slug)},
      uptime: Math.round((Date.now() - startedAt) / 1000),
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(body);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(${JSON.stringify(input.name)} + ' is running on Blipmade.\\n');
});

server.listen(port, () => {
  console.log('listening on :' + port + ' (' + healthPath + ' answers the health check)');
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
`;
}

function readme(input: StarterAppInput): string {
  return `# ${input.name}

This application was placed in the container by Blipmade when the instance was
provisioned. It answers on \`${input.healthPath}\`, which is the path the
deployment check uses.

The code of the product replaces the files of this directory: upload your own
files over them and the service that starts is yours.
`;
}

/**
 * The files of the application, in the order they have to be written.
 *
 * The package comes first: the start-up command of the egg is
 * `npm run start`, and the `start` script of the package is what runs.
 */
export function starterFiles(input: StarterAppInput): StarterFile[] {
  return [
    { path: 'package.json', content: packageJson(input) },
    { path: 'index.js', content: indexJs(input) },
    { path: 'README.md', content: readme(input) },
  ];
}
