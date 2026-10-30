import { useEffect, useRef } from 'react';
import { brandPathOf } from '../brand-icons';

/**
 * The shape of what you choose.
 *
 * An isometric scene that is drawn from the configurator below it. The memory
 * is a row of sticks, the processors are chips on a board, and the disk is the
 * stack of plates the whole thing stands on. Move a slider and the pieces drop
 * in or lift away, so the price the visitor reads is something they can also
 * see. The logo of the product floats above it.
 *
 * It stops when it is off the screen, it keeps still for a reader who asked for
 * less motion, and it moves a little with the pointer.
 */

export interface Shape {
  slug: string;
  ram: number;
  cpu: number;
  disk: number;
  minRam: number;
  maxRam: number;
  maxCpu: number;
  minDisk: number;
  maxDisk: number;
}

interface Piece {
  kind: 'ram' | 'cpu' | 'disk';
  index: number;
  /** How present the piece is: 0 is gone, 1 is in place. It follows the target with a spring. */
  v: number;
  target: number;
}

/** The colours of the bar of the cost, so the scene and the bar speak the same language. */
const TONES = {
  ram: '#46e58f',
  cpu: '#2fb673',
  disk: '#1d8556',
} as const;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

/** How many pieces of a kind the shape shows. The counts are capped, so a large size grows the piece, not the crowd. */
function counts(shape: Shape) {
  const ramUnit = Math.max(256, Math.ceil(shape.maxRam / 10 / 256) * 256);
  return {
    ram: Math.max(1, Math.min(10, Math.ceil(shape.ram / ramUnit))),
    cpu: Math.max(1, Math.min(12, Math.ceil(shape.cpu * 2))),
    disk: Math.max(1, Math.min(9, Math.ceil((shape.disk / Math.max(1, shape.maxDisk)) * 9))),
    ramUnit,
  };
}

export function ConfigScene({ shape, className }: { shape: Shape; className?: string }) {
  const host = useRef<HTMLCanvasElement>(null);
  const latest = useRef(shape);
  latest.current = shape;

  useEffect(() => {
    const canvas = host.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pieces: Piece[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let running = false;
    let visible = true;
    let frame = 0;
    let look = { x: 0, y: 0 };
    let aim = { x: 0, y: 0 };
    const start = performance.now();
    let logo: { slug: string; path: Path2D | null } = { slug: '', path: null };

    const ensure = (kind: Piece['kind'], index: number): Piece => {
      let piece = pieces.find((entry) => entry.kind === kind && entry.index === index);
      if (!piece) {
        piece = { kind, index, v: reduced ? 1 : 0, target: 0 };
        pieces.push(piece);
      }
      return piece;
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(box.width));
      height = Math.max(1, Math.round(box.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };

    // --- drawing ----------------------------------------------------------

    /** One box of the scene, in grid units, with its three visible faces. */
    const box = (
      u: number,
      ox: number,
      oy: number,
      x: number,
      y: number,
      z: number,
      w: number,
      d: number,
      h: number,
      color: string,
      alpha: number,
    ) => {
      const p = (px: number, py: number, pz: number): [number, number] => [ox + (px - py) * u * 0.866, oy + (px + py) * u * 0.5 - pz * u];
      const a = p(x, y, z + h);
      const b = p(x + w, y, z + h);
      const c = p(x + w, y + d, z + h);
      const e = p(x, y + d, z + h);
      const f = p(x, y + d, z);
      const g = p(x + w, y + d, z);
      const i = p(x + w, y, z);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = shade(color, 1.12);
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.lineTo(...c);
      ctx.lineTo(...e);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(color, 0.62);
      ctx.beginPath();
      ctx.moveTo(...e);
      ctx.lineTo(...c);
      ctx.lineTo(...g);
      ctx.lineTo(...f);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(color, 0.82);
      ctx.beginPath();
      ctx.moveTo(...b);
      ctx.lineTo(...c);
      ctx.lineTo(...g);
      ctx.lineTo(...i);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const label = (text: string, x: number, y: number, align: 'left' | 'right') => {
      ctx.font = '500 12px "JetBrains Mono Variable", ui-monospace, monospace';
      const w = ctx.measureText(text).width + 18;
      const lx = align === 'left' ? x : x - w;
      ctx.fillStyle = 'rgba(18,25,21,0.92)';
      ctx.strokeStyle = 'rgba(107,229,152,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(lx, y - 12, w, 24, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#eef2ec';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, lx + 9, y + 0.5);
    };

    const render = (now: number) => {
      const s = latest.current;
      const t = (now - start) / 1000;
      const c = counts(s);
      // The pieces that the shape wants are present; the others lift away.
      for (const kind of ['ram', 'cpu', 'disk'] as const) {
        const wanted = c[kind];
        for (let index = 0; index < 12; index += 1) {
          const exists = pieces.find((piece) => piece.kind === kind && piece.index === index);
          if (index < wanted) ensure(kind, index).target = 1;
          else if (exists) exists.target = 0;
        }
      }
      for (const piece of pieces) piece.v += (piece.target - piece.v) * (reduced ? 1 : 0.14);

      look.x += (aim.x - look.x) * 0.06;
      look.y += (aim.y - look.y) * 0.06;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const u = Math.min(width / 15.5, height / 11);
      const ox = width / 2 + look.x * 10;
      const oy = height * 0.62 + look.y * 6;
      const bob = reduced ? 0 : Math.sin(t * 1.2) * 0.07;

      // The floor: a grid that fades toward the edges, and a ring that breathes.
      ctx.lineWidth = 1;
      for (let i = -6; i <= 6; i += 1) {
        const fade = Math.max(0, 1 - Math.abs(i) / 7);
        ctx.strokeStyle = `rgba(107,229,152,${0.07 + 0.1 * fade})`;
        const a: [number, number] = [ox + (i - -6) * u * 0.866, oy + (i + -6) * u * 0.5 + u * 0.25];
        const b: [number, number] = [ox + (i - 6) * u * 0.866, oy + (i + 6) * u * 0.5 + u * 0.25];
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
        const a2: [number, number] = [ox + (-6 - i) * u * 0.866, oy + (-6 + i) * u * 0.5 + u * 0.25];
        const b2: [number, number] = [ox + (6 - i) * u * 0.866, oy + (6 + i) * u * 0.5 + u * 0.25];
        ctx.beginPath();
        ctx.moveTo(...a2);
        ctx.lineTo(...b2);
        ctx.stroke();
      }
      const ring = reduced ? 0.5 : (t / 3) % 1;
      ctx.strokeStyle = `rgba(107,229,152,${0.35 * (1 - ring)})`;
      ctx.beginPath();
      ctx.ellipse(ox, oy + u * 0.4, u * (2.5 + ring * 4.5), u * (2.5 + ring * 4.5) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // The plates of the disk, from the bottom up: the thickness of the stack is the size of the disk.
      const plates = pieces.filter((piece) => piece.kind === 'disk').sort((a, b) => a.index - b.index);
      let top = 0;
      for (const piece of plates) {
        if (piece.v < 0.02) continue;
        const drop = (1 - piece.v) * 2.4;
        box(u, ox, oy, -3.2, -3.2, top + drop, 6.4, 6.4, 0.26 * Math.min(1, piece.v + 0.3), TONES.disk, Math.min(0.9, piece.v * 1.2));
        top += 0.3 * piece.v;
      }
      const floor = top + 0.02;

      // The chips and the sticks stand on the top plate, drawn from the back to the front.
      type Item = { depth: number; draw: () => void };
      const items: Item[] = [];
      for (const piece of pieces) {
        if (piece.v < 0.02) continue;
        const rise = (1 - piece.v) * 3.2 + (reduced ? 0 : Math.sin(t * 1.6 + piece.index) * 0.04);
        if (piece.kind === 'ram') {
          const x = -2.7 + piece.index * 0.52;
          items.push({
            depth: x - 2.6,
            draw: () => box(u, ox, oy, x, -2.7, floor + rise, 0.4, 0.4, 1.9 * Math.min(1, piece.v + 0.2), TONES.ram, Math.min(1, piece.v * 1.4)),
          });
        } else if (piece.kind === 'cpu') {
          const col = piece.index % 4;
          const row = Math.floor(piece.index / 4);
          const x = -1.9 + col * 1.15;
          const y = -1 + row * 1.15;
          items.push({
            depth: x + y,
            draw: () => {
              box(u, ox, oy, x, y, floor + rise, 0.9, 0.9, 0.3, TONES.cpu, Math.min(1, piece.v * 1.4));
              box(u, ox, oy, x + 0.27, y + 0.27, floor + rise + 0.3, 0.36, 0.36, 0.08, '#d6ffe6', Math.min(1, piece.v * 1.4));
            },
          });
        }
      }
      items.sort((a, b) => a.depth - b.depth).forEach((item) => item.draw());

      // The logo of the product, floating above the pieces.
      if (latest.current.slug !== logo.slug) {
        const d = brandPathOf(latest.current.slug);
        logo = { slug: latest.current.slug, path: d ? new Path2D(d) : null };
      }
      const lx = ox;
      const ly = oy - u * (4.6 + bob) - top * u;
      ctx.fillStyle = 'rgba(24,34,28,0.94)';
      ctx.strokeStyle = 'rgba(107,229,152,0.45)';
      ctx.lineWidth = 1.2;
      const tile = Math.max(44, u * 1.7);
      ctx.beginPath();
      ctx.roundRect(lx - tile / 2, ly - tile / 2, tile, tile, tile * 0.3);
      ctx.fill();
      ctx.stroke();
      if (logo.path) {
        ctx.save();
        ctx.translate(lx - tile * 0.3, ly - tile * 0.3);
        ctx.scale((tile * 0.6) / 24, (tile * 0.6) / 24);
        ctx.fillStyle = '#eef2ec';
        ctx.fill(logo.path);
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(107,229,152,0.3)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, ly + tile / 2);
      ctx.lineTo(lx, oy - u * (2.4 + top));
      ctx.stroke();
      ctx.setLineDash([]);

      // The three numbers, each next to its pieces.
      const mem = s.ram >= 1024 ? `${Math.round((s.ram / 1024) * 100) / 100} GB` : `${s.ram} MB`;
      label(`RAM ${mem}`, ox - u * 3.4, oy - u * 1.9, 'right');
      label(`${s.cpu} vCPU`, ox + u * 3.1, oy + u * 0.1, 'left');
      label(`Disk ${s.disk} GB`, ox + u * 2.4, oy + u * 2.4, 'left');
    };

    const tick = (now: number) => {
      frame = 0;
      if (!running) return;
      render(now);
      frame = requestAnimationFrame(tick);
    };
    const play = () => {
      if (reduced || running || !visible || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(tick);
    };
    const pause = () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    resize();
    render(performance.now());
    const observer = new ResizeObserver(() => {
      resize();
      if (!running) render(performance.now());
    });
    observer.observe(canvas);
    const visibility = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) play();
      else pause();
    });
    visibility.observe(canvas);
    const onHidden = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onHidden);
    const move = (event: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      aim = { x: (event.clientX - r.left) / r.width - 0.5, y: (event.clientY - r.top) / r.height - 0.5 };
    };
    const leave = () => (aim = { x: 0, y: 0 });
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    play();

    // With reduced motion the scene is drawn again when the shape changes, since nothing else would.
    let last = '';
    const watch = window.setInterval(() => {
      const s = latest.current;
      const key = `${s.slug}${s.ram}${s.cpu}${s.disk}`;
      if (reduced && key !== last) {
        last = key;
        render(performance.now());
      }
    }, 250);

    return () => {
      pause();
      window.clearInterval(watch);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', onHidden);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <canvas
      ref={host}
      role="img"
      aria-label={`The size you chose, drawn: ${shape.ram} MB of memory, ${shape.cpu} vCPU and ${shape.disk} GB of disk.`}
      className={className}
    />
  );
}
