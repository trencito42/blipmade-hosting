/**
 * A number of the mail area, with its label.
 *
 * It is small on purpose: the summary of a domain and the summary of a
 * subscription are read at a glance, not one card at a time.
 */

export function MailStat({
  label,
  value,
  hint,
  used,
  limit,
}: {
  label: string;
  value: string;
  /** The line under the number. */
  hint?: string;
  /** How much of the limit is used, when a bar means something. */
  used?: number;
  limit?: number;
}) {
  const percent =
    used !== undefined && limit !== undefined && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] text-ink3">{label}</p>
      <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-ink">{value}</p>
      {percent !== null && (
        <span aria-hidden="true" className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-s3">
          <span className="block h-full rounded-full bg-acc" style={{ width: `${percent}%` }} />
        </span>
      )}
      {hint && <p className="mt-1 text-[12px] text-ink3">{hint}</p>}
    </div>
  );
}
