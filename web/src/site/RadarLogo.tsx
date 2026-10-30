/**
 * The radar of the closing call to action.
 *
 * It is the mark of the platform drawn large: the square is the source and the
 * two arcs are the signal that leaves it. The signal pulses arc by arc, rings
 * leave the square and widen, a line sweeps the field and the dots light up
 * when it passes, like a service that answers. The paths of the mark are the
 * ones of `public/favicon.svg`.
 *
 * It is decoration, so it is hidden from the readers of the screen. The
 * motion is in the style sheet and stops with reduced motion.
 */

/** The centre of the square of the mark. */
const CX = 38;
const CY = 78;
const SWEEP = 7;

/** The dots of the field: an angle in degrees, clockwise from the right, and a distance. */
const DOTS: [number, number][] = [
  [-52, 150], [-18, 230], [14, 120], [38, 260], [71, 175], [118, 210], [-84, 285], [152, 140], [-134, 250], [196, 300],
];

const at = (angle: number, distance: number) => {
  const radians = (angle * Math.PI) / 180;
  return { x: CX + Math.cos(radians) * distance, y: CY + Math.sin(radians) * distance };
};

export function RadarLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="-330 -250 800 656" aria-hidden="true" data-decorative className={className} fill="none">
      <g className="radar-grid" stroke="#4ee595" strokeWidth="1">
        {[110, 200, 290].map((r) => (
          <circle key={r} cx={CX} cy={CY} r={r} strokeDasharray="3 7" opacity="0.22" />
        ))}
        <line x1={CX - 310} y1={CY} x2={CX + 310} y2={CY} opacity="0.12" />
        <line x1={CX} y1={CY - 310} x2={CX} y2={CY + 310} opacity="0.12" />
      </g>

      <g className="radar-rings" stroke="#4ee595" strokeWidth="2">
        {[0, 1, 2].map((i) => (
          <circle key={i} className="radar-ring" cx={CX} cy={CY} r="60" style={{ animationDelay: `${i * 1.4}s` }} />
        ))}
      </g>

      <g className="radar-sweep" style={{ transformOrigin: `${CX}px ${CY}px` }}>
        <path d={`M${CX} ${CY} L${CX + 300} ${CY} A300 300 0 0 0 ${at(-26, 300).x} ${at(-26, 300).y} Z`} fill="#4ee595" opacity="0.07" />
        <line x1={CX} y1={CY} x2={CX + 300} y2={CY} stroke="#4ee595" strokeWidth="2" opacity="0.7" />
      </g>

      {DOTS.map(([angle, distance]) => {
        const point = at(angle, distance);
        const turn = (((angle % 360) + 360) % 360) / 360;
        return <circle key={`${angle}-${distance}`} className="radar-dot" cx={point.x} cy={point.y} r="5" fill="#4ee595" style={{ animationDelay: `${(turn * SWEEP).toFixed(2)}s` }} />;
      })}

      <path className="radar-arc radar-arc-1" fill="#F3F6F2" d="M92.0777 129.979C90.0763 129.008 88.7346 127.429 88.3111 125.642C87.794 123.464 88.1907 121.158 89.8579 119.566C95.1802 114.48 99.3613 108.511 102.161 101.668C108.535 86.0801 108.196 68.4966 101.26 53.1925C98.5099 47.1214 94.6497 42.0215 89.7954 37.4228C87.0184 34.793 87.6112 30.3228 90.5532 27.9902C94.6274 24.7573 100.467 25.6398 104.046 29.3605C110.171 35.7198 114.807 43.0371 117.954 51.2678C124.506 68.4123 124.729 87.4992 118.319 104.723C115.03 113.562 110.158 121.664 103.36 128.258C100.257 131.27 95.6705 131.731 92.0777 129.983V129.979Z" />
      <path className="radar-arc radar-arc-2" fill="#F3F6F2" d="M126.588 146.239C122.802 143.651 121.85 138.659 124.755 135.304C132.481 126.389 138.286 116.279 141.884 105.097C147.693 87.036 148.287 67.751 143.697 49.2738C140.903 38.0259 136.201 27.4663 129.32 18.1514L124.507 12.3564C121.631 8.89017 123.074 3.67632 127.116 1.39295C131.385 -1.0182 137.421 -0.313403 140.726 3.61862C153.627 18.9593 160.941 37.0779 163.796 57.0018C166.953 79.0483 163.92 102.649 154.48 122.63C150.726 130.573 146.202 137.959 140.421 144.574C137.021 148.465 130.738 149.075 126.584 146.235L126.588 146.239Z" />
      <path className="radar-core" fill="#6BE598" d="M62.8661 116H13.0859C5.48557 115.366 -0.00640276 109.006 5.60239e-06 101.429L0.04166 54.2575C0.0480683 45.9882 6.65509 39.9776 14.8258 40.0001L62.6097 40.141C70.2933 40.1635 76.0064 46.9205 76 54.4177L75.9712 101.23C76.314 108.923 70.6041 115.372 62.8661 116Z" />
    </svg>
  );
}
