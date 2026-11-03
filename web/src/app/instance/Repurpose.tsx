import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { Panel, SoftButton, useToast } from '../../ui-app';

interface FamilyCard { slug: string; name: string; variants: { label?: string; product: { slug: string; name?: string; orderable: boolean } }[] }

/** Moves this server to another variant of the same family. A backup runs first. The price card must match. */
export function Repurpose({ instance }: { instance: { id: string; product: { slug: string; name?: string } } }) {
  const toast = useToast();
  const families = useAsync<{ families: FamilyCard[] }>((signal) => get('/catalog/families', undefined, signal), []);
  const family = (families.data?.families ?? []).find((entry) => entry.variants.some((variant) => variant.product.slug === instance.product.slug));
  const others = family?.variants.filter((variant) => variant.product.slug !== instance.product.slug && variant.product.orderable) ?? [];
  const run = useAction(async (slug: string) => {
    const answer = await post<{ note: string }>(`/instances/${encodeURIComponent(instance.id)}/repurpose`, { productSlug: slug });
    toast.push(answer.note, 'ok');
  });
  if (!others.length) return null;
  return (
    <Panel title="Switch variant" description={`${family?.name ?? 'This family'} can replace the program on this server. A locked backup is made first. The files stay. A variant with a different price is refused.`}>
      <ul className="grid gap-2">
        {others.map((variant) => (
          <li key={variant.product.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-3 py-2">
            <span className="text-[14px] text-ink">{variant.label || variant.product.name || variant.product.slug}</span>
            <SoftButton type="button" disabled={run.pending} onClick={() => void run.run(variant.product.slug)}>Switch</SoftButton>
          </li>
        ))}
      </ul>
      {run.error && <p role="alert" className="mt-2 text-[13.5px] text-bad">{run.error}</p>}
    </Panel>
  );
}
