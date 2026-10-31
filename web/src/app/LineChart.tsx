import { useId } from 'react';

/**
 * A line chart without a library: one series, an area under it, a scale on the left and the
 * time on the bottom. A point with no value breaks the line, so a gap in the data shows as a
 * gap and nothing is drawn that was not measured.
 */
export interface ChartPoint { t: number; v: number | null }

export function LineChart({
  points,
  format,
  label,
  max,
  height = 150,
}: {
  points: ChartPoint[];
  format: (value: number) => string;
  /** What the chart shows, for a reader that cannot see it. */
  label: string;
  /** A fixed top of the scale (100 for a percentage). Otherwise the top follows the data. */
  max?: number;
  height?: number;
}) {
  const id = useId();
  const width = 640;
  const pad = { left: 52, right: 8, top: 8, bottom: 22 };
  const values = points.map((point) => point.v).filter((value): value is number => value !== null);
  if (points.length < 2 || values.length === 0) {
    return <p className="rounded-2xl bg-s2 px-4 py-6 text-center text-[13.5px] text-ink3">No data for this period yet.</p>;
  }
  const top = max ?? Math.max(...values, 1) * 1.15;
  const t0 = points[0]!.t;
  const t1 = points[points.length - 1]!.t;
  const x = (t: number) => pad.left + ((t - t0) / Math.max(t1 - t0, 1)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - Math.min(v, top) / top) * (height - pad.top - pad.bottom);

  const segments: string[] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point.v === null) {
      if (current.length) segments.push(current.join(' '));
      current = [];
    } else {
      current.push(`${current.length ? 'L' : 'M'}${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`);
    }
  }
  if (current.length) segments.push(current.join(' '));

  const bottom = height - pad.bottom;
  const areas = segments.map((segment) => {
    const coords = segment.split(' ');
    const first = coords[0]!.slice(1).split(',')[0];
    const last = coords[coords.length - 1]!.slice(1).split(',')[0];
    return `${segment} L${last},${bottom} L${first},${bottom} Z`;
  });
  const ticks = [0, 0.5, 1].map((fraction) => top * fraction);
  const time = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = (seconds: number) => new Date(seconds * 1000).toLocaleDateString([], { day: 'numeric', month: 'short' });
  const span = t1 - t0;
  const stamp = (seconds: number) => (span > 36 * 3600 ? day(seconds) : time(seconds));

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-acc)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-acc)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={pad.left - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink3)" fontFamily="var(--font-mono, monospace)">
            {format(tick)}
          </text>
        </g>
      ))}
      {areas.map((area, index) => (
        <path key={index} d={area} fill={`url(#${id})`} />
      ))}
      {segments.map((segment, index) => (
        <path key={index} d={segment} fill="none" stroke="var(--color-acc)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      <text x={pad.left} y={height - 6} fontSize="11" fill="var(--color-ink3)">{stamp(t0)}</text>
      <text x={width - pad.right} y={height - 6} textAnchor="end" fontSize="11" fill="var(--color-ink3)">{stamp(t1)}</text>
    </svg>
  );
}
