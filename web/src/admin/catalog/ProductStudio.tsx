import { useMemo, useState } from 'react';
import { useParams, useRouter, Link } from '../../router';
import { get, put, post, api } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import {
  CardList,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  StatusPill,
  Segmented,
  TextInput,
  Select,
  PrimaryButton,
  SoftButton,
  DangerButton,
  StatTile,
} from '../../ui-app';
import { can, denseGhost, densePrimary, useAdminSession } from '../Overview';
import { groupLabel, CATALOG_GROUPS } from './model';
import { Icon } from '../../icons';
import type { TableColumn } from '../../lib/table';

export type CatalogGroup = (typeof CATALOG_GROUPS)[number]['value'] | string;

export interface OfferingStudioSummary {
  slug: string;
  name: string;
  summary: string;
  category: CatalogGroup;
  discovery: 'FEATURED' | 'GROUPED' | 'ADVANCED' | 'HIDDEN';
  sortOrder: number;
  kind: 'family' | 'product';
  activeVariantCount: number;
  totalVariantCount: number;
  activePriceCount: number;
  presetCount: number;
  addonCount: number;
  isPrepared: boolean;
  wizardSteps: string[];
  readiness: {
    isReady: boolean;
    blockers: string[];
    warnings: string[];
  };
}

export interface WizardStepField {
  name: string;
  label: string;
  type: 'select' | 'radio' | 'checkbox' | 'text' | 'number' | 'resources' | 'region' | 'domain' | 'plan' | 'addon' | 'os_image' | 'ssh_key';
  options?: Array<{ label: string; value: string; description?: string }>;
  defaultValue?: unknown;
  required?: boolean;
}

export interface WizardStepConfig {
  id: string;
  title: string;
  description?: string;
  component: string;
  required?: boolean;
  fields?: WizardStepField[];
}

export interface OfferingWizardConfig {
  version: number;
  defaultStep?: string;
  steps: WizardStepConfig[];
}

export interface OfferingStudioDetail {
  slug: string;
  name: string;
  summary: string;
  description?: string;
  category: CatalogGroup;
  kind: 'family' | 'vps' | 'email' | 'product';
  discovery: 'FEATURED' | 'GROUPED' | 'ADVANCED' | 'HIDDEN';
  sortOrder: number;
  orderable: boolean;
  availability: string;
  variants: Array<{
    slug: string;
    label: string;
    productSlug: string;
    fulfilment: string;
    minRam: number;
    minCpu: number;
    minDisk: number;
    defaultRam: number;
    defaultCpu: number;
    defaultDisk: number;
    price: { amount: number; currency: string; period: string } | null;
    yearlyPrice: { amount: number; currency: string; period: string } | null;
  }>;
  presets: Array<{
    slug: string;
    name: string;
    variantSlug: string | null;
    version: number;
    plugins: string[];
  }>;
  addons: Array<{
    slug: string;
    name: string;
    kind: string;
  }>;
  wizardConfig: OfferingWizardConfig;
  variantGates: Array<{
    slug: string;
    ready: boolean;
    blockers: string[];
    checks: Array<{ name: string; ok: boolean; message: string }>;
  }>;
}

export interface TestQuoteResult {
  testQuote: {
    total: number;
    subtotal: number;
    discount: number;
    currency: string;
    period: 'MONTHLY' | 'YEARLY';
    items: Array<{
      productSlug: string;
      name: string;
      unitAmount: number;
      total: number;
      ram: number;
      cpu: number;
      disk: number;
    }>;
  };
}

const CATEGORY_CHOICES: { value: string; label: string }[] = [
  { value: 'all', label: 'All offerings' },
  { value: 'minecraft', label: 'Minecraft' },
  { value: 'vps', label: 'VPS' },
  { value: 'email-hosting', label: 'Email' },
  { value: 'games', label: 'Games' },
  { value: 'web-apps', label: 'Web Apps' },
  { value: 'databases-queues', label: 'Databases' },
  { value: 'tools-automation', label: 'Tools' },
];

export default function ProductStudio() {
  const { slug } = useParams();
  const { navigate } = useRouter();
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'products.write');

  if (slug) {
    return <OfferingDetailView slug={slug} onBack={() => navigate('/admin/catalog/studio')} mayWrite={mayWrite} />;
  }

  return <OfferingListView onSelect={(s) => navigate(`/admin/catalog/studio/${encodeURIComponent(s)}`)} mayWrite={mayWrite} />;
}

function OfferingListView({ onSelect, mayWrite }: { onSelect: (slug: string) => void; mayWrite: boolean }) {
  const [category, setCategory] = useState('all');
  const [readinessFilter, setReadinessFilter] = useState<'all' | 'ready' | 'blocked'>('all');
  const [search, setSearch] = useState('');

  const state = useAsync<{ offerings: OfferingStudioSummary[]; note: string }>(
    (signal) => get('/admin/catalog/studio', undefined, signal),
    [],
  );

  const offerings = state.data?.offerings ?? [];

  const filtered = useMemo(() => {
    return offerings.filter((o) => {
      if (category !== 'all' && o.category !== category) return false;
      if (readinessFilter === 'ready' && !o.readiness.isReady) return false;
      if (readinessFilter === 'blocked' && o.readiness.isReady) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = o.name.toLowerCase().includes(q);
        const matchesSlug = o.slug.toLowerCase().includes(q);
        const matchesSummary = o.summary.toLowerCase().includes(q);
        if (!matchesName && !matchesSlug && !matchesSummary) return false;
      }
      return true;
    });
  }, [offerings, category, readinessFilter, search]);

  const totalOfferings = offerings.length;
  const readyOfferings = offerings.filter((o) => o.readiness.isReady).length;
  const blockedOfferings = totalOfferings - readyOfferings;
  const totalVariants = offerings.reduce((acc, o) => acc + o.activeVariantCount, 0);

  const columns: TableColumn<OfferingStudioSummary>[] = [
    {
      key: 'name',
      header: 'Offering',
      render: (o) => (
        <div>
          <button
            type="button"
            onClick={() => onSelect(o.slug)}
            className="text-left font-medium text-ink hover:text-acc focus:outline-none"
          >
            {o.name}
          </button>
          <div className="font-mono text-[12px] text-ink3">{o.slug}</div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (o) => groupLabel(o.category),
    },
    {
      key: 'variants',
      header: 'Variants & Presets',
      render: (o) => (
        <span className="text-[13px] text-ink2">
          {o.activeVariantCount} active ({o.totalVariantCount} total) · {o.presetCount} presets
        </span>
      ),
    },
    {
      key: 'readiness',
      header: 'Readiness Gate',
      render: (o) => {
        if (o.readiness.isReady) {
          return <StatusPill status="active" label="Ready to Deploy" />;
        }
        return (
          <div className="flex flex-col gap-0.5">
            <StatusPill status="failed" label={`${o.readiness.blockers.length} Blocker(s)`} />
            <span className="truncate max-w-[200px] text-[11px] text-bad" title={o.readiness.blockers.join(', ')}>
              {o.readiness.blockers[0]}
            </span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      width: '12rem',
      render: (o) => (
        <div className="flex items-center justify-end gap-2">
          <Link to={`/app/deploy/${encodeURIComponent(o.slug)}`} className={denseGhost} target="_blank">
            Deploy Live
          </Link>
          <button type="button" onClick={() => onSelect(o.slug)} className={densePrimary}>
            Configure
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <span className="text-[12px] font-semibold uppercase tracking-wider text-acc">Admin Catalogue 3.0</span>
          <h1 className="text-[26px] font-bold tracking-tight text-ink">Product Studio</h1>
          <p className="mt-1 text-[14px] text-ink2">
            Configure unified offerings, dynamic checkout wizards, readiness checks, and server-side pricing quotes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/catalog/families" className={denseGhost}>
            Families View
          </Link>
          <Link to="/app/deploy" className={densePrimary} target="_blank">
            <span className="flex items-center gap-1.5">
              <Icon name="rocket" size={14} /> Public Deploy Studio
            </span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total Offerings" value={totalOfferings} icon="box" />
        <StatTile label="Deploy Ready" value={readyOfferings} icon="check" />
        <StatTile label="Blocked / Draft" value={blockedOfferings} icon="shield" />
        <StatTile label="Active Variants" value={totalVariants} icon="db" />
      </div>

      <Panel title="Offerings Catalogue">
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              ariaLabel="Filter by category"
              value={category}
              onChange={setCategory}
              options={CATEGORY_CHOICES}
            />
            <div className="w-full sm:w-64">
              <TextInput
                label="Search offerings"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, slug, tag…"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-ink3">Status:</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setReadinessFilter('all')}
                className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                  readinessFilter === 'all' ? 'bg-acc text-on-acc' : 'bg-s2 text-ink2 hover:bg-s3'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setReadinessFilter('ready')}
                className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                  readinessFilter === 'ready' ? 'bg-acc text-on-acc' : 'bg-s2 text-ink2 hover:bg-s3'
                }`}
              >
                Ready only
              </button>
              <button
                type="button"
                onClick={() => setReadinessFilter('blocked')}
                className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                  readinessFilter === 'blocked' ? 'bg-acc text-on-acc' : 'bg-s2 text-ink2 hover:bg-s3'
                }`}
              >
                Needs attention
              </button>
            </div>
          </div>
        </div>

        {state.loading && !state.data ? (
          <LoadingBlock rows={5} label="Loading Product Studio catalogue…" />
        ) : state.error ? (
          <ErrorState title="Could not load offerings" message={state.error.message} onRetry={state.reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matching offerings"
            description="Adjust your search query or category filter to discover offerings."
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(o) => o.slug}
              rowTo={(o) => `/admin/catalog/studio/${encodeURIComponent(o.slug)}`}
              minWidth="800px"
            />
            <CardList rows={filtered} rowKey={(o) => o.slug}>
              {(o) => (
                <div className="grid gap-2 p-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onSelect(o.slug)}
                      className="text-left font-semibold text-ink"
                    >
                      {o.name}
                    </button>
                    {o.readiness.isReady ? (
                      <StatusPill status="active" label="Ready" />
                    ) : (
                      <StatusPill status="failed" label="Blocked" />
                    )}
                  </div>
                  <p className="text-[13px] text-ink2">{o.summary}</p>
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-mono text-[12px] text-ink3">{groupLabel(o.category)}</span>
                    <button type="button" onClick={() => onSelect(o.slug)} className={densePrimary}>
                      Configure
                    </button>
                  </div>
                </div>
              )}
            </CardList>
          </>
        )}
      </Panel>
    </div>
  );
}

function OfferingDetailView({
  slug,
  onBack,
  mayWrite,
}: {
  slug: string;
  onBack: () => void;
  mayWrite: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'wizard' | 'test-quote' | 'variants'>('wizard');
  const state = useAsync<{ offering: OfferingStudioDetail }>(
    (signal) => get(`/admin/catalog/studio/${encodeURIComponent(slug)}`, undefined, signal),
    [slug],
  );

  const detail = state.data?.offering;

  const publishAction = useAction(async () => {
    const res = await post<{ ok: boolean; message?: string }>(
      `/admin/catalog/studio/${encodeURIComponent(slug)}/publish`,
      {},
    );
    state.reload();
    return res;
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className={denseGhost}>
            <span className="flex items-center gap-1.5">
              <Icon name="arrow" size={13} className="rotate-180" /> Back to offerings
            </span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[24px] font-bold tracking-tight text-ink">{detail?.name ?? slug}</h1>
              {detail && (
                <span className="rounded-full bg-s2 px-2.5 py-0.5 font-mono text-[11px] text-ink2">
                  {detail.kind}
                </span>
              )}
            </div>
            <p className="text-[13.5px] text-ink3">{detail?.summary ?? 'Loading offering details…'}</p>
          </div>
        </div>

        {detail && (
          <div className="flex items-center gap-2">
            <Link
              to={`/app/deploy/${encodeURIComponent(detail.slug)}`}
              target="_blank"
              className={denseGhost}
            >
              <span className="flex items-center gap-1.5">
                <Icon name="rocket" size={14} /> Open Live Customer Flow
              </span>
            </Link>
            {mayWrite && (
              <PrimaryButton
                disabled={publishAction.pending}
                onClick={() => void publishAction.run()}
              >
                {publishAction.pending ? 'Publishing…' : 'Publish Offering'}
              </PrimaryButton>
            )}
          </div>
        )}
      </div>

      {state.loading && !state.data ? (
        <LoadingBlock rows={6} label="Loading offering details…" />
      ) : state.error ? (
        <ErrorState title="Could not load offering" message={state.error.message} onRetry={state.reload} />
      ) : !detail ? (
        <EmptyState title="Offering not found" description="The requested offering slug does not exist." />
      ) : (
        <div className="grid gap-6">
          <div className="flex gap-2 border-b border-line pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('wizard')}
              className={`rounded-xl px-4 py-2 text-[14px] font-medium transition-colors ${
                activeTab === 'wizard' ? 'bg-acc text-on-acc' : 'text-ink2 hover:bg-s2 hover:text-ink'
              }`}
            >
              Wizard Workflow Schema
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('test-quote')}
              className={`rounded-xl px-4 py-2 text-[14px] font-medium transition-colors ${
                activeTab === 'test-quote' ? 'bg-acc text-on-acc' : 'text-ink2 hover:bg-s2 hover:text-ink'
              }`}
            >
              Authoritative Test Quote Sandbox
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('variants')}
              className={`rounded-xl px-4 py-2 text-[14px] font-medium transition-colors ${
                activeTab === 'variants' ? 'bg-acc text-on-acc' : 'text-ink2 hover:bg-s2 hover:text-ink'
              }`}
            >
              Variants & Readiness Gates ({detail.variants.length})
            </button>
          </div>

          {activeTab === 'wizard' && (
            <WizardSchemaEditor
              offering={detail}
              mayWrite={mayWrite}
              onSaved={() => state.reload()}
            />
          )}

          {activeTab === 'test-quote' && (
            <TestQuoteSandbox offering={detail} />
          )}

          {activeTab === 'variants' && (
            <VariantsReadinessView offering={detail} />
          )}
        </div>
      )}
    </div>
  );
}

function WizardSchemaEditor({
  offering,
  mayWrite,
  onSaved,
}: {
  offering: OfferingStudioDetail;
  mayWrite: boolean;
  onSaved: () => void;
}) {
  const [steps, setSteps] = useState<WizardStepConfig[]>(() => offering.wizardConfig.steps ?? []);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const saveAction = useAction(async () => {
    const res = await put(`/admin/catalog/studio/${encodeURIComponent(offering.slug)}/wizard`, {
      version: (offering.wizardConfig.version ?? 1) + 1,
      steps,
    });
    onSaved();
    return res;
  });

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const item = next[index];
    next[index] = next[target];
    next[target] = item;
    setSteps(next);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const addStep = () => {
    const newStep: WizardStepConfig = {
      id: `step_${steps.length + 1}`,
      title: 'New Configuration Step',
      description: 'Configure deployment options',
      component: 'resources',
      required: true,
    };
    setSteps([...steps, newStep]);
    setEditingIndex(steps.length);
  };

  return (
    <Panel
      title="Deploy Studio Step Flow"
      description="Define the exact sequence of typed step components presented to the customer. All state flows across these steps into one authoritative quote and checkout."
      action={
        mayWrite ? (
          <div className="flex gap-2">
            <SoftButton onClick={addStep}>Add Step</SoftButton>
            <PrimaryButton
              disabled={saveAction.pending}
              onClick={() => void saveAction.run()}
            >
              {saveAction.pending ? 'Saving…' : 'Save Wizard Schema'}
            </PrimaryButton>
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        {steps.map((step, idx) => (
          <div
            key={step.id || idx}
            className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4 transition-colors hover:border-acc/40"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-s2 font-mono text-[13px] font-bold text-ink">
                  {idx + 1}
                </span>
                <div>
                  <div className="font-semibold text-ink">{step.title}</div>
                  <div className="font-mono text-[12px] text-ink3">
                    id: <span className="text-acc">{step.id}</span> · component:{' '}
                    <span className="text-ink2">{step.component}</span>
                    {step.required ? ' · required' : ' · optional'}
                  </div>
                </div>
              </div>

              {mayWrite && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveStep(idx, 'up')}
                    className="rounded p-1.5 text-ink3 hover:bg-s2 hover:text-ink disabled:opacity-30"
                    title="Move up"
                  >
                    <Icon name="arrow" size={13} className="-rotate-90" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === steps.length - 1}
                    onClick={() => moveStep(idx, 'down')}
                    className="rounded p-1.5 text-ink3 hover:bg-s2 hover:text-ink disabled:opacity-30"
                    title="Move down"
                  >
                    <Icon name="arrow" size={13} className="rotate-90" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingIndex(editingIndex === idx ? null : idx)}
                    className={denseGhost}
                  >
                    {editingIndex === idx ? 'Close' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(idx)}
                    className="rounded p-1.5 text-bad hover:bg-bad/10"
                    title="Remove step"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              )}
            </div>

            {editingIndex === idx && (
              <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                <TextInput
                  label="Step Title"
                  value={step.title}
                  onChange={(e) => {
                    const next = [...steps];
                    next[idx].title = e.target.value;
                    setSteps(next);
                  }}
                />
                <TextInput
                  label="Step ID"
                  value={step.id}
                  onChange={(e) => {
                    const next = [...steps];
                    next[idx].id = e.target.value;
                    setSteps(next);
                  }}
                />
                <TextInput
                  label="Component Key"
                  value={step.component}
                  onChange={(e) => {
                    const next = [...steps];
                    next[idx].component = e.target.value;
                    setSteps(next);
                  }}
                  hint="e.g. source, variant, plan, resources, os_image, addons, review"
                />
                <TextInput
                  label="Description"
                  value={step.description ?? ''}
                  onChange={(e) => {
                    const next = [...steps];
                    next[idx].description = e.target.value;
                    setSteps(next);
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TestQuoteSandbox({ offering }: { offering: OfferingStudioDetail }) {
  const [variantSlug, setVariantSlug] = useState(offering.variants[0]?.slug ?? '');
  const [period, setPeriod] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [ramMb, setRamMb] = useState<number>(offering.variants[0]?.defaultRam ?? 2048);
  const [cpuCores, setCpuCores] = useState<number>(offering.variants[0]?.defaultCpu ?? 1);
  const [diskGb, setDiskGb] = useState<number>(offering.variants[0]?.defaultDisk ?? 20);
  const [mailDomain, setMailDomain] = useState('blipmade-test.example.com');
  const [quoteResult, setQuoteResult] = useState<TestQuoteResult | null>(null);

  const selectedVariant = offering.variants.find((v) => v.slug === variantSlug) ?? offering.variants[0];

  const testAction = useAction(async () => {
    const res = await post<TestQuoteResult>(
      `/admin/catalog/studio/${encodeURIComponent(offering.slug)}/test-quote`,
      {
        variantSlug,
        period,
        ram: ramMb,
        cpu: cpuCores,
        disk: diskGb,
        mailDomain,
      },
    );
    setQuoteResult(res);
    return res;
  });

  const quoteData = quoteResult?.testQuote;

  return (
    <Panel
      title="Authoritative Server Quote Test"
      description="Verify that the server pricing engine, discount cards, and resource limits compute accurate pricing for this offering without creating test orders."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-4">
          <Select
            label="Target Variant / SKU"
            value={variantSlug}
            onChange={(e) => {
              const val = e.target.value;
              setVariantSlug(val);
              const found = offering.variants.find((v) => v.slug === val);
              if (found) {
                setRamMb(found.defaultRam || 2048);
                setCpuCores(found.defaultCpu || 1);
                setDiskGb(found.defaultDisk || 20);
              }
            }}
          >
            {offering.variants.map((v) => (
              <option key={v.slug} value={v.slug}>
                {v.label} ({v.productSlug}) - {v.price ? `$${(v.price.amount / 100).toFixed(2)}` : 'No price'}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[13px] font-medium text-ink2 mb-1.5">Billing Period</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPeriod('MONTHLY')}
                  className={`flex-1 rounded-xl py-2 text-[13px] font-semibold border ${
                    period === 'MONTHLY' ? 'border-acc bg-acc/10 text-acc' : 'border-line text-ink2'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('YEARLY')}
                  className={`flex-1 rounded-xl py-2 text-[13px] font-semibold border ${
                    period === 'YEARLY' ? 'border-acc bg-acc/10 text-acc' : 'border-line text-ink2'
                  }`}
                >
                  Yearly
                </button>
              </div>
            </div>
            {selectedVariant?.fulfilment === 'EMAIL' && (
              <TextInput
                label="Mail Domain"
                value={mailDomain}
                onChange={(e) => setMailDomain(e.target.value)}
              />
            )}
          </div>

          {selectedVariant?.fulfilment !== 'VPS' && selectedVariant?.fulfilment !== 'EMAIL' && (
            <div className="grid grid-cols-3 gap-3">
              <TextInput
                label="RAM (MB)"
                type="number"
                value={ramMb}
                onChange={(e) => setRamMb(Number(e.target.value))}
              />
              <TextInput
                label="CPU Cores"
                type="number"
                value={cpuCores}
                onChange={(e) => setCpuCores(Number(e.target.value))}
              />
              <TextInput
                label="Disk (GB)"
                type="number"
                value={diskGb}
                onChange={(e) => setDiskGb(Number(e.target.value))}
              />
            </div>
          )}

          <div>
            <PrimaryButton
              disabled={testAction.pending}
              onClick={() => void testAction.run()}
            >
              {testAction.pending ? 'Calculating Quote…' : 'Run Authoritative Quote Test'}
            </PrimaryButton>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-s1 p-5">
          <h3 className="text-[16px] font-bold text-ink">Server Quote Breakdown</h3>
          <p className="mt-0.5 text-[12.5px] text-ink3">
            Direct response from backend quote service (`buildQuote`)
          </p>

          {testAction.pending ? (
            <div className="mt-4">
              <LoadingBlock rows={3} label="Evaluating server rate cards…" />
            </div>
          ) : testAction.error ? (
            <div className="mt-4 rounded-xl border border-bad/30 bg-bad/10 p-4 text-[13px] text-bad">
              <strong>Calculation Error:</strong> {testAction.error}
            </div>
          ) : quoteData ? (
            <div className="mt-4 grid gap-3">
              <div className="flex justify-between border-b border-line pb-2 text-[14px]">
                <span className="text-ink2">Subtotal</span>
                <span className="font-mono text-ink">
                  ${(quoteData.subtotal / 100).toFixed(2)} {quoteData.currency}
                </span>
              </div>
              {quoteData.discount > 0 && (
                <div className="flex justify-between border-b border-line pb-2 text-[14px] text-acc">
                  <span>Discount</span>
                  <span className="font-mono">-${(quoteData.discount / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-line pb-2 text-[16px] font-bold">
                <span className="text-ink">Total Authoritative Price</span>
                <span className="font-mono text-acc">
                  ${(quoteData.total / 100).toFixed(2)} {quoteData.currency} / {quoteData.period.toLowerCase()}
                </span>
              </div>

              <div className="mt-2">
                <span className="text-[12px] font-semibold uppercase text-ink3">Priced Items ({quoteData.items.length})</span>
                <div className="mt-1 grid gap-2">
                  {quoteData.items.map((item, idx) => (
                    <div key={idx} className="rounded-lg bg-card p-3 text-[13px] border border-line">
                      <div className="flex justify-between font-medium text-ink">
                        <span>{item.name}</span>
                        <span className="font-mono">${(item.total / 100).toFixed(2)}</span>
                      </div>
                      <div className="font-mono text-[11.5px] text-ink3">
                        SKU: {item.productSlug} · {item.ram} MB RAM · {item.cpu} CPU · {item.disk} GB Disk
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 text-center text-[13.5px] text-ink3">
              Select configuration options and click &quot;Run Authoritative Quote Test&quot; to inspect live pricing.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function VariantsReadinessView({ offering }: { offering: OfferingStudioDetail }) {
  return (
    <Panel
      title="Variants & Readiness Gate Checks"
      description="Every offering variant maps to an underlying product. For an offering to be orderable, at least one variant must pass the readiness gate."
    >
      <div className="grid gap-3">
        {offering.variants.map((v) => {
          const gate = offering.variantGates.find((g) => g.slug === v.slug);
          const isReady = gate?.ready ?? false;
          return (
            <div
              key={v.slug}
              className="rounded-xl border border-line bg-card p-4 transition-colors hover:border-acc/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{v.label}</span>
                    <span className="font-mono text-[11px] text-ink3">slug: {v.slug}</span>
                    <span className="rounded bg-s2 px-2 py-0.5 font-mono text-[11px] text-ink2">
                      fulfilment: {v.fulfilment}
                    </span>
                  </div>
                  <div className="font-mono text-[12px] text-ink2 mt-0.5">
                    Product SKU: <span className="text-acc">{v.productSlug}</span> · Default:{' '}
                    {v.defaultRam} MB RAM / {v.defaultCpu} vCPU / {v.defaultDisk} GB Disk
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-mono text-[14px] font-bold text-ink">
                      {v.price ? `$${(v.price.amount / 100).toFixed(2)} / mo` : 'Unpriced'}
                    </div>
                    {v.yearlyPrice && (
                      <div className="font-mono text-[11px] text-ink3">
                        ${(v.yearlyPrice.amount / 100).toFixed(2)} / yr
                      </div>
                    )}
                  </div>
                  {isReady ? (
                    <StatusPill status="active" label="Gate Passed" />
                  ) : (
                    <StatusPill status="failed" label="Gate Blocked" />
                  )}
                </div>
              </div>

              {gate && !gate.ready && gate.blockers.length > 0 && (
                <div className="mt-3 rounded-lg border border-bad/30 bg-bad/10 p-3 text-[12.5px] text-bad">
                  <div className="font-semibold">Gate Blockers:</div>
                  <ul className="mt-1 list-inside list-disc">
                    {gate.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {gate && gate.checks && gate.checks.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-2">
                  {gate.checks.map((chk, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                        chk.ok ? 'bg-s2 text-ink2' : 'bg-bad/10 text-bad'
                      }`}
                    >
                      <Icon name={chk.ok ? 'check' : 'close'} size={11} /> {chk.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
