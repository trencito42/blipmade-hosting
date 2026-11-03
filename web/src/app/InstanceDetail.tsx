import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useRevealOnChange } from '../lib/useReveal';
import { ProductTile } from '../ui';
import { Icon, type IconName } from '../icons';
import { del, get, post, put, type CatalogProduct, type Domain, type Instance } from '../lib/api';
import { listEvents } from '../lib/instance-api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link, useParams, useRouter } from '../router';
import OverviewTab from './instance/OverviewTab';
import { ButtonGroup } from './components/premium';
import {
  ButtonLink,
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
  | 'domains'
  | 'uptime'
  | 'git'
  | 'minecraft'
  | 'access';
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
const UptimeTab = lazy(() => import('./instance/UptimeTab'));
const GitTab = lazy(() => import('./instance/GitTab'));
const MinecraftTab = lazy(() => import('./instance/MinecraftTab'));
const HelpPanel = lazy(() => import('./instance/HelpPanel'));
const SftpPanel = lazy(() => import('./instance/SftpPanel'));
const AlertsPanel = lazy(() => import('./instance/AlertsPanel'));
const AccessTab = lazy(() => import('./instance/AccessTab'));
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
  { value: 'uptime', label: 'Uptime' },
  { value: 'git', label: 'Deploy' },
  { value: 'minecraft', label: 'Minecraft' },
  { value: 'access', label: 'Access' },
];

/** The sections shown first. The others open with More. */
const PRIMARY_TABS: Tab[] = ['overview', 'console', 'files', 'databases', 'backups', 'settings', 'minecraft'];
const MINECRAFT_SLUGS = ['minecraft-paper', 'minecraft-folia', 'minecraft-forge'];

function primaryTabsFor(slug: string | undefined): Tab[] {
  if (slug && MINECRAFT_SLUGS.includes(slug)) return ['overview', 'console', 'minecraft', 'backups', 'settings'];
  return PRIMARY_TABS;
}

/** What a member of a shared server does not get: the parts that belong to the owner. */
const OWNER_ONLY: Tab[] = ['settings', 'resources', 'domains', 'access'];
/** A viewer only looks. */
const VIEWER_HIDDEN: Tab[] = ['files', 'startup', 'schedules', 'databases', 'backups', 'network', 'git', 'minecraft'];

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

/**
 * The resources of an instance: what was bought. Changing them is a page of its own, because a change can cost money
 * and the server quotes the price before anything is applied.
 */
function ResourcesTab({ instance }: { instance: Instance }) {
  const product = useAsync(
    (signal) => get<{ product: CatalogProduct }>(`/catalog/products/${instance.product.slug}`, undefined, signal),
    [instance.product.slug],
  );
  const bounds = product.data?.product;
  return (
    <div className="grid gap-3">
      <Panel
        title="Purchased limits"
        description="These are the limits you bought, not live usage."
        action={<ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/resources/edit`} variant="soft">Change resources</ButtonLink>}
      >
        <dl className="grid gap-3 sm:grid-cols-3">
          <div><dt className="text-[12.5px] text-ink3">Memory</dt><dd className="mt-0.5 font-mono text-[18px] font-semibold text-ink">{fmtRam(instance.ram)}</dd></div>
          <div><dt className="text-[12.5px] text-ink3">vCPU</dt><dd className="mt-0.5 font-mono text-[18px] font-semibold text-ink">{instance.cpu}</dd></div>
          <div><dt className="text-[12.5px] text-ink3">Storage</dt><dd className="mt-0.5 font-mono text-[18px] font-semibold text-ink">{instance.disk} GB</dd></div>
        </dl>
        {product.error ? (
          <p className="mt-3 text-[13px] text-ink3">The limits of the product could not be loaded, so resources cannot be changed right now.</p>
        ) : bounds ? (
          <p className="mt-3 font-mono text-[12.5px] text-ink3">
            {fmtRam(bounds.defaultRam)} · {bounds.defaultCpu} vCPU · {bounds.defaultDisk} GB is the default for {bounds.name}.
          </p>
        ) : null}
      </Panel>
      <Panel title="Price">
        <p className="font-mono text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-ink">
          <Money amount={instance.price ?? 0} currency={instance.currency} period="month" />
        </p>
      </Panel>
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

/** What a closed service shows instead of its panels: why it is closed, what to do next, and what happened to it. */
function ClosedService({ instance }: { instance: Instance }) {
  const events = useAsync((signal) => listEvents(instance.id, signal), [instance.id]);
  const recent = (events.data?.events ?? []).slice(0, 8);
  return (
    <div className="grid gap-4">
      <Panel
        title="This service is closed"
        description="It was cancelled. It cannot be started, opened or changed any more. Its files are kept for a while according to the retention policy, then removed."
      >
        <div className="flex flex-wrap gap-2">
          <Link to="/app/deploy" className="inline-flex h-11 items-center justify-center rounded-xl bg-acc px-5 text-[14.5px] font-semibold text-on-acc hover:bg-acc-h">Deploy a new one</Link>
          <Link to="/app/billing" className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-card px-5 text-[14.5px] font-semibold text-ink hover:bg-s3">Billing and invoices</Link>
          <Link to="/app/instances" className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-card px-5 text-[14.5px] font-semibold text-ink hover:bg-s3">Back to your services</Link>
        </div>
      </Panel>
      <Panel title="What happened" description="The last events of this service, from our records.">
        {recent.length === 0 ? (
          <p className="text-[13.5px] text-ink3">Nothing recorded.</p>
        ) : (
          <ul className="grid gap-2 opacity-80">
            {recent.map((event) => (
              <li key={event.id} className="grid gap-0.5 rounded-2xl bg-s2 p-3.5">
                <span className="text-[13.5px] font-semibold text-ink">{event.type.replace(/_/g, ' ')}</span>
                <span className="break-words text-[12.5px] text-ink3">{event.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export default function InstanceDetail() {
  const { id, tab: tabParam } = useParams();
  const { navigate } = useRouter();
  const { push } = useToast();
  // The section is part of the address, so a link opens it, Back returns to the one before, and the page is not loaded again.
  const tab: Tab = TABS.some((entry) => entry.value === tabParam) ? (tabParam as Tab) : 'overview';
  const setTab = (next: Tab) => navigate(next === 'overview' ? `/app/instances/${id}` : `/app/instances/${id}/${next}`, { scroll: false });
  const tabsRef = useRef<HTMLDivElement>(null);
  useRevealOnChange(tabsRef, [tab], 120);
  const [powerCooldown, setPowerCooldown] = useState(0);
  const [showMore, setShowMore] = useState(false);
  useEffect(() => {
    if (powerCooldown <= 0) return;
    const timer = window.setTimeout(() => setPowerCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [powerCooldown]);

  const { data, loading, error, reload, setData } = useAsync(
    (signal) => get<{ instance: Instance }>(`/instances/${id}`, undefined, signal),
    [id],
  );
  const visibleTabs = TABS.filter((entry) => {
    const access = data?.instance.access ?? 'owner';
    // Deploy from Git is for the runtimes where the customer brings the code.
    if (entry.value === 'minecraft' && !MINECRAFT_SLUGS.includes(data?.instance.product.slug ?? '')) return false;
    if (entry.value === 'git' && !['nodejs', 'discord-bot'].includes(data?.instance.product.slug ?? '')) return false;
    if (access === 'owner') return true;
    if (OWNER_ONLY.includes(entry.value)) return false;
    return access === 'manager' || !VIEWER_HIDDEN.includes(entry.value);
  });

  const instance = data?.instance;
  const provisioning = instance?.status === 'pending' || instance?.status === 'provisioning';
  // A cancelled service is closed: it cannot be started, changed or opened. Only what happened to it can be read.
  const closed = instance?.status === 'cancelled';

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

      <header className={`grid gap-2 border-b border-line py-3 lg:sticky lg:top-[69px] lg:z-10 lg:bg-bg/90 lg:backdrop-blur ${closed ? 'opacity-60 saturate-50' : ''}`}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-[min(100%,14rem)] flex-1 items-center gap-3">
            <ProductTile slug={instance.product.slug} icon={instance.product.icon} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-semibold tracking-[-0.03em] text-ink" title={instance.name}>{instance.name}</p>
              <p className="truncate text-[13px] text-ink3">{instance.product.name}</p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <StatusPill status={instance.status} />
            {!closed && instance.url && (
              <a
                href={instance.url}
                target="_blank"
                rel="noreferrer noopener"
                data-tip={instance.url}
                aria-label={`Open ${instance.url}`}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 text-[13.5px] font-medium text-ink transition-colors hover:border-acc/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                Open
                <Icon name="arrowUR" size={14} className="shrink-0" />
              </a>
            )}
            {instance.access !== 'viewer' && !closed && (
              <ButtonGroup label="Power" className="w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
                <SoftButton onClick={() => onPower('start')} disabled={!canStart || power.pending || powerCooldown > 0} title={canStart ? 'Start the instance' : 'Already running'}>Start</SoftButton>
                <SoftButton onClick={() => onPower('restart')} disabled={!canRestart || power.pending || powerCooldown > 0} title="Restart the instance">
                  {powerCooldown > 0 ? `Restart (${powerCooldown}s)` : 'Restart'}
                </SoftButton>
                <SoftButton onClick={() => onPower('stop')} disabled={!canStop || power.pending || powerCooldown > 0} title={canStop ? 'Stop the instance' : 'Not running'}>Stop</SoftButton>
              </ButtonGroup>
            )}
          </div>
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

      {closed ? (
        <ClosedService instance={instance} />
      ) : (
      <>
      <div ref={tabsRef} className="grid scroll-mt-28 gap-2">
        {/* The everyday sections are always in view; the others are one tap away. */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Segmented options={visibleTabs.filter((entry) => primaryTabsFor(instance.product.slug).includes(entry.value))} value={tab} onChange={setTab} ariaLabel="Instance sections" />
          </div>
          {visibleTabs.some((entry) => !primaryTabsFor(instance.product.slug).includes(entry.value)) && (
            <SoftButton onClick={() => setShowMore((open) => !open)} aria-expanded={showMore || !primaryTabsFor(instance.product.slug).includes(tab)} className="shrink-0">
              {showMore || !primaryTabsFor(instance.product.slug).includes(tab) ? 'Less' : 'More'}
            </SoftButton>
          )}
        </div>
        {(showMore || !primaryTabsFor(instance.product.slug).includes(tab)) && (
          <Segmented options={visibleTabs.filter((entry) => !primaryTabsFor(instance.product.slug).includes(entry.value))} value={tab} onChange={setTab} ariaLabel="More instance sections" />
        )}
      </div>

      <section role="tabpanel" aria-label={TABS.find((entry) => entry.value === tab)?.label ?? 'Instance section'}>
        {provisioning ? (
          <Panel title="Your service is being prepared" description="The panel will open automatically when provisioning finishes.">
            <LoadingBlock rows={2} label="Provisioning the instance" />
          </Panel>
        ) : (
        <Suspense fallback={<LoadingBlock rows={4} label="Loading section" />}>
          {tab === 'overview' && <OverviewTab instance={instance} onGoTo={setTab} />}
          {tab === 'overview' && instance.access !== 'viewer' && <div className="mt-4"><HelpPanel instance={instance} onGoTo={setTab} productSlug={instance.product.slug} /></div>}
          {tab === 'console' && <ConsoleTab instance={instance} />}
          {tab === 'files' && <FilesTab instance={instance} />}
          {tab === 'databases' && <DatabasesTab instance={instance} />}
          {tab === 'backups' && <BackupsTab instance={instance} />}
          {tab === 'network' && <NetworkTab instance={instance} />}
          {tab === 'startup' && <StartupTab instance={instance} />}
          {tab === 'schedules' && <SchedulesTab instance={instance} />}
          {tab === 'settings' && <SettingsTab instance={instance} onGoTo={setTab} />}
          {tab === 'settings' && (instance.access ?? 'owner') === 'owner' && <div className="mt-4"><SftpPanel instance={instance} /></div>}
          {tab === 'activity' && <ActivityTab instance={instance} />}
          {tab === 'resources' && <ResourcesTab instance={instance} />}
          {tab === 'domains' && <DomainsTab instance={instance} />}
          {tab === 'uptime' && <UptimeTab instance={instance} />}
          {tab === 'uptime' && (instance.access ?? 'owner') === 'owner' && <div className="mt-4"><AlertsPanel instance={instance} /></div>}
          {tab === 'git' && <GitTab instance={instance} />}
          {tab === 'minecraft' && <MinecraftTab instance={instance} />}
          {tab === 'access' && <AccessTab instance={instance} />}
        </Suspense>
        )}
      </section>
      </>
      )}

      {tab === 'settings' && (
        <SettingsPanel
          instance={instance}
          onUpdated={(next) => setData({ instance: next })}
          onCancelled={reload}
        />
      )}
    </div>
  );
}
