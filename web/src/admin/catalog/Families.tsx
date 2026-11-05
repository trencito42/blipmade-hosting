import { useMenuKit } from '../../lib/menu-actions';
import type { MenuItem } from '../../context-menu';
import { Link } from '../../router';
import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import type { TableColumn } from '../../lib/table';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Panel, Pager, StatusPill, usePaged } from '../../ui-app';
import { can, denseGhost, densePrimary, useAdminSession } from '../Overview';
import { groupLabel, type FamilySummary } from './model';

/** Operator catalogue families. They are not the public product list. */
export default function CatalogFamilies() {
  const mayWrite = can(useAdminSession().staff, 'products.write');
  const state = useAsync<{ families: FamilySummary[]; note: string }>((signal) => get('/admin/catalog/families', undefined, signal), []);
  const sync = useAction(async () => {
    const result = await post('/admin/catalog/families/sync-drafts', {});
    state.reload();
    return result;
  });
  const families = state.data?.families ?? [];
  const paged = usePaged(families, 20, families.length);
  const menuKit = useMenuKit();
  const familyActions = (family: FamilySummary): MenuItem[] => {
    const id = encodeURIComponent(family.id);
    const items: MenuItem[] = [menuKit.go('open', 'Open family', 'arrowUR', `/admin/catalog/families/${id}`)];
    if (mayWrite) items.push(menuKit.go('edit', 'Edit family', 'pen', `/admin/catalog/families/${id}/edit`));
    items.push(menuKit.copy('copy-id', 'family ID', family.id, { separated: true }));
    return items;
  };
  const columns: TableColumn<FamilySummary>[] = [
    { key: 'name', header: 'Family', render: (family) => <Link to={`/admin/catalog/families/${family.id}`} className="font-medium text-ink hover:text-acc">{family.name}</Link> },
    { key: 'group', header: 'Group', render: (family) => groupLabel(family.group) },
    { key: 'discovery', header: 'Discovery', render: (family) => family.discovery.toLowerCase() },
    { key: 'prepared', header: 'Draft', render: (family) => <StatusPill status={family.prepared ? 'active' : 'draft'} label={family.prepared ? 'Prepared' : 'Draft'} /> },
    { key: 'counts', header: 'Contents', render: (family) => `${family.variantCount} variants · ${family.presetCount} presets · ${family.addonCount} add-ons` },
    { key: 'open', header: '', width: '7rem', render: (family) => <Link to={`/admin/catalog/families/${family.id}`} className={denseGhost}>Open</Link> },
  ];
  return (
    <Panel
      title="Catalogue families"
      description={state.data?.note ?? 'Families group existing products. They do not change the public catalogue.'}
      action={mayWrite ? (
        <span className="flex flex-wrap gap-2">
          <button type="button" className={denseGhost} disabled={sync.pending} onClick={() => void sync.run()}>{sync.pending ? 'Syncing…' : 'Sync drafts'}</button>
          <Link to="/admin/catalog/families/new" className={densePrimary}>New family</Link>
        </span>
      ) : undefined}
    >
      {state.loading && !state.data ? <LoadingBlock rows={4} label="Loading catalogue families" />
        : state.error ? <ErrorState title="The families could not be loaded" message={state.error.message} onRetry={state.reload} />
        : families.length === 0 ? <EmptyState title="No catalogue families yet." description="A family groups products that already exist. The public catalogue stays as it is." />
        : (
          <div className="grid gap-3">
            <DataTable columns={columns} rows={paged.rows} rowKey={(family) => family.id} rowTo={(family) => `/admin/catalog/families/${family.id}`} minWidth="760px" rowActions={familyActions} rowLabel={(family) => `family ${family.name}`} />
            <CardList rows={paged.rows} rowKey={(family) => family.id} rowActions={familyActions} rowLabel={(family) => `family ${family.name}`}>
              {(family) => (
                <div className="grid gap-2 p-4">
                  <Link to={`/admin/catalog/families/${family.id}`} className="font-medium text-ink">{family.name}</Link>
                  <p className="text-[13px] text-ink3">{groupLabel(family.group)} · {family.discovery.toLowerCase()} · {family.prepared ? 'Prepared' : 'Draft'}</p>
                  <p className="text-[13px] text-ink2">{family.variantCount} variants · {family.presetCount} presets · {family.addonCount} add-ons</p>
                </div>
              )}
            </CardList>
            <Pager paged={paged} label="Family pages" />
          </div>
        )}
    </Panel>
  );
}
