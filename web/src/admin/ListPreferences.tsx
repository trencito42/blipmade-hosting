import { useEffect, useMemo, useState } from 'react';
import { api, get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Icon } from '../icons';
import { useToast } from '../ui-app';
import { denseGhost, denseInput } from './Overview';

export type SavedViewScope = 'customers' | 'orders' | 'services' | 'tickets';
export type SavedQuery = Record<string, string | number | boolean | null>;

interface SavedView { id: string; name: string; query: SavedQuery; createdAt: string }
export interface ColumnChoice { key: string; label: string; required?: boolean }

export function useColumnPicker(scope: SavedViewScope, columns: ColumnChoice[]) {
  const storageKey = `bm.admin.columns.${scope}`;
  const signature = columns.map((column) => column.key).join('|');
  const defaults = useMemo(() => columns.map((column) => column.key), [signature]);
  const required = useMemo(() => columns.filter((column) => column.required).map((column) => column.key), [signature]);
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (Array.isArray(parsed)) {
        const restored = defaults.filter((key) => parsed.includes(key) || required.includes(key));
        if (restored.length) return restored;
      }
    } catch { /* Private mode or blocked storage: defaults keep the page usable. */ }
    return defaults;
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(visible)); } catch { /* Local preference is optional. */ }
  }, [storageKey, visible]);

  const toggle = (key: string) => setVisible((current) => {
    if (current.includes(key)) return current.length > 1 ? current.filter((entry) => entry !== key) : current;
    return defaults.filter((entry) => current.includes(entry) || entry === key);
  });
  return { visible, toggle, reset: () => setVisible(defaults) };
}

export function ListPreferences({
  scope,
  query,
  onApply,
  columns,
  visibleColumns,
  onToggleColumn,
  onResetColumns,
}: {
  scope: SavedViewScope;
  query: SavedQuery;
  onApply: (query: SavedQuery) => void;
  columns: ColumnChoice[];
  visibleColumns: string[];
  onToggleColumn: (key: string) => void;
  onResetColumns: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const views = useAsync((signal) => get<{ views: SavedView[] }>('/admin/saved-views', { scope }, signal), [scope]);
  const save = useAction(async () => post<{ view: SavedView }>('/admin/saved-views', { scope, name: name.trim(), query }));
  const remove = useAction(async (id: string) => api<{ ok: true }>('/admin/saved-views', { method: 'DELETE', query: { scope, id } }));

  const saveView = async () => {
    if (!name.trim()) return;
    const result = await save.run();
    if (!result) return;
    setName('');
    views.reload();
    toast.push(`Saved “${result.view.name}”`, 'ok');
  };

  const deleteView = async (view: SavedView) => {
    const result = await remove.run(view.id);
    if (!result) return;
    views.reload();
    toast.push(`Deleted “${view.name}”`, 'ok');
  };

  return (
    <div className="flex flex-wrap items-start gap-2" aria-label="List preferences">
      <details className="group relative">
        <summary className={`${denseGhost} cursor-pointer list-none`}><Icon name="eye" size={15} /> Views</summary>
        <div className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-4 shadow-xl">
          <p className="text-[13px] font-semibold text-ink">Private views</p>
          <p className="mt-1 text-[12px] text-ink3">Save these filters and sorting for your operator account.</p>
          <div className="mt-3 flex gap-2">
            <label className="min-w-0 flex-1"><span className="sr-only">View name</span><input value={name} maxLength={80} onChange={(event) => { setName(event.target.value); save.clearError(); }} onKeyDown={(event) => { if (event.key === 'Enter') void saveView(); }} placeholder="View name" className={denseInput} /></label>
            <button type="button" disabled={!name.trim() || save.pending} onClick={() => void saveView()} className={denseGhost}>Save</button>
          </div>
          {save.error && <p role="alert" className="mt-2 text-[12px] text-bad">{save.error}</p>}
          {views.loading ? <p className="mt-3 text-[12px] text-ink3">Loading views…</p> : views.error ? <button type="button" onClick={views.reload} className="mt-3 text-[12px] text-bad underline">Could not load views. Retry</button> : (
            <ul className="mt-3 grid max-h-56 gap-1 overflow-y-auto">
              {(views.data?.views ?? []).map((view) => <li key={view.id} className="flex items-center gap-2 rounded-xl hover:bg-s2"><button type="button" className="min-w-0 flex-1 truncate px-3 py-2 text-left text-[13px] text-ink" onClick={() => onApply(view.query)}>{view.name}</button><button type="button" aria-label={`Delete ${view.name}`} disabled={remove.pending} onClick={() => void deleteView(view)} className="rounded-lg p-2 text-ink3 hover:bg-s3 hover:text-bad"><Icon name="trash" size={14} /></button></li>)}
              {!views.data?.views.length && <li className="px-3 py-2 text-[12px] text-ink3">No saved views yet.</li>}
            </ul>
          )}
          {remove.error && <p role="alert" className="mt-2 text-[12px] text-bad">{remove.error}</p>}
        </div>
      </details>
      <details className="group relative">
        <summary className={`${denseGhost} cursor-pointer list-none`}><Icon name="menu" size={15} /> Columns</summary>
        <div className="absolute left-0 z-30 mt-2 w-64 rounded-2xl border border-line bg-card p-4 shadow-xl">
          <p className="text-[13px] font-semibold text-ink">Visible columns</p>
          <div className="mt-3 grid gap-2">
            {columns.map((column) => <label key={column.key} className="flex min-h-8 items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={visibleColumns.includes(column.key)} disabled={column.required} onChange={() => onToggleColumn(column.key)} className="size-4 accent-acc" />{column.label}</label>)}
          </div>
          <button type="button" onClick={onResetColumns} className="mt-3 text-[12px] font-semibold text-acc hover:underline">Reset columns</button>
          <p className="mt-2 text-[11px] text-ink3">Stored only in this browser.</p>
        </div>
      </details>
    </div>
  );
}
