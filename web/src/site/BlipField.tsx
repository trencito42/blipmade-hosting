import { useEffect, useRef } from 'react';

/**
 * The canvas of the closing call to action.
 *
 * It draws what the mark of the platform draws: a small square that sends
 * waves to the right. Every wave that passes lights the dots it crosses, like
 * a service that answers. It is decoration, so it is hidden from the readers
 * of the screen, it stops when it is out of view or the tab is hidden, and
 * with reduced motion it draws one still frame.
 */

const GREEN = '78, 229, 149';
const DOTS = 46;

interface Dot {
  x: number;
  y: number;
  r: number;
}

/** A small deterministic generator, so the dots are the same on every visit. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function BlipField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const random = seeded(7);
    const dots: Dot[] = Array.from({ length: DOTS }, () => ({ x: 0.24 + random() * 0.74, y: 0.06 + random() * 0.88, r: 1.6 + random() * 2.2 }));
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    const started = performance.now();

    const size = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (now: number) => {
      context.clearRect(0, 0, width, height);
      const ox = width * 0.14;
      const oy = height * 0.5;
      const reach = Math.hypot(width, height * 0.5);
      const time = still ? 2400 : now - started;
      const period = 2200;
      const waves = 4;

      // The dots light up when a wave is close to them.
      for (const dot of dots) {
        const x = dot.x * width;
        const y = dot.y * height;
        const distance = Math.hypot(x - ox, y - oy);
        let glow = 0;
        for (let wave = 0; wave < waves; wave += 1) {
          const radius = ((time - wave * period) % (period * waves)) / (period * waves) * reach * 1.1;
          if (radius < 0) continue;
          glow = Math.max(glow, 1 - Math.min(1, Math.abs(distance - radius) / 46));
        }
        context.fillStyle = `rgba(${GREEN}, ${0.16 + glow * 0.84})`;
        context.beginPath();
        context.arc(x, y, dot.r + glow * 2.4, 0, Math.PI * 2);
        context.fill();
      }

      // The waves are arcs that open to the right, like the mark.
      for (let wave = 0; wave < waves; wave += 1) {
        const progress = (((time - wave * period) % (period * waves)) + period * waves) % (period * waves) / (period * waves);
        const radius = progress * reach * 1.1;
        context.strokeStyle = `rgba(${GREEN}, ${(1 - progress) * 0.55})`;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(ox, oy, radius, -0.62, 0.62);
        context.stroke();
      }

      // The source: the square of the mark.
      const side = Math.min(34, width * 0.08);
      context.fillStyle = `rgb(${GREEN})`;
      context.beginPath();
      context.roundRect(ox - side / 2, oy - side / 2, side, side, side * 0.3);
      context.fill();
    };

    const loop = (now: number) => {
      if (visible && !document.hidden) draw(now);
      frame = requestAnimationFrame(loop);
    };

    size();
    const observer = new ResizeObserver(() => {
      size();
      if (still) draw(0);
    });
    observer.observe(canvas);
    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    watcher.observe(canvas);

    if (still) draw(0);
    else frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      watcher.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" data-decorative className={className} />;
}
