/** Pure hosting checks for Discord entitlement rules (no database). */

export function vpsCustomerEligibleFromHosting(
  instances: { product: { slug: string } }[],
  vpsServices: { product: { slug: string } }[],
): boolean {
  return (
    instances.some((i) => i.product.slug.startsWith('vps-')) ||
    vpsServices.some((v) => v.product.slug.startsWith('vps-'))
  );
}
