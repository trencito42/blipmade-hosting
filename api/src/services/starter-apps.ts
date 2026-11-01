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
 * The products that are a bare runtime: the customer brings the code, and the platform
 * only puts a small server there so the container answers until the code replaces it.
 * Every other product installs real software (a CMS, a database, a game), and a stand-in
 * server must never be put beside it, or its answer could pass for the product's.
 */
const GENERIC_RUNTIME_SLUGS = new Set([
  'nodejs',
  'discord-bot',
  'python',
  'lua',
  'elixir',
  'dotnet',
  'golang',
  'java',
  'rust-runtime',
  'dart',
  'deno',
]);

export const usesStarterApplication = (slug: string): boolean => GENERIC_RUNTIME_SLUGS.has(slug);

/** True when an answer is the platform's own stand-in server and not the product. */
export function looksLikeStarter(body: string): boolean {
  return body.includes('is running on Blipmade.') || /"status":\s*"ok",\s*"app":/.test(body);
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
 *
 * The same holds for the other bare runtimes: the customer of Elixir, Go,
 * .NET, Java, Rust, Dart or Deno brings the code, and the egg of the product
 * starts that code with the tool of its language. Without an application the
 * start-up command of the egg has nothing to run: `mix run` answers "Could not
 * find a Mix.Project", `dotnet run` answers "The project file could not be
 * found", and the container is alive but serves nobody.
 */
const RUNTIME_STARTERS: Record<string, (input: StarterAppInput) => StarterFile[]> = {
  python: (input) => [{ path: 'app.py', content: appPy(input), kind: 'code' }],
  lua: (input) => [{ path: 'app.lua', content: appLua(input), kind: 'code' }],
  elixir: (input) => [
    { path: 'mix.exs', content: elixirMixExs(input), kind: 'package' },
    { path: 'lib/blipmade_starter.ex', content: elixirStarterEx(input), kind: 'code' },
    { path: 'lib/blipmade_starter/application.ex', content: elixirApplicationEx(input), kind: 'code' },
    { path: 'lib/blipmade_starter/server.ex', content: elixirServerEx(input), kind: 'code' },
  ],
  'rust-runtime': (input) => [
    { path: 'Cargo.toml', content: rustCargoToml(input), kind: 'package' },
    { path: 'src/main.rs', content: rustMainRs(input), kind: 'code' },
  ],
  golang: (input) => [
    { path: 'go.mod', content: goMod(input), kind: 'package' },
    { path: 'main.go', content: goMain(input), kind: 'code' },
  ],
  dotnet: (input) => [
    { path: 'Blipmade.csproj', content: dotnetCsproj(input), kind: 'package' },
    { path: 'Program.cs', content: dotnetProgram(input), kind: 'code' },
  ],
  java: (input) => [{ path: 'Starter.java', content: javaStarter(input), kind: 'code' }],
  dart: (input) => [
    { path: 'pubspec.yaml', content: dartPubspec(input), kind: 'package' },
    { path: 'bin/blipmade_starter.dart', content: dartMain(input), kind: 'code' },
  ],
  deno: (input) => [{ path: 'main.ts', content: denoMain(input), kind: 'code' }],
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
/* ------------------------------------------------------------------ *
 * The applications of the runtimes that are written in another language.
 *
 * Every one of them is the same small server: it listens on the port of the
 * allocation, answers on the health path of the product with the body the
 * platform recognises, and answers on every other path with a text that says
 * the service is running. The code of a customer replaces the files of these
 * applications, and the start-up command of the egg of the product runs it.
 * ------------------------------------------------------------------ */

/** The project of the application of Elixir. */
function elixirMixExs(input: StarterAppInput): string {
  return `defmodule BlipmadeStarter.MixProject do
  use Mix.Project

  # ${input.name}, deployed by Blipmade.
  #
  # The project of the application that the platform starts in this container.
  # Replace the files of this directory with your own code.

  def project do
    [
      app: :blipmade_starter,
      version: "1.0.0",
      elixir: ">= 1.12.0",
      start_permanent: false,
      deps: []
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {BlipmadeStarter.Application, []}
    ]
  end
end
`;
}

/** The settings of the application of Elixir: the slug, the health path, the port. */
function elixirStarterEx(input: StarterAppInput): string {
  return `defmodule BlipmadeStarter do
  @moduledoc """
  The application that Blipmade places in a new container of ${input.name}.

  It answers on the health path of the product, so a deployment is only
  reported as successful when the application really responds. Replace the
  files of this directory with your own code.
  """

  @slug ${JSON.stringify(input.slug)}
  @health_path ${JSON.stringify(input.healthPath)}
  @fallback_port ${input.port}

  def slug, do: @slug
  def health_path, do: @health_path

  # The port of the allocation. The panel gives that port to the container in
  # SERVER_PORT, so it is read first; the port of the allocation is the last
  # resort.
  def port do
    case parse_port(System.get_env("SERVER_PORT")) do
      nil ->
        case parse_port(System.get_env("PORT")) do
          nil -> @fallback_port
          port -> port
        end

      port ->
        port
    end
  end

  defp parse_port(nil), do: nil

  defp parse_port(raw) do
    case Integer.parse(String.trim(raw)) do
      {port, ""} when port > 0 and port < 65536 -> port
      _ -> nil
    end
  end

  # The body of the health path.
  def health_body do
    "{\\"status\\":\\"ok\\",\\"app\\":\\"" <> @slug <> "\\"}"
  end

  # The body of every other path.
  def text_body do
    "${input.name} is running on Blipmade.\\\\n"
  end
end
`;
}

/** The application of Elixir: it opens the port of the allocation. */
function elixirApplicationEx(input: StarterAppInput): string {
  return `defmodule BlipmadeStarter.Application do
  @moduledoc """
  Starts the server of the application of ${input.name}.
  """

  use Application

  @impl true
  def start(_type, _args) do
    BlipmadeStarter.Server.start_link(BlipmadeStarter.port())
  end
end
`;
}

/** The server of Elixir: it answers on the health path and on every other path. */
function elixirServerEx(input: StarterAppInput): string {
  return `defmodule BlipmadeStarter.Server do
  @moduledoc """
  Answers on the port of the allocation of ${input.name}.
  """

  use GenServer

  require Logger

  @listen_options [:binary, packet: :http_bin, active: false, reuseaddr: true, backlog: 128]

  def start_link(port) do
    GenServer.start_link(__MODULE__, port, name: __MODULE__)
  end

  @impl true
  def init(port) do
    case :gen_tcp.listen(port, @listen_options) do
      {:ok, socket} ->
        Logger.info("listening on :#{port} (#{BlipmadeStarter.health_path()} answers the health check)")
        {:ok, socket, {:continue, :accept}}

      {:error, reason} ->
        {:stop, reason}
    end
  end

  @impl true
  def handle_continue(:accept, socket) do
    {:noreply, accept(socket)}
  end

  # The socket of the listener stays open, so a request never finds the port
  # closed between two requests.
  defp accept(socket) do
    case :gen_tcp.accept(socket) do
      {:ok, connection} ->
        _ = Task.start(fn -> handle(connection) end)
        accept(socket)

      {:error, _reason} ->
        socket
    end
  end

  defp handle(socket) do
    case :gen_tcp.recv(socket, 0, 5_000) do
      {:ok, {:http_request, _method, path, _version}} ->
        :gen_tcp.send(socket, response(path))

      _ ->
        :ok
    end

    :gen_tcp.close(socket)
  end

  defp response(path) do
    # The body and the type of the answer are bound together, because a
    # variable of a branch of an "if" is not known after it.
    {body, content_type} =
      if request_path(path) == BlipmadeStarter.health_path() do
        {BlipmadeStarter.health_body(), "application/json"}
      else
        {BlipmadeStarter.text_body(), "text/plain; charset=utf-8"}
      end

    [
      "HTTP/1.1 200 OK\\r\\n",
      "Content-Type: ",
      content_type,
      "\\r\\n",
      "Content-Length: ",
      Integer.to_string(byte_size(body)),
      "\\r\\n",
      "Connection: close\\r\\n",
      "\\r\\n",
      body
    ]
  end

  # The path of the request, without the query.
  defp request_path({:abs_path, path}), do: path |> String.split("?") |> List.first()
  defp request_path(path) when is_binary(path), do: path |> String.split("?") |> List.first()
  defp request_path(path), do: path |> to_string() |> String.split("?") |> List.first()
end
`;
}

/** The project of the application of Rust. */
function rustCargoToml(input: StarterAppInput): string {
  return `[package]
name = "blipmade_starter"
version = "1.0.0"
edition = "2021"

# ${input.name}, deployed by Blipmade.
#
# The application that the platform starts in this container. Replace the files
# of this directory with your own code.

[dependencies]
`;
}

/** The application of Rust: it answers on the port of the allocation. */
function rustMainRs(input: StarterAppInput): string {
  return `// ${input.name}, deployed by Blipmade.
//
// The application that the platform starts in this container. It answers on the
// health path of the product, so a deployment is only reported as successful
// when the application really responds. Replace this file with your own code.
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

const SLUG: &str = ${JSON.stringify(input.slug)};
const HEALTH_PATH: &str = ${JSON.stringify(input.healthPath)};

/// The port of the allocation. The panel gives that port to the container in
/// SERVER_PORT, so it is read first; the port of the allocation is the last
/// resort.
fn port() -> u16 {
    for name in ["SERVER_PORT", "PORT"] {
        if let Ok(raw) = std::env::var(name) {
            if let Ok(value) = raw.trim().parse::<u16>() {
                if value > 0 {
                    return value;
                }
            }
        }
    }
    ${input.port}
}

fn main() {
    let port = port();
    let listener = TcpListener::bind(("0.0.0.0", port)).expect("the port of the allocation cannot be opened");
    println!("listening on :{} ({} answers the health check)", port, HEALTH_PATH);

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => handle(&mut stream),
            Err(_) => continue,
        }
    }
}

fn handle(stream: &mut TcpStream) {
    let mut buffer = [0u8; 2048];
    let read = match stream.read(&mut buffer) {
        Ok(read) => read,
        Err(_) => return,
    };
    let request = String::from_utf8_lossy(&buffer[..read]).to_string();
    let path = request.split_whitespace().nth(1).unwrap_or("/");
    let path = path.split('?').next().unwrap_or("/");

    let (body, content_type) = if path == HEALTH_PATH {
        (
            format!(r#"{{"status":"ok","app":"{}"}}"#, SLUG),
            "application/json",
        )
    } else {
        ("${input.name} is running on Blipmade.\\n".to_string(), "text/plain; charset=utf-8")
    };

    let response = format!(
        "HTTP/1.1 200 OK\\r\\nContent-Type: {}\\r\\nContent-Length: {}\\r\\nConnection: close\\r\\n\\r\\n{}",
        content_type,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
}
`;
}

/** The module of the application of Go. */
function goMod(input: StarterAppInput): string {
  return `// ${input.name}, deployed by Blipmade.
//
// The application that the platform starts in this container. Replace the files
// of this directory with your own code.
module blipmade_starter

go 1.20
`;
}

/** The application of Go: it answers on the port of the allocation. */
function goMain(input: StarterAppInput): string {
  return `// ${input.name}, deployed by Blipmade.
//
// The application that the platform starts in this container. It answers on the
// health path of the product, so a deployment is only reported as successful
// when the application really responds. Replace this file with your own code.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const slug = ${JSON.stringify(input.slug)}
const healthPath = ${JSON.stringify(input.healthPath)}

// port is the port of the allocation. The panel gives that port to the
// container in SERVER_PORT, so it is read first; the port of the allocation is
// the last resort.
func port() int {
	for _, name := range []string{"SERVER_PORT", "PORT"} {
		raw := strings.TrimSpace(os.Getenv(name))
		if raw == "" {
			continue
		}
		value, err := strconv.Atoi(raw)
		if err == nil && value > 0 && value < 65536 {
			return value
		}
	}
	return ${input.port}
}

func main() {
	portValue := port()
	startedAt := time.Now()

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == healthPath {
			writer.Header().Set("Content-Type", "application/json")
			// The body is built from a struct and not from a map, because Go
			// writes the keys of a map in the order of the alphabet, and the
			// platform recognises its own answer by its shape.
			_ = json.NewEncoder(writer).Encode(struct {
				Status string \`json:"status"\`
				App    string \`json:"app"\`
				Uptime int    \`json:"uptime"\`
			}{
				Status: "ok",
				App:    slug,
				Uptime: int(time.Since(startedAt).Seconds()),
			})
			return
		}
		writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprintln(writer, "${input.name} is running on Blipmade.")
	})

	fmt.Printf("listening on :%d (%s answers the health check)\\n", portValue, healthPath)

	server := &http.Server{Addr: fmt.Sprintf("0.0.0.0:%d", portValue), Handler: mux}
	if err := server.ListenAndServe(); err != nil {
		fmt.Println("the server stopped:", err)
	}
}
`;
}

/** The project of the application of .NET. */
function dotnetCsproj(input: StarterAppInput): string {
  return `<Project Sdk="Microsoft.NET.Sdk">

  <!-- ${input.name}, deployed by Blipmade.
       The application that the platform starts in this container. Replace the
       files of this directory with your own code. -->

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <InvariantGlobalization>true</InvariantGlobalization>
    <AssemblyName>BlipmadeStarter</AssemblyName>
    <RootNamespace>BlipmadeStarter</RootNamespace>
  </PropertyGroup>

</Project>
`;
}

/** The application of .NET: it answers on the port of the allocation. */
function dotnetProgram(input: StarterAppInput): string {
  return `// ${input.name}, deployed by Blipmade.
//
// The application that the platform starts in this container. It answers on the
// health path of the product, so a deployment is only reported as successful
// when the application really responds. Replace this file with your own code.
using System.Net;
using System.Text;
using System.Text.Json;

const string slug = ${JSON.stringify(input.slug)};
const string healthPath = ${JSON.stringify(input.healthPath)};

var port = ReadPort();
var startedAt = DateTimeOffset.UtcNow;

using var listener = new HttpListener();
listener.Prefixes.Add("http://*:" + port + "/");
listener.Start();
Console.WriteLine("listening on :" + port + " (" + healthPath + " answers the health check)");

while (listener.IsListening)
{
    var context = await listener.GetContextAsync();
    var path = context.Request.Url?.AbsolutePath ?? "/";

    byte[] body;
    string contentType;
    if (path == healthPath)
    {
        body = JsonSerializer.SerializeToUtf8Bytes(new
        {
            status = "ok",
            app = slug,
            uptime = (int)(DateTimeOffset.UtcNow - startedAt).TotalSeconds,
        });
        contentType = "application/json";
    }
    else
    {
        body = Encoding.UTF8.GetBytes("${input.name} is running on Blipmade.\\n");
        contentType = "text/plain; charset=utf-8";
    }

    context.Response.ContentType = contentType;
    context.Response.ContentLength64 = body.Length;
    await context.Response.OutputStream.WriteAsync(body);
    context.Response.Close();
}

// ReadPort is the port of the allocation. The panel gives that port to the
// container in SERVER_PORT, so it is read first; the port of the allocation is
// the last resort.
static int ReadPort()
{
    foreach (var name in new[] { "SERVER_PORT", "PORT" })
    {
        var raw = Environment.GetEnvironmentVariable(name);
        if (!string.IsNullOrWhiteSpace(raw) && int.TryParse(raw.Trim(), out var value) && value > 0)
        {
            return value;
        }
    }

    return ${input.port};
}
`;
}

/** The application of Java: it answers on the port of the allocation. */
function javaStarter(input: StarterAppInput): string {
  return `// ${input.name}, deployed by Blipmade.
//
// The application that the platform starts in this container. It answers on the
// health path of the product, so a deployment is only reported as successful
// when the application really responds. Replace this file with your own code.
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

public class Starter {
    private static final String SLUG = ${JSON.stringify(input.slug)};
    private static final String HEALTH_PATH = ${JSON.stringify(input.healthPath)};
    private static final int FALLBACK_PORT = ${input.port};

    public static void main(String[] args) throws Exception {
        int port = readPort();

        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/", new HttpHandler() {
            @Override
            public void handle(HttpExchange exchange) throws IOException {
                String path = exchange.getRequestURI().getPath();
                byte[] body;
                String contentType;

                if (HEALTH_PATH.equals(path)) {
                    body = ("{\\"status\\":\\"ok\\",\\"app\\":\\"" + SLUG + "\\"}").getBytes(StandardCharsets.UTF_8);
                    contentType = "application/json";
                } else {
                    body = ("${input.name} is running on Blipmade.\\n").getBytes(StandardCharsets.UTF_8);
                    contentType = "text/plain; charset=utf-8";
                }

                exchange.getResponseHeaders().set("Content-Type", contentType);
                exchange.sendResponseHeaders(200, body.length);
                OutputStream out = exchange.getResponseBody();
                out.write(body);
                out.close();
            }
        });
        server.setExecutor(null);
        server.start();

        System.out.println("listening on :" + port + " (" + HEALTH_PATH + " answers the health check)");
    }

    // The port of the allocation. The panel gives that port to the container in
    // SERVER_PORT, so it is read first; the port of the allocation is the last
    // resort.
    private static int readPort() {
        for (String name : new String[] {"SERVER_PORT", "PORT"}) {
            String raw = System.getenv(name);
            if (raw == null) {
                continue;
            }
            try {
                int value = Integer.parseInt(raw.trim());
                if (value > 0 && value < 65536) {
                    return value;
                }
            } catch (NumberFormatException ignored) {
                // The value is not a port, so the next name is read.
            }
        }
        return FALLBACK_PORT;
    }
}
`;
}

/** The package of the application of Dart. */
function dartPubspec(input: StarterAppInput): string {
  return `name: blipmade_starter
description: ${input.name}, deployed by Blipmade.
version: 1.0.0
publish_to: none

environment:
  sdk: '>=2.17.0 <4.0.0'
`;
}

/** The application of Dart: it answers on the port of the allocation. */
function dartMain(input: StarterAppInput): string {
  return `// ${input.name}, deployed by Blipmade.
//
// The application that the platform starts in this container. It answers on the
// health path of the product, so a deployment is only reported as successful
// when the application really responds. Replace this file with your own code.
import 'dart:convert';
import 'dart:io';

const slug = ${JSON.stringify(input.slug)};
const healthPath = ${JSON.stringify(input.healthPath)};
const fallbackPort = ${input.port};

/// The port of the allocation. The panel gives that port to the container in
/// SERVER_PORT, so it is read first; the port of the allocation is the last
/// resort.
int readPort() {
  for (final name in ['SERVER_PORT', 'PORT']) {
    final raw = Platform.environment[name];
    if (raw == null) {
      continue;
    }
    final value = int.tryParse(raw.trim());
    if (value != null && value > 0 && value < 65536) {
      return value;
    }
  }
  return fallbackPort;
}

Future<void> main() async {
  final port = readPort();
  final server = await HttpServer.bind(InternetAddress.anyIPv4, port);
  print('listening on :' + port.toString() + ' (' + healthPath + ' answers the health check)');

  await for (final request in server) {
    if (request.uri.path == healthPath) {
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({'status': 'ok', 'app': slug}));
    } else {
      request.response.headers.contentType = ContentType.text;
      request.response.write('${input.name} is running on Blipmade.\\n');
    }
    await request.response.close();
  }
}
`;
}

/** The application of Deno: it answers on the port of the allocation. */
function denoMain(input: StarterAppInput): string {
  return `// ${input.name}, deployed by Blipmade.
//
// The application that the platform starts in this container. It answers on the
// health path of the product, so a deployment is only reported as successful
// when the application really responds. Replace this file with your own code.
const slug = ${JSON.stringify(input.slug)};
const healthPath = ${JSON.stringify(input.healthPath)};
const fallbackPort = ${input.port};

/// The port of the allocation. The panel gives that port to the container in
/// SERVER_PORT, so it is read first; the port of the allocation is the last
/// resort.
function readPort(): number {
  for (const name of ['SERVER_PORT', 'PORT']) {
    const raw = (Deno.env.get(name) ?? '').trim();
    if (raw === '') {
      continue;
    }
    const value = Number(raw);
    if (Number.isInteger(value) && value > 0 && value < 65536) {
      return value;
    }
  }
  return fallbackPort;
}

const port = readPort();
const server = Deno.serve({ hostname: '0.0.0.0', port }, (request: Request) => {
  const path = new URL(request.url).pathname;
  if (path === healthPath) {
    return new Response(JSON.stringify({ status: 'ok', app: slug }), {
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('${input.name} is running on Blipmade.\\n', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
});

console.log('listening on :' + port.toString() + ' (' + healthPath + ' answers the health check)');
await server.finished;
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
