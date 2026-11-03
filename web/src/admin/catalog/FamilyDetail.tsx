import { Link, useParams } from '../../router';
import { get } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Panel, StatusPill } from '../../ui-app';
import { can, denseGhost, densePrimary, useAdminSession } from '../Overview';
import { groupLabel, type AddonRow, type FamilyDetail, type PresetRow, type VariantRow } from './model';

/** One family, with links to the editors. Nothing on this page writes the live catalogue. */
export default function CatalogFamilyDetail() {
  const { id = '' } = useParams();
  const mayWrite = can(useAdminSession().staff, 'products.write');
  const state = useAsync<FamilyDetail>((signal) => get(`/admin/catalog/families/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const family = state.data?.family;
  return (
    <div className="grid gap-4">
      {state.loading && !state.data ? <LoadingBlock rows={4} label="Loading the family" />
        : state.error ? <ErrorState title="The family could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !family ? <EmptyState title="Family not found." />
        : (
          <>
            <Panel
              title={family.name}
              description={state.data?.note}
              action={<Link to={`/admin/catalog/families/${family.id}/edit`} className={densePrimary}>{mayWrite ? 'Edit family' : 'View family'}</Link>}
            >
              <p className="text-[13.5px] text-ink2">{family.summary}</p>
              <p className="mt-2 font-mono text-[12.5px] text-ink3">{family.slug} · {groupLabel(family.group)} · {family.discovery.toLowerCase()} · {family.prepared ? 'prepared' : 'draft'}</p>
            </Panel>
            <Panel title="Variants" action={mayWrite ? <Link to={`/admin/catalog/families/${family.id}/variants/new`} className={densePrimary}>New variant</Link> : undefined}>
              {family.variants.length === 0 ? <EmptyState title="No variants yet." description="A variant points at a product that already exists." /> : (
                <>
                  <DataTable<VariantRow>
                    rows={family.variants}
                    rowKey={(row) => row.id}
                    rowTo={(row) => `/admin/catalog/families/${family.id}/variants/${row.id}/edit`}
                    columns={[
                      { key: 'label', header: 'Variant', render: (row) => row.label },
                      { key: 'product', header: 'Product', render: (row) => <span className="font-mono text-[12.5px]">{row.product.slug}</span> },
                      { key: 'active', header: 'State', render: (row) => <StatusPill status={row.active ? 'active' : 'draft'} label={row.active ? 'Active' : 'Inactive'} /> },
                      { key: 'edit', header: '', width: '7rem', render: (row) => <Link to={`/admin/catalog/families/${family.id}/variants/${row.id}/edit`} className={denseGhost}>{mayWrite ? 'Edit' : 'View'}</Link> },
                    ]}
                  />
                  <CardList rows={family.variants} rowKey={(row) => row.id}>
                    {(row) => (
                      <div className="grid gap-1 p-4">
                        <Link to={`/admin/catalog/families/${family.id}/variants/${row.id}/edit`} className="font-medium text-ink">{row.label}</Link>
                        <p className="font-mono text-[12.5px] text-ink3">{row.product.slug}</p>
                      </div>
                    )}
                  </CardList>
                </>
              )}
            </Panel>
            <Panel title="Presets" action={mayWrite ? <Link to={`/admin/catalog/families/${family.id}/presets/new`} className={densePrimary}>New preset</Link> : undefined}>
              {family.presets.length === 0 ? <EmptyState title="No presets yet." description="A preset is an installation choice with its own versions." /> : (
                <>
                  <DataTable<PresetRow>
                    rows={family.presets}
                    rowKey={(row) => row.id}
                    rowTo={(row) => `/admin/catalog/families/${family.id}/presets/${row.id}/edit`}
                    columns={[
                      { key: 'name', header: 'Preset', render: (row) => row.name },
                      { key: 'variant', header: 'Variant', render: (row) => row.variant?.label ?? 'Any variant' },
                      { key: 'version', header: 'Latest', render: (row) => `v${row.versions[0]?.version ?? 0}${row.versions[0]?.publishedAt ? '' : ' draft'}` },
                      { key: 'edit', header: '', width: '7rem', render: (row) => <Link to={`/admin/catalog/families/${family.id}/presets/${row.id}/edit`} className={denseGhost}>{mayWrite ? 'Edit' : 'View'}</Link> },
                    ]}
                  />
                  <CardList rows={family.presets} rowKey={(row) => row.id}>
                    {(row) => <div className="p-4"><Link to={`/admin/catalog/families/${family.id}/presets/${row.id}/edit`} className="font-medium text-ink">{row.name}</Link></div>}
                  </CardList>
                </>
              )}
            </Panel>
            <Panel title="Add-ons" action={mayWrite ? <Link to={`/admin/catalog/families/${family.id}/addons/new`} className={densePrimary}>New add-on</Link> : undefined}>
              {family.addons.length === 0 ? <EmptyState title="No add-ons yet." description="Software, managed services and priced features stay separate." /> : (
                <>
                  <DataTable<AddonRow>
                    rows={family.addons}
                    rowKey={(row) => row.id}
                    rowTo={(row) => `/admin/catalog/families/${family.id}/addons/${row.id}/edit`}
                    columns={[
                      { key: 'name', header: 'Add-on', render: (row) => row.name },
                      { key: 'kind', header: 'Kind', render: (row) => row.kind.toLowerCase().replaceAll('_', ' ') },
                      { key: 'version', header: 'Version', render: (row) => `v${row.version}` },
                      { key: 'edit', header: '', width: '7rem', render: (row) => <Link to={`/admin/catalog/families/${family.id}/addons/${row.id}/edit`} className={denseGhost}>{mayWrite ? 'Edit' : 'View'}</Link> },
                    ]}
                  />
                  <CardList rows={family.addons} rowKey={(row) => row.id}>
                    {(row) => <div className="p-4"><Link to={`/admin/catalog/families/${family.id}/addons/${row.id}/edit`} className="font-medium text-ink">{row.name}</Link></div>}
                  </CardList>
                </>
              )}
            </Panel>
          </>
        )}
    </div>
  );
}
