#!/usr/bin/env node
/**
 * Brings the eggs of the bare runtimes and of the products without an
 * application to a state in which their start-up command finds something to
 * run.
 *
 * The audit of the node found that nine products never served anybody:
 *
 *   - the eggs of the runtimes (Elixir, Go, .NET, Java, Rust, Dart, Deno)
 *     install nothing and start a program that is not there. `mix run` answers
 *     "Could not find a Mix.Project", `dotnet run` answers "The project file
 *     could not be found", and the container is alive but serves nobody;
 *   - the egg of Go names an image that carries no compiler at all;
 *   - the egg of Deno asks the address of the releases of GitHub, and the node
 *     answers with the rate of the requests, so the container gets no file;
 *   - the egg of TeamSpeak 6 looks for a file of ".tar.bz2", and the project
 *     publishes ".tar.xz", so the install always fails;
 *   - the egg of Don't Starve Together names an image of the Source engine,
 *     which has no server of that game, and the number of the application is
 *     the one of the game and not the one of its dedicated server;
 *   - the egg of the SFTP share starts nothing: the share is the file transfer
 *     of the node, so the instance has no service of its own on the port of
 *     its allocation.
 *
 * The script is idempotent: an egg that is already patched is left as it is.
 *
 * Usage:
 *   node scripts/patch-runtime-eggs.mjs           # patches the files
 *   node scripts/patch-runtime-eggs.mjs --check   # only says what is missing
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'pterodactyl-eggs');

/**
 * The lines that stop the install of a runtime when no repository is named.
 *
 * The customer of a bare runtime brings the code, and the platform puts the
 * application of the product in the container when there is none. Without these
 * lines the script of the install asks GitHub for the repository ".", fails,
 * and the container is left without the files the start-up command needs.
 */
export const EMPTY_REPOSITORY_GUARD = [
  '## No repository: the platform puts the application of the product into the',
  '## container, and there is nothing to clone.',
  'if [ -z "${GIT_ADDRESS}" ]; then',
  '    echo -e "no repository was given, the application of the platform is used"',
  '    exit 0',
  'fi',
  '',
].join('\n');

/** The line the guard is written before. */
const REPOSITORY_ANCHOR = '## add git ending if it\'s not on the address';

/**
 * Brings the script of an install to the runtime that has no repository.
 */
export function withEmptyRepositoryGuard(script) {
  if (!script.includes(REPOSITORY_ANCHOR)) return script;
  if (script.includes('no repository was given')) return script;
  const at = script.indexOf(REPOSITORY_ANCHOR);
  if (at === -1) return script;
  return `${script.slice(0, at)}${EMPTY_REPOSITORY_GUARD}\n${script.slice(at)}`;
}

/**
 * The script of the install of the runtime of Go.
 *
 * The image of the platform carried no compiler at all, and the script built
 * the program of the customer from a package of the network. The compiler is
 * now in the image of the egg, and the program is built from the directory of
 * the instance.
 */
export const GOLANG_INSTALL = [
  '#!/bin/bash',
  '# golang generic package',
  '#',
  '# The customer brings the code, and the platform puts an application in the',
  '# container when there is none.',
  '',
  'if [ ! -d /mnt/server/ ]; then',
  '    mkdir -p /mnt/server/',
  'fi',
  '',
  'cd /mnt/server',
  '',
  '## No package: the platform puts the application of the product into the',
  '## container, and there is nothing to build from the network.',
  'if [ -z "${GO_PACKAGE}" ]; then',
  '    echo -e "no package was given, the application of the platform is used"',
  '    exit 0',
  'fi',
  '',
  '## The module of the customer is used when there is one.',
  'if [ ! -f go.mod ]; then',
  '    go mod init blipmade',
  'fi',
  '',
  'go get ${GO_PACKAGE}',
  'go build -o ${EXECUTABLE} .',
  'chmod +x ${EXECUTABLE}',
  '',
  'echo -e "install complete"',
  'exit 0',
].join('\n');

/**
 * The start-up command of the runtime of Go.
 *
 * The command ran a program that the install was meant to build, and the
 * container of a customer who brought the code had nothing to run. The program
 * is built from the directory of the instance and then run.
 */
export const GOLANG_STARTUP = 'go build -o {{EXECUTABLE}} . && ./{{EXECUTABLE}}';

/**
 * The images of the runtime of Go.
 *
 * The image of the egg carried no compiler, so the program could not be built
 * at all.
 */
export const GOLANG_IMAGES = {
  'Go Latest': 'ghcr.io/ptero-eggs/yolks:go_latest',
  'Go 1.25': 'ghcr.io/ptero-eggs/yolks:go_1.25',
  'Go 1.24': 'ghcr.io/ptero-eggs/yolks:go_1.24',
};

/**
 * The start-up command of the runtime of Java.
 *
 * The command ran a jar that no one had built: the container of a customer who
 * brought the code had nothing to run. The sources of the directory are
 * compiled when the jar is not there yet.
 */
export const JAVA_STARTUP =
  'if [ ! -f {{JARFILE}} ]; then mkdir -p build && javac -d build *.java && jar cfe {{JARFILE}} {{MAIN_CLASS}} -C build .; fi; ' +
  'java -Dterminal.jline=false -Dterminal.ansi=true -jar {{JARFILE}}';

/**
 * The version of Deno that the install takes.
 *
 * The address of the releases of the project answers with the rate of the
 * requests of GitHub, and a container that asks for it when the rate is spent
 * gets no file at all. The version is therefore written down here, and the file
 * is taken from the address of the release.
 */
export const DENO_VERSION = '2.9.8';

/**
 * The script of the install of the runtime of Deno.
 *
 * Only the part that takes the file of the program is replaced: the part that
 * clones the repository of the customer stays as it is.
 */
export const DENO_DOWNLOAD = [
  '## get deno',
  '##',
  '## The address of the releases of the project answers with the rate of the',
  '## requests of GitHub, and a container that asks for it when the rate is',
  '## spent gets no file at all. The version is therefore written down here,',
  '## and the file is taken from the address of the release.',
  'DENO_VERSION="${VERSION}"',
  'if [ -z "$DENO_VERSION" ] || [ "$DENO_VERSION" == "latest" ]; then',
  `    DENO_VERSION=${DENO_VERSION}`,
  'fi',
  '',
  'DENO_URL="https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-x86_64-unknown-linux-gnu.zip"',
  '',
  'curl -sSL -o deno.zip "$DENO_URL"',
  'unzip -o deno.zip',
  'rm -f deno.zip',
  'chmod +x deno',
  '',
  'echo -e "install complete"',
  'exit 0',
].join('\n');

/**
 * The script of the install of TeamSpeak 6.
 *
 * The script looked for a file of ".tar.bz2" with a name of "linux_amd64", and
 * the project publishes "teamspeak6-server-linux-amd64.tar.xz". The install
 * therefore always failed with "Not found: latest", and the container started
 * without the server of the product.
 *
 * The version is written down as well, because the address of the releases of
 * GitHub answers with the rate of the requests, and a container that asks for
 * it when the rate is spent gets no file at all.
 */
export const TEAMSPEAK_VERSION = '6.0.0-beta13.1';

export const TEAMSPEAK_INSTALL = [
  '#!/bin/bash',
  '# Teamspeak 6 Server Installation Script',
  '#',
  '# Server Files: /mnt/server',
  'cd /mnt/server',
  '',
  'apt-get update',
  'apt-get install -y jq bzip2 xz-utils',
  '',
  'ver="$TS_VERSION"',
  'if [ -z "$ver" ] || [ "$ver" = "latest" ]; then',
  `    ver="${TEAMSPEAK_VERSION}"`,
  'fi',
  '',
  '## The release is taken from the address of the release, and not from the',
  '## address of the releases of GitHub: that address answers with the rate of',
  '## the requests, and a container that asks for it when the rate is spent',
  '## gets no file at all.',
  'url="https://github.com/teamspeak/teamspeak6-server/releases/download/v${ver}/teamspeak6-server-linux-amd64.tar.xz"',
  '',
  'if ! curl --output /dev/null --silent --head --fail "$url"; then',
  '    echo "Not found: $ver"',
  '    exit 1',
  'fi',
  '',
  'curl -sSL "$url" | tar xJf -',
  'chmod +x tsserver',
  '',
  'echo "Installed"',
].join('\n');

/**
 * The start-up command of TeamSpeak 6.
 *
 * The server of the product listens on the port of the allocation for the
 * voice. The file transfer listens on the port that follows it, so two
 * instances of the product on the same node do not fight for the same port.
 */
export const TEAMSPEAK_STARTUP =
  './tsserver --default-voice-port={{SERVER_PORT}} --filetransfer-port=$(( {{SERVER_PORT}} + 1 ))';

/**
 * The image of Don't Starve Together.
 *
 * The image of the egg was the one of the Source engine, and it holds no
 * server of that game. The server of the game comes from Steam, and the image
 * of Steam is the one that runs it.
 */
export const DST_IMAGES = {
  SteamCMD: 'ghcr.io/ptero-eggs/steamcmd:debian',
};

/**
 * The number of the application of Don't Starve Together.
 *
 * The egg named the number of the game, and the server of the game has
 * another one.
 */
export const DST_APPID = '322333';

/**
 * The start-up command of Don't Starve Together.
 *
 * The command started two shards, and the port of the second one was written
 * down (11000), so two instances of the product on the same node fought for
 * the same port. The instance runs the shard of the world, on the port of its
 * allocation.
 */
export const DST_STARTUP =
  'cd bin64 && ./dontstarve_dedicated_server_nullrenderer_x64 -bind_ip 0.0.0.0 -port {{SERVER_PORT}} ' +
  '-persistent_storage_root /home/container/DoNotStarveTogether -conf_dir config -cluster server ' +
  '-players {{MAX_PLAYERS}} -shard Master';

/**
 * The images of the SFTP share.
 *
 * The image of the egg ran its programs as a user that may write nothing
 * outside of its own directory, so the server of the share could not be
 * installed there. The image of Alpine runs as root, and the server of the
 * share answers on the port of the allocation.
 */
export const SFTP_IMAGES = {
  'Alpine 3.21': 'alpine:3.21',
};

/**
 * The script of the install of the SFTP share.
 *
 * The container of the product starts the server of the share on the port of
 * its allocation. The server is installed when the container starts, because
 * the image of the product is small and the files of the install would be
 * taken away with the container anyway.
 */
export const SFTP_INSTALL = [
  '#!/bin/bash',
  '# SFTP Storage Share Installation Script',
  '#',
  '# Server Files: /mnt/server',
  'mkdir -p /mnt/server/share',
  'cd /mnt/server',
  '',
  'echo -e "install complete"',
  'exit 0',
].join('\n');

/**
 * The start-up command of the SFTP share.
 *
 * The container started nothing: the share was the file transfer of the node,
 * and the instance had no service of its own on the port of its allocation.
 * The container now runs the server of the share on that port, and the
 * customer reaches the files of the instance with his own password.
 */
export const SFTP_STARTUP = [
  'apk add --no-cache openssh >/dev/null 2>&1',
  'adduser -D -h /home/container -s /sbin/nologin container 2>/dev/null',
  'echo "container:{{SFTP_PASSWORD}}" | chpasswd',
  'ssh-keygen -A >/dev/null 2>&1',
  'mkdir -p /etc/ssh',
  'printf "%s\\n" "Port {{SERVER_PORT}}" "HostKey /etc/ssh/ssh_host_ed25519_key" "PasswordAuthentication yes" "PermitRootLogin no" "Subsystem sftp internal-sftp" "StrictModes no" > /etc/ssh/sshd_config',
  'exec /usr/sbin/sshd -D -e',
].join('; ');

/** The variable that holds the password of the share. */
export const SFTP_PASSWORD_VARIABLE = {
  name: 'Password of the share',
  description:
    'The password of the SFTP account of this instance. The customer reaches the files of the instance with it.',
  env_variable: 'SFTP_PASSWORD',
  default_value: '',
  user_viewable: true,
  user_editable: true,
  rules: 'required|string|max:64',
  field_type: 'text',
};

/** The variable that holds the class that starts the program of Java. */
export const JAVA_MAIN_CLASS_VARIABLE = {
  name: 'Main class',
  description: 'The class that starts the program of the jar.',
  env_variable: 'MAIN_CLASS',
  default_value: 'Starter',
  user_viewable: true,
  user_editable: true,
  rules: 'required|string|max:64',
  field_type: 'text',
};

/**
 * The line that tells the node that the program of the container is ready.
 *
 * The node reads the output of the program and waits for that line before it
 * calls the container "running". The line of the eggs of the runtimes was the
 * text of the place-holder of the upstream egg ("change this part"), which no
 * program ever prints, so the container of a product that worked was still
 * "offline" for the node. Every application of the platform says that it is
 * listening, so the eggs of the runtimes wait for that word.
 */
export const READY_MARKER = 'listening on';

/**
 * Brings the line that tells the node that the program is ready to the word
 * the application of the platform prints.
 */
export function withReadyMarker(config) {
  const startup = typeof config?.startup === 'string' ? config.startup : '{}';
  if (startup.includes(READY_MARKER)) return false;
  config.startup = JSON.stringify({ done: READY_MARKER });
  return true;
}

/**
 * The value of a variable of an egg, or nothing when the egg has no such
 * variable.
 */
function variableOf(egg, envVariable) {
  return (egg.variables ?? []).find((variable) => variable.env_variable === envVariable);
}

/** The changes of an egg, one by one. Each of them says if it changed the egg. */
const PATCHES = {
  'elixir.json': (egg) => {
    let changed = false;

    const install = withEmptyRepositoryGuard(egg.scripts.installation.script);
    if (install !== egg.scripts.installation.script) {
      egg.scripts.installation.script = install;
      changed = true;
    }

    if (withReadyMarker(egg.config)) changed = true;

    return changed;
  },

  'rust-runtime.json': (egg) => {
    let changed = false;

    const install = withEmptyRepositoryGuard(egg.scripts.installation.script);
    if (install !== egg.scripts.installation.script) {
      egg.scripts.installation.script = install;
      changed = true;
    }

    // The cache of the compiler is written in the home of the user of the
    // container, and the image of the platform has no place to write it.
    if (!egg.startup.includes('CARGO_HOME')) {
      egg.startup = 'export CARGO_HOME=/home/container/.cargo; ' + egg.startup;
      changed = true;
    }

    if (withReadyMarker(egg.config)) changed = true;

    return changed;
  },

  'dotnet.json': (egg) => {
    let changed = false;

    const install = withEmptyRepositoryGuard(egg.scripts.installation.script);
    if (install !== egg.scripts.installation.script) {
      egg.scripts.installation.script = install;
      changed = true;
    }

    // The project of the platform is the file that the start-up command names.
    const project = variableOf(egg, 'PROJECT_FILE');
    if (project && project.default_value !== 'Blipmade.csproj') {
      project.default_value = 'Blipmade.csproj';
      changed = true;
    }

    if (withReadyMarker(egg.config)) changed = true;

    return changed;
  },

  'golang.json': (egg) => {
    let changed = false;

    if (egg.scripts.installation.script !== GOLANG_INSTALL) {
      egg.scripts.installation.script = GOLANG_INSTALL;
      changed = true;
    }

    if (egg.startup !== GOLANG_STARTUP) {
      egg.startup = GOLANG_STARTUP;
      changed = true;
    }

    const images = JSON.stringify(egg.docker_images);
    if (images !== JSON.stringify(GOLANG_IMAGES)) {
      egg.docker_images = GOLANG_IMAGES;
      changed = true;
    }

    // The package of the customer is optional: the platform puts the
    // application of the product in the container when there is none, and a
    // value that the platform makes out of thin air would be a package that
    // does not exist.
    const packageVariable = variableOf(egg, 'GO_PACKAGE');
    if (packageVariable && packageVariable.rules !== 'nullable|string') {
      packageVariable.rules = 'nullable|string';
      changed = true;
    }

    const executable = variableOf(egg, 'EXECUTABLE');
    if (executable && (executable.default_value !== 'starter' || executable.rules !== 'nullable|string')) {
      executable.default_value = 'starter';
      executable.rules = 'nullable|string';
      changed = true;
    }

    // The install of the product of a customer builds his program, so the
    // install runs in the image that carries the compiler.
    const installation = egg.scripts?.installation;
    if (installation && (installation.container !== 'ghcr.io/ptero-eggs/yolks:go_latest' || installation.entrypoint !== 'sh')) {
      installation.container = 'ghcr.io/ptero-eggs/yolks:go_latest';
      installation.entrypoint = 'sh';
      changed = true;
    }

    if (withReadyMarker(egg.config)) changed = true;

    return changed;
  },

  'java.json': (egg) => {
    let changed = false;

    if (egg.startup !== JAVA_STARTUP) {
      egg.startup = JAVA_STARTUP;
      changed = true;
    }

    const jar = variableOf(egg, 'JARFILE');
    if (jar && jar.default_value !== 'starter.jar') {
      jar.default_value = 'starter.jar';
      changed = true;
    }

    if (!variableOf(egg, 'MAIN_CLASS')) {
      egg.variables = [...(egg.variables ?? []), JAVA_MAIN_CLASS_VARIABLE];
      changed = true;
    }

    if (withReadyMarker(egg.config)) changed = true;

    return changed;
  },

  'dart.json': (egg) => {
    let changed = false;

    const install = withEmptyRepositoryGuard(egg.scripts.installation.script);
    if (install !== egg.scripts.installation.script) {
      egg.scripts.installation.script = install;
      changed = true;
    }

    if (withReadyMarker(egg.config)) changed = true;

    return changed;
  },

  'deno.json': (egg) => {
    let changed = false;

    const script = egg.scripts.installation.script;
    if (script.includes('## get deno')) {
      const at = script.indexOf('## get deno');
      const patched = `${script.slice(0, at)}${DENO_DOWNLOAD}\n`;
      if (patched !== script) {
        egg.scripts.installation.script = patched;
        changed = true;
      }
    } else {
      const install = withEmptyRepositoryGuard(script);
      if (install !== script) {
        egg.scripts.installation.script = install;
        changed = true;
      }
    }

    // The program of Deno needs the right to open the port of the allocation
    // and to read the settings of the container.
    if (!egg.startup.includes('--allow-net')) {
      egg.startup = egg.startup.replace('{{JS_FILE}}', '--allow-net --allow-env {{JS_FILE}}');
      changed = true;
    }

    const file = variableOf(egg, 'JS_FILE');
    if (file && file.default_value !== 'main.ts') {
      file.default_value = 'main.ts';
      changed = true;
    }

    if (withReadyMarker(egg.config)) changed = true;

    return changed;
  },

  'dont-starve-together.json': (egg) => {
    let changed = false;

    if (JSON.stringify(egg.docker_images) !== JSON.stringify(DST_IMAGES)) {
      egg.docker_images = DST_IMAGES;
      changed = true;
    }

    const appid = variableOf(egg, 'SRCDS_APPID');
    if (appid && appid.default_value !== DST_APPID) {
      appid.default_value = DST_APPID;
      changed = true;
    }

    if (egg.startup !== DST_STARTUP) {
      egg.startup = DST_STARTUP;
      changed = true;
    }

    return changed;
  },

  'teamspeak-6.json': (egg) => {
    let changed = false;

    if (egg.scripts.installation.script !== TEAMSPEAK_INSTALL) {
      egg.scripts.installation.script = TEAMSPEAK_INSTALL;
      changed = true;
    }

    if (egg.startup !== TEAMSPEAK_STARTUP) {
      egg.startup = TEAMSPEAK_STARTUP;
      changed = true;
    }

    const version = variableOf(egg, 'TS_VERSION');
    if (version && version.default_value !== TEAMSPEAK_VERSION) {
      version.default_value = TEAMSPEAK_VERSION;
      changed = true;
    }

    return changed;
  },

  'sftp-share.json': (egg) => {
    let changed = false;

    if (JSON.stringify(egg.docker_images) !== JSON.stringify(SFTP_IMAGES)) {
      egg.docker_images = SFTP_IMAGES;
      changed = true;
    }

    if (egg.scripts.installation.script !== SFTP_INSTALL) {
      egg.scripts.installation.script = SFTP_INSTALL;
      changed = true;
    }

    if (egg.startup !== SFTP_STARTUP) {
      egg.startup = SFTP_STARTUP;
      changed = true;
    }

    if (!variableOf(egg, 'SFTP_PASSWORD')) {
      egg.variables = [...(egg.variables ?? []), SFTP_PASSWORD_VARIABLE];
      changed = true;
    }

    return changed;
  },
};

async function main() {
  const check = process.argv.includes('--check');
  let changed = 0;

  for (const [file, patch] of Object.entries(PATCHES)) {
    const path = join(DIR, file);
    let raw;
    try {
      raw = await readFile(path, 'utf-8');
    } catch {
      continue;
    }

    const egg = JSON.parse(raw);
    const before = JSON.stringify(egg);
    const patched = patch(egg);
    if (!patched || JSON.stringify(egg) === before) continue;

    changed += 1;
    console.info(`${file}: the egg was brought to a state in which it serves`);
    if (check) continue;

    await writeFile(path, `${JSON.stringify(egg, null, 4)}\n`, 'utf-8');
  }

  console.info(check ? `${changed} eggs would change.` : `${changed} eggs changed.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
