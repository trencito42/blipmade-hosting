import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useState } from 'react';
import { ConfirmDialog, Panel, SoftButton, useToast } from '../../ui-app';

interface Preview { target: { slug: string; name: string }; eligible: boolean; reasons: string[]; kind: 'same_egg' | 'cross_egg'; billing: 'unchanged' | 'different_price' }

interface FamilyCard { slug: string; name: string; variants: { label?: string; product: { slug: string; name?: string; orderable: boolean } }[]; addons?: { slug: string; name: string; summary: string; kind: string }[] }

/** Moves this server to another variant of the same family. A backup runs first. The price card must match. */
export function Repurpose({ instance }: { instance: { id: string; product: { slug: string; name?: string } } }) {
  const toast = useToast();
  const families = useAsync<{ families: FamilyCard[] }>((signal) => get('/catalog/families', undefined, signal), []);
  const family = (families.data?.families ?? []).find((entry) => entry.variants.some((variant) => variant.product.slug === instance.product.slug));
  const others = family?.variants.filter((variant) => variant.product.slug !== instance.product.slug && variant.product.orderable) ?? [];
  const [preview, setPreview] = useState<Preview | null>(null);
  const look = useAction(async (slug: string) => {
    setPreview(await get<Preview>(`/instances/${encodeURIComponent(instance.id)}/repurpose/preview`, { productSlug: slug }));
  });
  const run = useAction(async (slug: string) => {
    const answer = await post<{ note: string }>(`/instances/${encodeURIComponent(instance.id)}/repurpose`, { productSlug: slug, confirm: true, confirmSlug: slug });
    toast.push(answer.note, 'ok');
    setPreview(null);
  });
  if (!others.length) return null;
  return (
    <Panel title="Switch variant" description={`${family?.name ?? 'This family'} can replace the program on this server. A locked backup is made first. The files stay. A variant with a different price is refused.`}>
      <ul className="grid gap-2">
        {others.map((variant) => (
          <li key={variant.product.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-3 py-2">
            <span className="text-[14px] text-ink">{variant.label || variant.product.name || variant.product.slug}</span>
            <SoftButton type="button" disabled={run.pending || look.pending} onClick={() => void look.run(variant.product.slug)}>Switch…</SoftButton>
          </li>
        ))}
      </ul>
      {(run.error || look.error) && <p role="alert" className="mt-2 text-[13.5px] text-bad">{run.error || look.error}</p>}
      <ConfirmDialog
        open={preview !== null}
        title={preview?.eligible ? `Switch to ${preview.target.name}?` : `${preview?.target.name ?? 'This variant'} cannot replace this server`}
        description={
          preview
            ? preview.eligible
              ? `A locked backup is made first. ${preview.kind === 'cross_egg' ? 'The install script of the new software runs on the node and replaces the program; your files and worlds stay on the disk.' : 'Only the variant changes; the program stays.'} The price does not change.`
              : preview.reasons.join(' ')
            : ''
        }
        confirmLabel={preview?.eligible ? 'Switch' : 'Close'}
        busy={run.pending}
        onCancel={() => setPreview(null)}
        onConfirm={() => { if (preview?.eligible) void run.run(preview.target.slug); else setPreview(null); }}
      />
      {(family?.addons?.length ?? 0) > 0 && (
        <div className="mt-4 grid gap-1">
          <p className="text-[13px] font-semibold text-ink">Add-ons in this family</p>
          {family!.addons!.map((addon) => <p key={addon.slug} className="text-[13.5px] text-ink2">{addon.name}. {addon.summary} {addon.kind === 'SOFTWARE' ? 'Paper plugins and Forge modpacks install from the Minecraft tab.' : 'This add-on is ordered with the product.'}</p>)}
        </div>
      )}
    </Panel>
  );
}
