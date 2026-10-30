import { useEffect, useRef } from 'react';

/**
 * The globe of the home page.
 *
 * A sphere of dots that draws the land, turning slowly. Instances are born on
 * it: a pin lights up somewhere in the world, an arc runs from it to the hub
 * where the servers are, and the name of what was started floats next to the pin
 * and fades. The dots are drawn by WebGL, the arcs, the rings and the names by
 * a canvas laid over it. Without WebGL the dots are drawn by the canvas.
 *
 * It is an illustration, and the page says so. It stops when it is off the
 * screen or when the tab is hidden, it keeps one still frame for a reader who
 * asked for less motion, and a drag turns it.
 */

// --- the land ---------------------------------------------------------------

/**
 * The continents, as rough outlines of [longitude, latitude]. At the size of the
 * dots they only have to read as the shapes the eye knows.
 */
const LAND: number[][][] = [
  // North America
  [[-168, 66], [-162, 70], [-141, 70], [-128, 70], [-110, 73], [-95, 72], [-82, 69], [-80, 63], [-93, 59], [-94, 54], [-82, 52], [-79, 57], [-77, 62], [-66, 60], [-61, 55], [-56, 52], [-66, 44], [-70, 42], [-74, 40], [-76, 35], [-81, 31], [-80, 26], [-83, 29], [-89, 30], [-94, 29], [-97, 26], [-97, 21], [-91, 19], [-87, 21], [-88, 16], [-84, 15], [-83, 10], [-79, 9], [-82, 8], [-86, 12], [-92, 15], [-96, 16], [-105, 20], [-106, 23], [-112, 29], [-115, 30], [-110, 23], [-112, 25], [-117, 32], [-121, 35], [-124, 40], [-124, 47], [-130, 54], [-136, 58], [-146, 61], [-152, 59], [-158, 57], [-164, 55], [-157, 58], [-162, 61], [-166, 62]],
  // Greenland
  [[-73, 78], [-60, 82], [-30, 83], [-20, 80], [-19, 74], [-23, 70], [-34, 66], [-43, 60], [-50, 62], [-54, 67], [-58, 75], [-66, 76]],
  // South America
  [[-77, 8], [-72, 12], [-63, 11], [-52, 5], [-50, 0], [-44, -2], [-35, -5], [-35, -9], [-39, -15], [-41, -22], [-48, -26], [-53, -34], [-58, -35], [-57, -38], [-65, -41], [-65, -47], [-68, -52], [-69, -55], [-74, -52], [-74, -43], [-72, -33], [-70, -18], [-76, -14], [-81, -6], [-80, -1], [-78, 2], [-77, 4]],
  // Europe and Asia
  [[-10, 36], [-9, 43], [-2, 43], [-1, 46], [-4, 48], [2, 51], [5, 53], [8, 54], [9, 57], [11, 56], [14, 55], [20, 55], [22, 58], [24, 60], [22, 63], [25, 65], [22, 66], [17, 61], [18, 59], [12, 56], [8, 58], [5, 61], [10, 64], [15, 68], [22, 70], [30, 70], [41, 67], [44, 68], [55, 68], [60, 70], [69, 73], [80, 73], [90, 76], [105, 78], [112, 74], [128, 72], [140, 72], [160, 70], [170, 70], [180, 68], [180, 65], [177, 62], [165, 60], [163, 56], [156, 51], [156, 58], [142, 59], [137, 54], [141, 52], [140, 47], [132, 43], [129, 41], [127, 38], [126, 35], [127, 39], [122, 40], [121, 37], [119, 35], [122, 31], [122, 27], [117, 23], [110, 21], [108, 18], [106, 10], [105, 9], [101, 13], [100, 8], [103, 1], [101, 3], [98, 8], [98, 16], [94, 17], [92, 21], [88, 22], [87, 21], [80, 15], [80, 10], [77, 8], [73, 17], [72, 21], [67, 24], [62, 25], [57, 26], [57, 24], [59, 22], [55, 17], [45, 13], [43, 15], [39, 21], [35, 28], [34, 31], [36, 36], [30, 36], [27, 37], [26, 40], [29, 41], [28, 43], [30, 46], [34, 45], [38, 47], [37, 44], [40, 43], [48, 40], [51, 37], [54, 37], [53, 41], [50, 45], [47, 47], [52, 47], [56, 45], [60, 42], [66, 40], [72, 39], [75, 41], [80, 43], [85, 47], [90, 49], [98, 51], [108, 49], [117, 50], [120, 53], [121, 50], [117, 47], [118, 45], [111, 43], [104, 41], [99, 39], [96, 34], [91, 30], [88, 28], [82, 28], [78, 31], [74, 35], [70, 37], [65, 37], [60, 36], [56, 39], [52, 38], [49, 37], [44, 38], [40, 41], [38, 41], [33, 42], [29, 42], [23, 41], [20, 40], [19, 42], [15, 45], [12, 44], [16, 41], [18, 40], [16, 38], [12, 38], [8, 44], [3, 43], [0, 39], [-4, 36], [-6, 37]],
  // Africa
  [[-17, 21], [-16, 28], [-10, 31], [-6, 36], [3, 37], [10, 37], [11, 33], [20, 31], [25, 32], [32, 31], [35, 28], [37, 22], [43, 12], [51, 12], [49, 7], [41, -2], [40, -10], [41, -16], [35, -24], [33, -27], [27, -34], [19, -35], [17, -29], [12, -17], [14, -9], [9, -1], [10, 4], [5, 6], [-4, 5], [-8, 4], [-13, 8], [-17, 14]],
  // Madagascar
  [[44, -25], [47, -25], [50, -15], [49, -12], [45, -16]],
  // Great Britain and Ireland
  [[-6, 50], [1, 51], [2, 53], [-2, 57], [-4, 58], [-6, 57], [-4, 54], [-5, 52]],
  [[-10, 52], [-6, 52], [-6, 55], [-10, 54]],
  // Iceland
  [[-24, 64], [-14, 64], [-14, 66], [-23, 66]],
  // Japan
  [[130, 31], [133, 34], [140, 35], [142, 40], [142, 44], [145, 44], [141, 45], [139, 41], [136, 36], [131, 34]],
  // Sumatra, Borneo, Java, New Guinea, Philippines
  [[95, 5], [98, 4], [105, -3], [106, -6], [101, -3], [97, 2]],
  [[109, 1], [114, 4], [118, 6], [119, 1], [116, -4], [110, -3]],
  [[105, -7], [114, -8], [114, -9], [106, -8]],
  [[131, -1], [141, -3], [150, -10], [143, -9], [138, -8], [133, -4]],
  [[120, 18], [122, 18], [124, 12], [126, 7], [122, 7], [121, 13]],
  // Australia
  [[114, -22], [122, -18], [129, -15], [131, -12], [136, -12], [136, -16], [141, -13], [143, -11], [146, -19], [153, -26], [151, -34], [147, -38], [141, -38], [137, -35], [132, -32], [124, -33], [115, -34], [114, -28]],
  // New Zealand
  [[172, -34], [178, -38], [175, -41], [172, -41]],
  [[167, -46], [172, -41], [174, -42], [170, -46]],
  // Sri Lanka, Taiwan, Cuba
  [[80, 6], [82, 7], [80, 10]],
  [[120, 22], [122, 25], [121, 25]],
  [[-84, 22], [-77, 20], [-74, 20], [-79, 23]],
];

function insidePolygon(lon: number, lat: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The dots of the land: a grid whose columns get wider toward the poles, so the dots sit evenly on the sphere. */
function landDots(step: number): Float32Array {
  const out: number[] = [];
  for (let lat = -58; lat <= 82; lat += step) {
    const stepLon = step / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    for (let lon = -180; lon < 180; lon += stepLon) {
      if (!LAND.some((polygon) => insidePolygon(lon, lat, polygon))) continue;
      const phi = (lat * Math.PI) / 180;
      const lam = (lon * Math.PI) / 180;
      out.push(Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam));
    }
  }
  return new Float32Array(out);
}

// --- the places -------------------------------------------------------------

const HUB = { name: 'Bucharest', lat: 44.43, lon: 26.1 };

const PLACES: { name: string; lat: number; lon: number }[] = [
  { name: 'Frankfurt', lat: 50.1, lon: 8.7 },
  { name: 'London', lat: 51.5, lon: -0.1 },
  { name: 'Madrid', lat: 40.4, lon: -3.7 },
  { name: 'Warsaw', lat: 52.2, lon: 21 },
  { name: 'Istanbul', lat: 41, lon: 28.9 },
  { name: 'New York', lat: 40.7, lon: -74 },
  { name: 'Toronto', lat: 43.7, lon: -79.4 },
  { name: 'Austin', lat: 30.3, lon: -97.7 },
  { name: 'Los Angeles', lat: 34, lon: -118.2 },
  { name: 'Mexico City', lat: 19.4, lon: -99.1 },
  { name: 'São Paulo', lat: -23.5, lon: -46.6 },
  { name: 'Buenos Aires', lat: -34.6, lon: -58.4 },
  { name: 'Lagos', lat: 6.5, lon: 3.4 },
  { name: 'Cairo', lat: 30, lon: 31.2 },
  { name: 'Nairobi', lat: -1.3, lon: 36.8 },
  { name: 'Cape Town', lat: -33.9, lon: 18.4 },
  { name: 'Dubai', lat: 25.2, lon: 55.3 },
  { name: 'Mumbai', lat: 19.1, lon: 72.9 },
  { name: 'Singapore', lat: 1.35, lon: 103.8 },
  { name: 'Jakarta', lat: -6.2, lon: 106.8 },
  { name: 'Seoul', lat: 37.6, lon: 127 },
  { name: 'Tokyo', lat: 35.7, lon: 139.7 },
  { name: 'Sydney', lat: -33.9, lon: 151.2 },
  { name: 'Auckland', lat: -36.8, lon: 174.8 },
];

/** What is started on the globe: names of products of the catalog. */
const STARTED = ['discord-bot', 'minecraft', 'postgres', 'n8n', 'code-server', 'uptime-kuma', 'grafana', 'wordpress', 'redis', 'valheim', 'telegram-bot', 'mongodb', 'nextcloud', 'ghost'];

type Vec = [number, number, number];

function toVec(lat: number, lon: number): Vec {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  return [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)];
}

/** The point at `t` of the great circle between two points, lifted off the sphere in the middle. */
function arcPoint(a: Vec, b: Vec, t: number, lift: number): Vec {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const sin = Math.sin(omega) || 1;
  const k1 = Math.sin((1 - t) * omega) / sin;
  const k2 = Math.sin(t * omega) / sin;
  const raise = 1 + Math.sin(Math.PI * t) * Math.min(0.32, lift * omega);
  return [(a[0] * k1 + b[0] * k2) * raise, (a[1] * k1 + b[1] * k2) * raise, (a[2] * k1 + b[2] * k2) * raise];
}

interface Spawn {
  place: (typeof PLACES)[number];
  vec: Vec;
  label: string;
  born: number;
}

// --- the shaders ------------------------------------------------------------

const VERTEX = `
attribute vec3 p;
uniform float yaw;
uniform float pitch;
uniform float scale;
uniform vec2 aspect;
uniform float size;
uniform float time;
varying float shade;
void main() {
  float cy = cos(yaw), sy = sin(yaw);
  float cp = cos(pitch), sp = sin(pitch);
  vec3 a = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  vec3 b = vec3(a.x, a.y * cp - a.z * sp, a.y * sp + a.z * cp);
  float twinkle = 0.85 + 0.15 * sin(time * 1.3 + p.x * 40.0 + p.y * 23.0);
  shade = (smoothstep(-0.15, 0.85, b.z) * 0.88 + 0.12) * twinkle;
  gl_Position = vec4(b.x * scale * aspect.x, b.y * scale * aspect.y, 0.0, 1.0);
  gl_PointSize = size * (0.6 + 0.55 * max(b.z, 0.0));
}`;

const FRAGMENT = `
precision mediump float;
uniform vec3 tint;
varying float shade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.15, d);
  gl_FragColor = vec4(tint * (0.7 + 0.3 * shade), soft * (0.14 + 0.86 * shade));
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function rgbOf(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full.slice(0, 6), 16);
  return Number.isFinite(n) ? [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] : [0.42, 0.9, 0.6];
}

// --- the component ----------------------------------------------------------

export function Globe({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = host.current;
    const glEl = glCanvas.current;
    const flat = overlay.current;
    if (!element || !glEl || !flat) return;
    const ctx = flat.getContext('2d');
    if (!ctx) return;

    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mint = cssColor('--color-mint', '#6be598');
    const tint = rgbOf(mint);
    const dots = landDots(2.2);

    // The dots are drawn by WebGL when the browser has it.
    const gl = glEl.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false }) as WebGLRenderingContext | null;
    let program: WebGLProgram | null = null;
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    if (gl) {
      const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      if (vs && fs) {
        program = gl.createProgram();
        if (program) {
          gl.attachShader(program, vs);
          gl.attachShader(program, fs);
          gl.linkProgram(program);
          if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.useProgram(program);
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, dots, gl.STATIC_DRAW);
            const location = gl.getAttribLocation(program, 'p');
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
            for (const name of ['yaw', 'pitch', 'scale', 'aspect', 'size', 'time', 'tint']) uniforms[name] = gl.getUniformLocation(program, name);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          } else {
            program = null;
          }
        }
      }
    }

    const hub = toVec(HUB.lat, HUB.lon);
    const places = PLACES.map((place) => ({ place, vec: toVec(place.lat, place.lon) }));
    const spawns: Spawn[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let yaw = (-HUB.lon * Math.PI) / 180 + 0.5;
    let pitch = 0.62;
    let velocity = 0;
    let dragging = false;
    let lastX = 0;
    let running = false;
    let visible = true;
    let frame = 0;
    let nextSpawn = 0;
    let last = performance.now();
    const start = last;

    const resize = () => {
      const box = element.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(box.width));
      height = Math.max(1, Math.round(box.height));
      for (const canvas of [glEl, flat]) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      gl?.viewport(0, 0, glEl.width, glEl.height);
    };

    /** The sphere in view: its radius and centre, in CSS pixels. */
    const geometry = () => {
      const radius = Math.min(width, height) * 0.43;
      return { radius, cx: width / 2, cy: height / 2 };
    };

    /** Turns a point of the sphere into a point of the screen, and says how far toward the viewer it is. */
    const project = (v: Vec): { x: number; y: number; z: number } => {
      const { radius, cx, cy } = geometry();
      const cyaw = Math.cos(yaw);
      const syaw = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const ax = v[0] * cyaw + v[2] * syaw;
      const az = -v[0] * syaw + v[2] * cyaw;
      const by = v[1] * cp - az * sp;
      const bz = v[1] * sp + az * cp;
      return { x: cx + ax * radius, y: cy - by * radius, z: bz };
    };

    const drawGl = (now: number) => {
      if (!gl || !program) return false;
      const { radius } = geometry();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uniforms.yaw!, yaw);
      gl.uniform1f(uniforms.pitch!, pitch);
      // The scale and the aspect turn a unit sphere into the radius in pixels.
      gl.uniform1f(uniforms.scale!, (radius * 2) / Math.min(width, height));
      gl.uniform2f(uniforms.aspect!, Math.min(width, height) / width, Math.min(width, height) / height);
      gl.uniform1f(uniforms.size!, Math.max(2.6, radius / 82) * dpr);
      gl.uniform1f(uniforms.time!, (now - start) / 1000);
      gl.uniform3f(uniforms.tint!, tint[0], tint[1], tint[2]);
      gl.drawArrays(gl.POINTS, 0, dots.length / 3);
      return true;
    };

    const drawDots2d = () => {
      ctx.fillStyle = mint;
      const size = Math.max(1.8, geometry().radius / 130);
      for (let i = 0; i < dots.length; i += 3) {
        const p = project([dots[i]!, dots[i + 1]!, dots[i + 2]!]);
        if (p.z < -0.1) continue;
        ctx.globalAlpha = 0.2 + 0.6 * Math.max(0, p.z);
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };

    const drawOverlay = (now: number, glDrawn: boolean) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const { radius, cx, cy } = geometry();
      // A name never runs past the edge of the window, whatever the canvas does.
      const box = element.getBoundingClientRect();
      const maxX = Math.min(width, window.innerWidth - box.left) - 6;

      // The edge of the sphere: a thin line and a soft glow.
      const rim = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.18);
      rim.addColorStop(0, 'rgba(107,229,152,0)');
      rim.addColorStop(0.55, 'rgba(107,229,152,0.10)');
      rim.addColorStop(1, 'rgba(107,229,152,0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(107,229,152,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      if (!glDrawn) drawDots2d();

      const hubScreen = project(hub);
      const hubVisible = hubScreen.z > 0;

      for (const spawn of spawns) {
        const age = (now - spawn.born) / 1000;
        const life = reduced ? 0.5 : Math.min(1, age / 7.5);
        const fade = reduced ? 1 : age < 0.3 ? age / 0.3 : Math.max(0, 1 - Math.max(0, age - 4.5) / 3);
        if (fade <= 0) continue;

        // The arc from the pin to the hub grows for a second and a half, then it is a line that dims.
        const travel = reduced ? 1 : Math.min(1, age / 1.5);
        const steps = 36;
        ctx.lineWidth = 1.4;
        let started = false;
        ctx.beginPath();
        for (let i = 0; i <= steps; i += 1) {
          const t = (i / steps) * travel;
          const p = project(arcPoint(spawn.vec, hub, t, 0.14));
          if (p.z < -0.05) {
            started = false;
            continue;
          }
          if (!started) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
          started = true;
        }
        ctx.strokeStyle = `rgba(107,229,152,${0.55 * fade * (1 - life * 0.5)})`;
        ctx.stroke();

        // A spark runs along the arc while it grows.
        if (travel < 1) {
          const head = project(arcPoint(spawn.vec, hub, travel, 0.14));
          if (head.z > 0) {
            ctx.fillStyle = '#eafff1';
            ctx.beginPath();
            ctx.arc(head.x, head.y, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        const pin = project(spawn.vec);
        if (pin.z <= 0.02) continue;

        // The ring that opens when the instance is born.
        if (!reduced && age < 2.2) {
          const k = age / 2.2;
          ctx.strokeStyle = `rgba(107,229,152,${0.7 * (1 - k)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, 3 + k * 30, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(234,255,241,${fade})`;
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(107,229,152,${0.35 * fade})`;
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, 6.5, 0, Math.PI * 2);
        ctx.fill();

        // The name of what was started.
        const text = `${spawn.label} · ${spawn.place.name}`;
        ctx.font = '500 11.5px "JetBrains Mono Variable", ui-monospace, monospace';
        const w = ctx.measureText(text).width + 16;
        const side = pin.x > cx ? 1 : -1;
        const lx = Math.max(6, Math.min(maxX - w, side > 0 ? pin.x + 10 : pin.x - 10 - w));
        const ly = Math.max(6, pin.y - 26 - Math.min(10, age * 3));
        ctx.fillStyle = `rgba(18,25,21,${0.88 * fade})`;
        ctx.strokeStyle = `rgba(107,229,152,${0.4 * fade})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(lx, ly, w, 22, 11);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = `rgba(238,242,236,${fade})`;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, lx + 8, ly + 11.5);
      }

      // The hub, where the servers are: a steady light with a ring that breathes.
      if (hubVisible) {
        const breathe = reduced ? 0.5 : ((now - start) / 2200) % 1;
        ctx.strokeStyle = `rgba(107,229,152,${0.6 * (1 - breathe)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(hubScreen.x, hubScreen.y, 5 + breathe * 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = mint;
        ctx.beginPath();
        ctx.arc(hubScreen.x, hubScreen.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const render = (now: number) => {
      const glDrawn = drawGl(now);
      drawOverlay(now, glDrawn);
    };

    const tick = (now: number) => {
      frame = 0;
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!dragging) {
        velocity *= Math.pow(0.04, dt);
        yaw += (0.06 + velocity) * dt;
      }
      if (now >= nextSpawn) {
        // A place that is already lit does not light up again until it has faded.
        const free = places.filter(({ place }) => !spawns.some((spawn) => spawn.place === place));
        const pick = free[Math.floor(Math.random() * free.length)];
        if (pick) {
          spawns.push({ place: pick.place, vec: pick.vec, label: STARTED[Math.floor(Math.random() * STARTED.length)]!, born: now });
        }
        nextSpawn = now + 900 + Math.random() * 900;
      }
      while (spawns.length && now - spawns[0]!.born > 7500) spawns.shift();
      render(now);
      frame = requestAnimationFrame(tick);
    };

    const play = () => {
      if (reduced || running || !visible || document.hidden) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const pause = () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    resize();
    if (reduced) {
      // One still frame: the globe turned toward the hub, with a few places lit.
      const now = performance.now();
      for (const { place, vec } of places.filter(({ place: p }) => ['Frankfurt', 'New York', 'Tokyo', 'Cairo', 'São Paulo'].includes(p.name))) {
        spawns.push({ place, vec, label: STARTED[Math.floor(Math.random() * STARTED.length)]!, born: now });
      }
      render(now);
    }

    const observer = new ResizeObserver(() => {
      resize();
      if (!running) render(performance.now());
    });
    observer.observe(element);
    const visibility = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) play();
      else pause();
    });
    visibility.observe(element);
    const onHidden = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onHidden);
    play();

    // A drag turns the globe, and it keeps turning for a moment when it is let go.
    const down = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      velocity = 0;
      flat.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      yaw += dx * 0.006;
      velocity = dx * 0.06;
      if (!running) render(performance.now());
    };
    const up = () => {
      dragging = false;
    };
    flat.addEventListener('pointerdown', down);
    flat.addEventListener('pointermove', move);
    flat.addEventListener('pointerup', up);
    flat.addEventListener('pointercancel', up);

    return () => {
      pause();
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', onHidden);
      flat.removeEventListener('pointerdown', down);
      flat.removeEventListener('pointermove', move);
      flat.removeEventListener('pointerup', up);
      flat.removeEventListener('pointercancel', up);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <div ref={host} className={className} role="img" aria-label="A globe where instances are started around the world and connect to the Blipmade servers.">
      <canvas ref={glCanvas} aria-hidden="true" className="absolute inset-0 size-full" />
      <canvas ref={overlay} aria-hidden="true" className="absolute inset-0 size-full cursor-grab touch-pan-y active:cursor-grabbing" />
    </div>
  );
}
