/** The storefront groups prepared families without hiding one-variant families. */
export type AvailabilityFilter = 'ready' | 'all';
export interface FamilyWithAvailability {
  variants: ReadonlyArray<{ product: { orderable: boolean } }>;
}

/** Do not present an unavailable family as ready to buy. */
export function selectPreparedFamilies<T extends FamilyWithAvailability>(
  families: readonly T[],
  availability: AvailabilityFilter,
): T[] {
  return families.filter((family) =>
    family.variants.length > 0 &&
    (availability === 'all' || family.variants.some((variant) => variant.product.orderable)),
  );
}
