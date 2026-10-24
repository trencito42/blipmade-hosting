/**
 * The marker of a value the operator still has to supply.
 *
 * Some statements of a legal page depend on a decision the operator has not
 * made yet: the legal name of the company, the country it is established in,
 * the address of the support, the length of a refund window. The platform
 * cannot know those values, and a page that invents one is worse than a page
 * that admits it is missing.
 *
 * Every such value is written with this marker. The marker is visible on the
 * page, so a reader knows the sentence is not final, and it is searchable in
 * the code, so the operator can find every one of them with a single search
 * for `TODO(operator)`.
 *
 * The text of the marker is passed in by the caller on purpose: the marker
 * itself has to be findable, and a single string inside this component would
 * be found once instead of once per value.
 */
export function OperatorPlaceholder({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-warn/12 px-1.5 py-0.5 align-middle font-mono text-[12px] font-medium leading-[1.45] text-warn">
      <span aria-hidden="true">⚑</span>
      {label}
    </span>
  );
}
