#!/usr/bin/env node
/**
 * The load burst that measures what the API does to the machine.
 *
 * The script starts the built API on a port of its own, waits until it
 * answers, sends a burst of requests to the hot path and watches what the
 * process does with the memory while it works. The log of the process is
 * written to a file, so the growth of the log can be read afterwards.
 *
 *   node scripts/perf-data-load.mjs [--seconds 30] [--port 3109] [--url /api/catalog/products]
 *
 * The numbers this prints are the ones the limits of the containers are
 * based on.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

const seconds = Number(argument('--seconds', '30'));
const port = Number(argument('--port', '3109'));
const target = argument('--url', '/api/catalog/products');
const concurrency = Number(argument('--concurrency', '24'));
/** The process that is watched when the server is already running. */
const watchedPid = Number(argument('--pid', '0')) || null;

function flag(name) {
  return process.argv.includes(name);
}

const logFile = path.join(root, 'tmp', `perf-data-api-${port}.log`);
if (existsSync(logFile)) rmSync(logFile);
writeFileSync(logFile, '');

const api = flag('external')
  ? null
  : spawn('node', ['dist/index.js'], {
      cwd: path.join(root, 'api'),
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
const logStream = api?.stdout;
const logFileHandle = logFile;
const appendLog = (chunk) => {
  try {
    appendFileSync(logFileHandle, chunk);
  } catch {
    /* the measurement must not break the run */
  }
};
logStream?.on('data', appendLog);
api?.stderr.on('data', appendLog);

/** The resident memory of the process, in kilobytes. */
function residentKb() {
  try {
    const pid = watchedPid ?? api?.pid;
    if (!pid) return 0;
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const match = status.match(/VmRSS:\s+(\d+) kB/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

/** The resident memory of the process, in kilobytes, with the peak of the process. */
function memoryKb() {
  try {
    const pid = watchedPid ?? api?.pid;
    if (!pid) return { rss: 0, peak: 0 };
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const rss = status.match(/VmRSS:\s+(\d+) kB/);
    const peak = status.match(/VmHWM:\s+(\d+) kB/);
    return { rss: rss ? Number(rss[1]) : 0, peak: peak ? Number(peak[1]) : 0 };
  } catch {
    return { rss: 0, peak: 0 };
  }
}

/** The time the process spent on the processor, in seconds. */
function cpuSeconds() {
  try {
    const pid = watchedPid ?? api?.pid;
    if (!pid) return 0;
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // The fields after the name of the process: utime and stime are the 12th
    // and the 13th, and they are counted in clock ticks.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const ticks = Number(fields[11]) + Number(fields[12]);
    return ticks / 100;
  } catch {
    return 0;
  }
}

function waitForHealth(deadline) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get({ host: '127.0.0.1', port, path: '/health' }, (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else setTimeout(attempt, 300);
      });
      request.on('error', () => setTimeout(attempt, 300));
      request.setTimeout(2000, () => request.destroy());
    };
    if (Date.now() > deadline) {
      reject(new Error('the API did not answer in time'));
      return;
    }
    attempt();
  });
}

let finished = 0;
let errors = 0;
const latencies = [];
let running = true;

function hammer() {
  return new Promise((resolve) => {
    const started = performance.now();
    const request = http.get(
      { host: '127.0.0.1', port, path: target, agent: keepAlive },
      (response) => {
        response.resume();
        response.on('end', () => {
          latencies.push(performance.now() - started);
          finished += 1;
          resolve();
        });
      },
    );
    request.on('error', () => {
      errors += 1;
      resolve();
    });
  });
}

const keepAlive = new http.Agent({ keepAlive: true, maxSockets: concurrency * 2 });

function percentile(list, p) {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  if (!flag('external')) await waitForHealth(Date.now() + 60_000);
  const idle = residentKb();
  const cpuBefore = cpuSeconds();
  console.log(`api ready on ${port}, idle rss ${idle} kB`);

  let peak = idle;
  const sampler = setInterval(() => {
    const now = residentKb();
    if (now > peak) peak = now;
  }, 200);

  const started = Date.now();
  const workers = Array.from({ length: concurrency }, async () => {
    while (running && Date.now() - started < seconds * 1000) {
      await hammer();
    }
  });
  await Promise.all(workers);
  running = false;
  clearInterval(sampler);

  const elapsed = (Date.now() - started) / 1000;
  const memory = memoryKb();
  if (memory.peak > peak) peak = memory.peak;
  const cpuUsed = cpuSeconds() - cpuBefore;
  const logBytes = existsSync(logFile) ? readFileSync(logFile).length : 0;

  console.log(JSON.stringify({
    url: target,
    seconds: Number(elapsed.toFixed(1)),
    requests: finished,
    errors,
    requestsPerSecond: Number((finished / elapsed).toFixed(1)),
    p50ms: Number(percentile(latencies, 50).toFixed(2)),
    p97_5ms: Number(percentile(latencies, 97.5).toFixed(2)),
    maxMs: Number(Math.max(...latencies, 0).toFixed(2)),
    idleRssKb: idle,
    peakRssKb: peak,
    finalRssKb: memory.rss,
    cpuSeconds: Number(cpuUsed.toFixed(2)),
    cpuCoresUsed: Number((cpuUsed / elapsed).toFixed(2)),
    cpuMicrosecondsPerRequest: Number(((cpuUsed * 1_000_000) / Math.max(1, finished)).toFixed(1)),
    logBytes,
    logBytesPerSecond: Number((logBytes / elapsed).toFixed(1)),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (api) {
      api.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 500));
      api.kill('SIGKILL');
    }
    keepAlive.destroy();
    process.exit(process.exitCode ?? 0);
  });
