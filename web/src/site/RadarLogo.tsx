/**
 * The radar of the closing call to action.
 *
 * It is drawn like an instrument: thin rings, a scale of degrees on the rim, a
 * line that sweeps the field with a short trail, and a marker with a name at
 * every service the sweep finds. The mark of the platform sits in the centre,
 * and its two arcs pulse like the signal that leaves it. The paths of the mark
 * are the ones of `public/favicon.svg`.
 *
 * It is decoration, so it is hidden from the readers of the screen, and the
 * names are examples. The motion is in the style sheet and stops with reduced
 * motion.
 */

const C = 300;
const SWEEP = 8;
const LINE = '#2c3b31';
const GREEN = '#4ee595';
const MUTED = '#8c988f';

/** The services the sweep finds: a name, an angle in degrees clockwise from the right, and a distance. */
const BLIPS: [string, number, number][] = [
  ['discord-bot', -62, 150],
  ['postgres', 18, 118],
  ['minecraft', 52, 196],
  ['code-server', 128, 160],
  ['redis', -152, 124],
  ['grafana', -118, 214],
];

const polar = (angle: number, distance: number) => {
  const radians = (angle * Math.PI) / 180;
  return { x: C + Math.cos(radians) * distance, y: C + Math.sin(radians) * distance };
};

/** A thin wedge of the trail of the sweep, from one angle to the one before it. */
const wedge = (from: number, to: number, radius: number) => {
  const a = polar(from, radius);
  const b = polar(to, radius);
  return `M${C} ${C}L${a.x.toFixed(1)} ${a.y.toFixed(1)}A${radius} ${radius} 0 0 0 ${b.x.toFixed(1)} ${b.y.toFixed(1)}Z`;
};

export function RadarLogo({ className }: { className?: string }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  return (
    <svg viewBox="0 0 600 600" aria-hidden="true" data-decorative className={className} fill="none" fontFamily="JetBrains Mono Variable, monospace">
      <g stroke={LINE} strokeWidth="1">
        {[56, 112, 168, 224].map((r) => (
          <circle key={r} cx={C} cy={C} r={r} />
        ))}
        <circle cx={C} cy={C} r="258" stroke={MUTED} opacity="0.5" />
        {ticks.map((angle) => {
          const long = angle % 30 === 0;
          const a = polar(angle, 258);
          const b = polar(angle, long ? 246 : 251);
          return <line key={angle} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={MUTED} opacity={long ? 0.8 : 0.4} />;
        })}
        <line x1={C - 224} y1={C} x2={C - 34} y2={C} />
        <line x1={C + 34} y1={C} x2={C + 224} y2={C} />
        <line x1={C} y1={C - 224} x2={C} y2={C - 34} />
        <line x1={C} y1={C + 34} x2={C} y2={C + 224} />
      </g>
      <g fill={MUTED} fontSize="11" textAnchor="middle" letterSpacing="0.08em">
        <text x={C} y={C - 268}>000</text>
        <text x={C + 281} y={C + 4}>090</text>
        <text x={C} y={C + 284}>180</text>
        <text x={C - 281} y={C + 4}>270</text>
      </g>

      <circle className="radar-ping" cx={C} cy={C} r="40" stroke={GREEN} strokeWidth="1" vectorEffect="non-scaling-stroke" />

      <g className="radar-sweep" style={{ transformOrigin: `${C}px ${C}px` }}>
        {Array.from({ length: 16 }, (_, i) => (
          <path key={i} d={wedge(-i * 1.6, -(i + 1) * 1.6, 224)} fill={GREEN} opacity={(0.2 * (1 - i / 16)).toFixed(3)} />
        ))}
        <line x1={C} y1={C} x2={C + 224} y2={C} stroke={GREEN} strokeWidth="1.5" />
      </g>

      {BLIPS.map(([name, angle, distance]) => {
        const point = polar(angle, distance);
        const turn = (((angle % 360) + 360) % 360) / 360;
        const delay = `${(turn * SWEEP).toFixed(2)}s`;
        const right = point.x >= C;
        return (
          <g key={name}>
            <g className="radar-blip" style={{ animationDelay: delay }}>
              <rect x={point.x - 4} y={point.y - 4} width="8" height="8" fill={GREEN} />
              <path d={`M${point.x - 10} ${point.y - 5}V${point.y - 10}H${point.x - 5}M${point.x + 5} ${point.y - 10}H${point.x + 10}V${point.y - 5}M${point.x + 10} ${point.y + 5}V${point.y + 10}H${point.x + 5}M${point.x - 5} ${point.y + 10}H${point.x - 10}V${point.y + 5}`} stroke={GREEN} strokeWidth="1" />
              <text x={point.x + (right ? 16 : -16)} y={point.y + 4} fill="#eef2ec" fontSize="12" textAnchor={right ? 'start' : 'end'}>{name}</text>
            </g>
          </g>
        );
      })}

      <g transform={`translate(${C} ${C}) scale(0.34) translate(-38 -78)`}>
        <path className="radar-arc radar-arc-1" fill="#F3F6F2" d="M92.0777 129.979C90.0763 129.008 88.7346 127.429 88.3111 125.642C87.794 123.464 88.1907 121.158 89.8579 119.566C95.1802 114.48 99.3613 108.511 102.161 101.668C108.535 86.0801 108.196 68.4966 101.26 53.1925C98.5099 47.1214 94.6497 42.0215 89.7954 37.4228C87.0184 34.793 87.6112 30.3228 90.5532 27.9902C94.6274 24.7573 100.467 25.6398 104.046 29.3605C110.171 35.7198 114.807 43.0371 117.954 51.2678C124.506 68.4123 124.729 87.4992 118.319 104.723C115.03 113.562 110.158 121.664 103.36 128.258C100.257 131.27 95.6705 131.731 92.0777 129.983V129.979Z" />
        <path className="radar-arc radar-arc-2" fill="#F3F6F2" d="M126.588 146.239C122.802 143.651 121.85 138.659 124.755 135.304C132.481 126.389 138.286 116.279 141.884 105.097C147.693 87.036 148.287 67.751 143.697 49.2738C140.903 38.0259 136.201 27.4663 129.32 18.1514L124.507 12.3564C121.631 8.89017 123.074 3.67632 127.116 1.39295C131.385 -1.0182 137.421 -0.313403 140.726 3.61862C153.627 18.9593 160.941 37.0779 163.796 57.0018C166.953 79.0483 163.92 102.649 154.48 122.63C150.726 130.573 146.202 137.959 140.421 144.574C137.021 148.465 130.738 149.075 126.584 146.235L126.588 146.239Z" />
        <path fill="#6BE598" d="M62.8661 116H13.0859C5.48557 115.366 -0.00640276 109.006 5.60239e-06 101.429L0.04166 54.2575C0.0480683 45.9882 6.65509 39.9776 14.8258 40.0001L62.6097 40.141C70.2933 40.1635 76.0064 46.9205 76 54.4177L75.9712 101.23C76.314 108.923 70.6041 115.372 62.8661 116Z" />
      </g>
    </svg>
  );
}
