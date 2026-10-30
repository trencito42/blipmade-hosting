import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useRevealOnChange } from '../lib/useReveal';
import { ProductTile } from '../ui';
import { Icon, type IconName } from '../icons';
import { del, get, post, put, type CatalogProduct, type Domain, type Instance } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
import OverviewTab from './instance/OverviewTab';
import {
  ConfirmDialog,
  DangerButton,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingBlock,
  Money,
  Panel,
  PrimaryButton,
  Segmented,
  SoftButton,
  StatusPill,
  TextArea,
  TextInput,
  useToast,
} from '../ui-app';

/**
 * Instance detail. Every value comes from the API; nothing is simulated and no
 * instance is rendered that was not fetched for the id in the route.
 */

type Tab =
  | 'overview'
  | 'console'
  | 'files'
  | 'databases'
  | 'backups'
  | 'network'
  | 'startup'
  | 'schedules'
  | 'settings'
  | 'activity'
  | 'resources'
  | 'domains';
type PowerAction = 'start' | 'restart' | 'stop';

/**
 * The sections of the instance, one after the other.
 *
 * A customer opens the section they came for and nothing else, so the code of
 * the other sections is only asked for when the section is opened. The page
 * of the instance was one bundle of seventy kilobytes; it is now the page and
 * the section that is open, and the other sections travel when they are
 * needed.
 */
const ConsoleTab = lazy(() => import('./instance/ConsoleTab'));
const FilesTab = lazy(() => import('./instance/FilesTab'));
const DatabasesTab = lazy(() => import('./instance/DatabasesTab'));
const BackupsTab = lazy(() => import('./instance/BackupsTab'));
const NetworkTab = lazy(() => import('./instance/NetworkTab'));
const StartupTab = lazy(() => import('./instance/StartupTab'));
const SchedulesTab = lazy(() => import('./instance/SchedulesTab'));
const SettingsTab = lazy(() => import('./instance/SettingsTab'));
const ActivityTab = lazy(() => import('./instance/ActivityTab'));

interface InstanceEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

interface InstanceMetrics {
  state: string;
  cpuAbsolute: number;
  memoryBytes: number;
  networkRx: number;
  networkTx: number;
  diskBytes: number;
  uptimeMs: number;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  mode: string;
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'console', label: 'Console' },
  { value: 'files', label: 'Files' },
  { value: 'databases', label: 'Databases' },
  { value: 'backups', label: 'Backups' },
  { value: 'network', label: 'Network' },
  { value: 'startup', label: 'Startup' },
  { value: 'schedules', label: 'Schedules' },
  { value: 'settings', label: 'Settings' },
  { value: 'activity', label: 'Activity' },
  { value: 'resources', label: 'Resources' },
  { value: 'domains', label: 'Domains' },
];

const POWER_LABEL: Record<PowerAction, string> = {
  start: 'Start',
  restart: 'Restart',
  stop: 'Stop',
};

const KNOWN_ICONS: readonly IconName[] = [
  'arrow', 'arrowUR', 'check', 'search', 'menu', 'close', 'eye', 'eyeOff', 'globe', 'db',
  'folder', 'term', 'chart', 'card', 'rocket', 'shield', 'restart', 'box', 'bolt', 'bot',
  'mon', 'flow', 'code', 'doc',
];

function productIcon(icon: string): IconName {
  return KNOWN_ICONS.includes(icon as IconName) ? (icon as IconName) : 'box';
}

/** Purchased memory, never live usage. */
function fmtRam(mb: number): string {
  if (!Number.isFinite(mb)) return '—';
  if (mb < 1024) return `${mb} MB`;
  const gb = Math.round((mb / 1024) * 100) / 100;
  return `${gb} GB`;
}

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

function fmtUptime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} m`;
  return `${minutes} m`;
}

function fmtDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

/** Text files are editable, binary files are shown as read only. */
function decodeContent(content: string, encoding: string): { text: string; binary: boolean } {
  const kind = (encoding || '').toLowerCase();
  if (!kind || kind === 'utf8' || kind === 'utf-8') return { text: content, binary: false };
  if (kind === 'base64') {
    try {
      const binary = atob(content);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return { text, binary: false };
    } catch {
      return { text: '', binary: true };
    }
  }
  return { text: content, binary: false };
}

function isSecretKey(key: string): boolean {
  return /pass|secret|token|key|cred|auth|dsn/i.test(key);
}

// --- tabs ------------------------------------------------------------------

function Stepper({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const buttonClass =
    'grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-ink transition-colors duration-[180ms] hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="grid gap-2 rounded-2xl bg-s2 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-medium text-ink">{label}</p>
        <p className="font-mono text-[14px] tabular-nums text-ink">
          {value} {unit}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Decrease ${label}`} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - step))} className={buttonClass}>
          −
        </button>
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          className="h-11 min-w-0 flex-1 accent-acc"
        />
        <button type="button" aria-label={`Increase ${label}`} disabled={disabled || value >= max} onClick={() => onChange(clamp(value + step))} className={buttonClass}>
          +
        </button>
      </div>
      <p className="font-mono text-[11.5px] text-ink3">
        Between {min} and {max} {unit}
      </p>
    </div>
  );
}

/**
 * The resources of an instance.
 *
 * A change that costs more is a paid product: the API creates an order and
 * a checkout session, and the limits are only changed once the payment is
 * confirmed. A change that costs less is applied right away.
 */
function ResourcesTab({ instance, onUpdated }: { instance: Instance; onUpdated: (next: Instance) => void }) {
  const { push } = useToast();
  const product = useAsync(
    (signal) => get<{ product: CatalogProduct }>(`/catalog/products/${instance.product.slug}`, undefined, signal),
    [instance.product.slug],
  );

  const [ram, setRam] = useState(instance.ram);
  const [cpu, setCpu] = useState(instance.cpu);
  const [disk, setDisk] = useState(instance.disk);
  const [delta, setDelta] = useState<number | null>(null);
  const [checkout, setCheckout] = useState<{ url: string; orderNumber: string } | null>(null);

  const bounds = product.data?.product;
  const ready = Boolean(bounds);
  const minRam = bounds?.minRam ?? instance.ram;
  const maxRam = bounds?.maxRam ?? instance.ram;
  const minCpu = bounds?.minCpu ?? instance.cpu;
  const maxCpu = bounds?.maxCpu ?? instance.cpu;
  const minDisk = bounds?.minDisk ?? instance.disk;
  const maxDisk = bounds?.maxDisk ?? instance.disk;

  const quote = useAsync(
    (signal) =>
      get<{ quote: { priceDelta: number; newPrice: number; currency: string; requiresPayment: boolean } }>(
        `/instances/${instance.id}/resources/quote`,
        { ram, cpu, disk },
        signal,
      ),
    [instance.id, ram, cpu, disk],
  );

  const save = useAction(async () => {
    const res = await put<{
      status: 'applied' | 'requires_payment' | 'failed';
      instance?: Instance;
      priceDelta: number;
      price: number;
      currency: string;
      checkoutUrl?: string;
      order?: { number: string };
      reason?: string | null;
    }>(`/instances/${instance.id}/resources`, { ram, cpu, disk });
    if (res?.status === 'applied' && res.instance) onUpdated(res.instance);
    return res;
  });

  const onSave = async () => {
    const res = await save.run();
    if (!res) return;
    setDelta(res.priceDelta ?? 0);
    if (res.status === 'requires_payment' && res.checkoutUrl) {
      setCheckout({ url: res.checkoutUrl, orderNumber: res.order?.number ?? '' });
      push('Pay for the change before it is applied.', 'ok');
      return;
    }
    if (res.status === 'applied') {
      setCheckout(null);
      push('Resources updated.', 'ok');
      return;
    }
    push(res.reason ?? 'The resources could not be changed.', 'error');
  };

  return (
    <div className="grid gap-3">
      <Panel title="Purchased limits" description="These are the limits you bought, not live usage.">
        {product.loading ? (
          <LoadingBlock rows={1} label="Loading product limits" />
        ) : product.error ? (
          <ErrorState
            title="We could not load the product limits"
            message={`${product.error.message} Resources cannot be changed without them.`}
            onRetry={product.reload}
          />
        ) : bounds ? (
          <p className="font-mono text-[13.5px] text-ink">
            {fmtRam(bounds.defaultRam)} · {bounds.defaultCpu} vCPU · {bounds.defaultDisk} GB is the default for {bounds.name}.
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-2.5">
        <Stepper label="Memory" value={ram} min={minRam} max={maxRam} step={256} unit="MB" onChange={setRam} disabled={!ready || save.pending} />
        <Stepper label="vCPU" value={cpu} min={minCpu} max={maxCpu} step={1} unit="vCPU" onChange={setCpu} disabled={!ready || save.pending} />
        <Stepper label="Storage" value={disk} min={minDisk} max={maxDisk} step={5} unit="GB" onChange={setDisk} disabled={!ready || save.pending} />
      </div>

      <Panel title="Price">
        <p className="font-mono text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-ink">
          <Money amount={instance.price ?? 0} currency={instance.currency} period="month" />
        </p>
        {quote.data?.quote && quote.data.quote.priceDelta !== 0 && (
          <p className="mt-1 text-[13.5px] text-ink2" aria-live="polite">
            {quote.data.quote.priceDelta > 0 ? 'New price' : 'Price after the change'}:{' '}
            <Money amount={quote.data.quote.newPrice} currency={quote.data.quote.currency} period="month" />
            <span className="ml-2 text-ink3">
              ({quote.data.quote.priceDelta > 0 ? '+' : '−'}
              <Money amount={Math.abs(quote.data.quote.priceDelta)} currency={quote.data.quote.currency} period="month" />)
            </span>
          </p>
        )}
        {delta !== null && (
          <p className="mt-1 text-[13.5px] text-ink2" aria-live="polite">
            Price change: <Money amount={delta} currency={instance.currency} period="month" />
          </p>
        )}
        {save.error && (
          <p role="alert" className="mt-2 rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-medium text-bad">
            {save.error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PrimaryButton onClick={onSave} disabled={!ready || save.pending}>
            {save.pending ? 'Saving…' : 'Save resources'}
          </PrimaryButton>
          {quote.data?.quote.requiresPayment && (
            <span className="text-[13px] text-ink3">This change is paid for before it is applied.</span>
          )}
        </div>
      </Panel>

      {checkout && (
        <Panel title="Payment needed" description={`Order ${checkout.orderNumber} covers the price difference.`}>
          <a
            href={checkout.url}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-acc px-5 text-[14.5px] font-semibold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97]"
          >
            Pay and apply the change
          </a>
        </Panel>
      )}
    </div>
  );
}

function DomainsTab({ instance }: { instance: Instance }) {
  const { push } = useToast();
  const domains = useAsync((signal) => get<{ domains: Domain[] }>('/domains', undefined, signal), []);
  const list = (domains.data?.domains ?? []).filter((domain) => domain.instanceId === instance.id);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      push(`${label} copied.`, 'ok');
    } catch {
      push('Copy failed. Select the value and copy it manually.', 'error');
    }
  };

  return (
    <div className="grid gap-3">
      {domains.loading ? (
        <LoadingBlock rows={2} label="Loading domains" />
      ) : domains.error ? (
        <ErrorState title="We could not load your domains" message={domains.error.message} onRetry={domains.reload} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No domains for this instance."
          description="Add a hostname and point its DNS records at Blipmade."
          action={
            <Link
              to="/app/domains"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-acc px-5 text-[14.5px] font-semibold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Manage domains
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          {list.map((domain) => (
            <Panel key={domain.id} title={domain.hostname} action={<StatusPill status={domain.status} />}>
              <div className="grid gap-3">
                <p className="text-[13.5px] text-ink2">
                  Port {domain.targetPort}
                  {domain.status === 'active' && (
                    <>
                      {' · '}
                      <a
                        href={`https://${domain.hostname}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-bold text-acc underline underline-offset-2 hover:text-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                      >
                        Open site
                      </a>
                    </>
                  )}
                </p>

                {domain.lastError && (
                  <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[13.5px] font-medium text-bad">
                    {domain.lastError}
                  </p>
                )}

                {domain.dnsRecords.length > 0 ? (
                  <div className="grid gap-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">DNS records</p>
                    {/* On a phone the record is a small stack of facts: the
                        name and the value are not squeezed into one line by
                        the button next to them. */}
                    {domain.dnsRecords.map((record) => (
                      <div
                        key={`${record.name}-${record.type}`}
                        className="grid gap-1.5 rounded-2xl bg-s2 p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-2"
                      >
                        <span className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink3">{record.type}</span>
                        <span className="w-0 min-w-0 flex-1 truncate font-mono text-[13px] text-ink" title={record.name}>
                          {record.name}
                        </span>
                        <span className="w-0 min-w-0 flex-1 truncate font-mono text-[13px] text-ink2" title={record.value}>
                          {record.value}
                        </span>
                        <SoftButton
                          onClick={() => copy(record.value, 'DNS record')}
                          aria-label={`Copy ${record.type} record for ${record.name}`}
                          className="justify-self-start sm:ml-auto"
                        >
                          Copy
                        </SoftButton>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13.5px] text-ink3">No DNS records yet.</p>
                )}
              </div>
            </Panel>
          ))}

          <Link
            to="/app/domains"
            className="text-[14px] font-medium text-acc underline underline-offset-2 transition-colors duration-[180ms] hover:text-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            Manage all domains
          </Link>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  instance,
  onUpdated,
  onCancelled,
}: {
  instance: Instance;
  onUpdated: (next: Instance) => void;
  onCancelled: () => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState(instance.name);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rename = useAction(async () => {
    const res = await post<{ instance: Instance }>(`/instances/${instance.id}/rename`, { name: name.trim() });
    if (res?.instance) onUpdated(res.instance);
    return res;
  });

  const cancel = useAction(async () => {
    await post<void>(`/instances/${instance.id}/cancel`);
    return true;
  });

  const onRename = async () => {
    const res = await rename.run();
    if (res) push('Name updated.', 'ok');
  };

  const onCancel = async () => {
    const done = await cancel.run();
    setConfirmOpen(false);
    if (done) {
      push('Cancellation scheduled for the end of the paid period.', 'ok');
      onCancelled();
    }
  };

  return (
    <Panel title="Settings">
      <div className="grid gap-3">
        <TextInput
          label="Instance name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          className="scroll-mt-16"
        />
        {rename.error && (
          <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-medium text-bad">
            {rename.error}
          </p>
        )}
        <div>
          <PrimaryButton onClick={onRename} disabled={rename.pending || !name.trim()} className="w-full sm:w-auto">
            {rename.pending ? 'Saving…' : 'Save name'}
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Cancel instance</h3>
        <p className="text-[13.5px] text-ink2">
          The instance keeps running until the end of the paid period, then it is removed.
        </p>
        {cancel.error && (
          <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-medium text-bad">
            {cancel.error}
          </p>
        )}
        <div>
          <DangerButton onClick={() => setConfirmOpen(true)} disabled={cancel.pending} className="w-full sm:w-auto">
            Cancel instance
          </DangerButton>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Cancel this instance?"
        description={`${instance.name} stops at the end of the paid period. You can resume it from billing before then.`}
        confirmLabel="Cancel instance"
        busy={cancel.pending}
        requireText={instance.name}
        onConfirm={onCancel}
        onCancel={() => setConfirmOpen(false)}
      />
    </Panel>
  );
}

// --- page ------------------------------------------------------------------

export default function InstanceDetail() {
  const { id } = useParams();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const tabsRef = useRef<HTMLDivElement>(null);
  useRevealOnChange(tabsRef, [tab], 120);
  const [powerCooldown, setPowerCooldown] = useState(0);
  useEffect(() => {
    if (powerCooldown <= 0) return;
    const timer = window.setTimeout(() => setPowerCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [powerCooldown]);

  const { data, loading, error, reload, setData } = useAsync(
    (signal) => get<{ instance: Instance }>(`/instances/${id}`, undefined, signal),
    [id],
  );

  const instance = data?.instance;
  const provisioning = instance?.status === 'pending' || instance?.status === 'provisioning';

  useEffect(() => {
    if (!provisioning || !id) return;
    const timer = window.setInterval(() => {
      void get<{ instance: Instance }>(`/instances/${id}`).then((fresh) => setData(fresh)).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [id, provisioning, setData]);

  const power = useAction(async (action: PowerAction) => {
    const res = await post<{ instance: Instance }>(`/instances/${id}/power`, { action });
    if (res?.instance) setData({ instance: res.instance });
    return true;
  });

  const onPower = async (action: PowerAction) => {
    const done = await power.run(action);
    if (done) {
      setPowerCooldown(30);
      push(`${POWER_LABEL[action]} requested.`, 'ok');
    }
  };

  if (loading) {
    return <LoadingBlock rows={4} label="Loading instance" />;
  }

  if (error || !instance) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="We could not load this instance"
          message={error?.message ?? 'The instance was not found.'}
          onRetry={reload}
        />
        <Link to="/app/instances" className="px-1 text-[14px] font-medium text-acc hover:underline">
          Back to your instances
        </Link>
      </div>
    );
  }

  const status = instance.status;
  const canStart = status === 'stopped' || status === 'failed';
  const canStop = status === 'online' || status === 'degraded';
  const canRestart = status === 'online' || status === 'degraded' || status === 'stopped';

  return (
    <div className="grid gap-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-ink3">
        <Link to="/app/instances" className="font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
          Instances
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="w-0 min-w-0 flex-1 truncate font-bold text-ink" title={instance.name}>
          {instance.name}
        </span>
      </nav>

      <header className="grid gap-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <ProductTile slug={instance.product.slug} icon={instance.product.icon} size={46} />
            <div className="w-0 min-w-0 flex-1">
              <h2 className="truncate text-[20px] font-semibold tracking-[-0.035em] text-ink" title={instance.name}>
                {instance.name}
              </h2>
              <p className="truncate text-[13px] text-ink3" title={instance.product.name}>
                {instance.product.name}
              </p>
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <StatusPill status={instance.status} />
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {instance.url ? (
            <a
              href={instance.url}
              target="_blank"
              rel="noreferrer noopener"
              title={instance.url}
              className="inline-flex max-w-full min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-4 text-[13.5px] font-medium text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              <span className="min-w-0 break-all">{instance.url}</span>
              <Icon name="arrowUR" size={15} className="shrink-0" />
            </a>
          ) : (
            <span className="text-[13.5px] text-ink3">No public URL yet</span>
          )}

          <SoftButton onClick={() => onPower('start')} disabled={!canStart || power.pending || powerCooldown > 0}>
            Start
          </SoftButton>
          <SoftButton onClick={() => onPower('restart')} disabled={!canRestart || power.pending || powerCooldown > 0}>
            {powerCooldown > 0 ? `Restart (${powerCooldown}s)` : 'Restart'}
          </SoftButton>
          <SoftButton onClick={() => onPower('stop')} disabled={!canStop || power.pending || powerCooldown > 0}>
            Stop
          </SoftButton>
        </div>

        {power.error && (
          <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-medium text-bad">
            {power.error}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {power.pending ? 'Working' : ''}
        </p>
      </header>

      <div ref={tabsRef} className="scroll-mt-28">
        <Segmented options={TABS} value={tab} onChange={setTab} ariaLabel="Instance sections" />
      </div>

      <section role="tabpanel" aria-label={TABS.find((entry) => entry.value === tab)?.label ?? 'Instance section'}>
        {provisioning ? (
          <Panel title="Your service is being prepared" description="The panel will open automatically when provisioning finishes.">
            <LoadingBlock rows={2} label="Provisioning the instance" />
          </Panel>
        ) : (
        <Suspense fallback={<LoadingBlock rows={4} label="Loading section" />}>
          {tab === 'overview' && <OverviewTab instance={instance} onGoTo={setTab} />}
          {tab === 'console' && <ConsoleTab instance={instance} />}
          {tab === 'files' && <FilesTab instance={instance} />}
          {tab === 'databases' && <DatabasesTab instance={instance} />}
          {tab === 'backups' && <BackupsTab instance={instance} />}
          {tab === 'network' && <NetworkTab instance={instance} />}
          {tab === 'startup' && <StartupTab instance={instance} />}
          {tab === 'schedules' && <SchedulesTab instance={instance} />}
          {tab === 'settings' && <SettingsTab instance={instance} onGoTo={setTab} />}
          {tab === 'activity' && <ActivityTab instance={instance} />}
          {tab === 'resources' && <ResourcesTab instance={instance} onUpdated={(next) => setData({ instance: next })} />}
          {tab === 'domains' && <DomainsTab instance={instance} />}
        </Suspense>
        )}
      </section>

      <SettingsPanel
        instance={instance}
        onUpdated={(next) => setData({ instance: next })}
        onCancelled={reload}
      />
    </div>
  );
}
