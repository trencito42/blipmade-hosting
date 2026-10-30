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
 *
 * The port is the one of the allocation, and the application has to listen on
 * it. The node publishes the port of the allocation for the container and the
 * route of the domain of the customer points at that same port, so an
 * application that listens on another port is served by nobody. Pterodactyl
 * gives the container that port in `SERVER_PORT`; the name `PORT` is the one
 * the platform used to read, and the panel does not set it. The port of the
 * allocation is written into the file as well, so the application still lands
 * on the right port when the panel gives no variable at all.
 */

/** What a file of the platform is. It decides how the file is compared. */
export type StarterFileKind = 'code' | 'package' | 'readme';

export interface StarterFile {
  /** The path of the file, relative to the home directory of the container. */
  path: string;
  /** The content of the file. */
  content: string;
  /** What the file is. */
  kind: StarterFileKind;
}

export interface StarterAppInput {
  /** The slug of the product. */
  slug: string;
  /** The name of the product, as it is shown to the customer. */
  name: string;
  /** The path the health check of the product uses. */
  healthPath: string;
  /**
   * The port of the allocation the application listens on.
   *
   * The port is never left out: an application that was written without one
   * would fall back to a port of its own, and the node would publish a
   * different one.
   */
  port: number;
}

/**
 * The line of the generated code that holds the port.
 *
 * The line is recognised by its shape, so a file that is not the application
 * of the platform is never taken for it.
 */
const PORT_LINE = /^const port = .*$/m;

/**
 * The line of the port of the generated code.
 *
 * `SERVER_PORT` is the variable Pterodactyl gives the container, and it holds
 * the port of the allocation. `PORT` is read as well, because a container of
 * an operator may be started with it. The port of the allocation is the last
 * resort.
 *
 * A port that is not a number is refused: an application that is written
 * without a port of its own would listen on a port of its own, and the node
 * publishes the port of the allocation, so nobody would reach it.
 */
function portLine(port: number): string {
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('The application needs the port of the allocation to listen on.');
  }
  return `const port = Number(process.env.SERVER_PORT || process.env.PORT || ${port});`;
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
  return `// ${input.name}, deployed by Blipmade.
//
// The application that the platform starts in this container. It answers on
// the health path of the product, so a deployment is only reported as
// successful when the application really responds.
const http = require('node:http');

${portLine(input.port)}
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
  const runtime = RUNTIME_STARTERS[input.slug];
  if (runtime) return runtime(input);
  return [
    { path: 'package.json', content: packageJson(input), kind: 'package' },
    { path: 'index.js', content: indexJs(input), kind: 'code' },
    { path: 'README.md', content: readme(input), kind: 'readme' },
  ];
}

/**
 * The applications of the products that are not run by npm.
 *
 * The egg of such a product starts its own program, with the name of the file
 * written in a variable of the egg: `app.py` for Python and `app.lua` for Luvit.
 * The application is the same small server in the language of the product, so a
 * container of it answers on the port of the allocation and on the health path.
 */
const RUNTIME_STARTERS: Record<string, (input: StarterAppInput) => StarterFile[]> = {
  python: (input) => [{ path: 'app.py', content: appPy(input), kind: 'code' }],
  lua: (input) => [{ path: 'app.lua', content: appLua(input), kind: 'code' }],
};

function appPy(input: StarterAppInput): string {
  return `# ${input.name}, deployed by Blipmade.
#
# The application that the platform starts in this container. It answers on the
# health path of the product and on every other path. Replace this file with your
# own code.
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

port = int(os.environ.get("SERVER_PORT") or os.environ.get("PORT") or ${input.port})
health_path = ${JSON.stringify(input.healthPath)}
started_at = time.time()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == health_path:
            body = json.dumps({"status": "ok", "app": ${JSON.stringify(input.slug)}, "uptime": round(time.time() - started_at)}).encode()
            content_type = "application/json"
        else:
            body = (${JSON.stringify(input.name)} + " is running on Blipmade.\\n").encode()
            content_type = "text/plain; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


print("listening on :%d" % port, flush=True)
HTTPServer(("0.0.0.0", port), Handler).serve_forever()
`;
}

function appLua(input: StarterAppInput): string {
  return `-- ${input.name}, deployed by Blipmade.
--
-- The application that the platform starts in this container. It answers on the
-- health path of the product and on every other path. Replace this file with
-- your own code.
local http = require('http')

local port = tonumber(process.env.SERVER_PORT or process.env.PORT) or ${input.port}
local healthPath = ${JSON.stringify(input.healthPath)}
local startedAt = os.time()

http.createServer(function (req, res)
  local path = req.url:match('^[^?]*')
  local body, contentType
  if path == healthPath then
    body = '{"status":"ok","app":' .. ${JSON.stringify(JSON.stringify(input.slug))} .. ',"uptime":' .. (os.time() - startedAt) .. '}'
    contentType = 'application/json'
  else
    body = ${JSON.stringify(input.name)} .. ' is running on Blipmade.\\n'
    contentType = 'text/plain; charset=utf-8'
  end
  res:setHeader('Content-Type', contentType)
  res:setHeader('Content-Length', #body)
  res:finish(body)
end):listen(port, '0.0.0.0')

print('listening on :' .. port)
`;
}

/**
 * The file of the platform without the line of the port.
 *
 * The line of the port is the one that has to be repaired, so it is left out
 * of the comparison. Everything else has to be the file of the platform, so a
 * file that a customer wrote is never taken for it.
 */
function withoutPortLine(content: string): string {
  return content.replace(PORT_LINE, '');
}

/**
 * True when the file in the container is the application of the platform.
 *
 * The comparison is strict: the file has to be the file of the platform, down
 * to every line but the one of the port. A file that a customer changed is
 * therefore never the file of the platform, and it is never touched.
 */
export function isStarterFile(file: StarterFile, content: string): boolean {
  if (file.kind === 'code') {
    return withoutPortLine(content) === withoutPortLine(file.content);
  }
  return content === file.content;
}

/**
 * The file of the platform, with the line of the port corrected.
 *
 * Returns nothing when the file in the container is not the application of the
 * platform, so the code of a customer is never overwritten. When the file is
 * the file of the platform and nothing has to be changed, nothing is returned
 * either, so the file is not written for nothing.
 */
export function repairStarterFile(file: StarterFile, content: string): string | null {
  if (!isStarterFile(file, content)) return null;

  // The package and the readme carry no port, so there is nothing to repair in
  // them: when they are the files of the platform, they are already right.
  if (file.kind !== 'code') return null;

  // The line of the port of the file of the platform carries the port of the
  // allocation, so it is the one that replaces the line of the container.
  const platformLine = file.content.match(/^const port = .*$/m);
  if (!platformLine) return null;
  const repaired = content.replace(PORT_LINE, platformLine[0]);
  return repaired === content ? null : repaired;
}

/** What the platform does with a file of the container. */
export type StarterFileAction = 'write' | 'repair' | 'keep';

export interface StarterFilePlan {
  /** The path of the file. */
  path: string;
  /** What the platform does with the file. */
  action: StarterFileAction;
  /** The content that is written, or nothing when the file is left as it is. */
  content: string | null;
  /** True when the file in the container is the application of the platform. */
  platform: boolean;
}

/**
 * What has to happen to the files of the application in a container.
 *
 * The files that are already there are read first, so the decision is made on
 * what the container really holds:
 *
 * - a file that is not there is written;
 * - a file that is the application of the platform is repaired, and only the
 *   line of the port is corrected;
 * - a file that a customer wrote is left exactly as it is.
 *
 * The decision is pure, so it can be checked without a panel.
 */
export function planStarterFiles(
  files: StarterFile[],
  existing: ReadonlyMap<string, string>,
): StarterFilePlan[] {
  return files.map((file) => {
    const current = existing.get(file.path);

    if (current === undefined) {
      return { path: file.path, action: 'write', content: file.content, platform: true };
    }

    if (!isStarterFile(file, current)) {
      // The container holds the code of a customer here. It is not the file of
      // the platform, so the platform does not write over it.
      return { path: file.path, action: 'keep', content: null, platform: false };
    }

    const repaired = repairStarterFile(file, current);
    if (repaired === null) {
      return { path: file.path, action: 'keep', content: null, platform: true };
    }

    return { path: file.path, action: 'repair', content: repaired, platform: true };
  });
}
