import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../icons';
import { del, get, post, put, type CatalogProduct, type Domain, type Instance } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
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

type Tab = 'overview' | 'console' | 'files' | 'resources' | 'startup' | 'domains' | 'events';
type PowerAction = 'start' | 'restart' | 'stop';

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

interface ConsoleCredentials {
  token: string;
  websocket: string;
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'console', label: 'Console' },
  { value: 'files', label: 'Files' },
  { value: 'resources', label: 'Resources' },
  { value: 'startup', label: 'Startup' },
  { value: 'domains', label: 'Domains' },
  { value: 'events', label: 'Events' },
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

function ProductIcon({ icon, size = 40 }: { icon: string; size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-[28%] bg-s3 text-acc">
      <Icon name={productIcon(icon)} size={Math.round(size * 0.5)} />
    </span>
  );
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

function maskToken(token: string | undefined): string {
  if (!token) return '—';
  if (token.length <= 10) return '••••••••';
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
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

function OverviewTab({ instance }: { instance: Instance }) {
  const metrics = useAsync(
    (signal) => get<{ metrics: InstanceMetrics | null }>(`/instances/${instance.id}/metrics`, undefined, signal),
    [instance.id],
  );
  const metric = metrics.data?.metrics ?? null;

  return (
    <div className="grid gap-3">
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="Purchased limits">
          <dl className="grid gap-2.5">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Memory</dt>
              <dd className="font-mono text-[15px] text-ink">{fmtRam(instance.ram)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">vCPU</dt>
              <dd className="font-mono text-[15px] text-ink">{instance.cpu}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Disk</dt>
              <dd className="font-mono text-[15px] text-ink">{instance.disk} GB</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Price">
          <p className="font-mono text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-ink">
            <Money amount={instance.price ?? 0} currency={instance.currency} period="month" />
          </p>
          <p className="mt-1 text-[12.5px] text-ink3">Billed monthly for the limits above.</p>
        </Panel>

        <Panel title="Uptime">
          {metrics.loading ? (
            <LoadingBlock rows={1} label="Loading metrics" />
          ) : metrics.error ? (
            <ErrorState title="Metrics unavailable" message={metrics.error.message} onRetry={metrics.reload} />
          ) : metric ? (
            <div className="grid gap-2.5">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Uptime</p>
                <p className="font-mono text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-ink">{fmtUptime(metric.uptimeMs)}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">State</p>
                <p className="text-[15px] text-ink">{metric.state}</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-1">
              <p className="font-mono text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-ink3">—</p>
              <p className="text-[12.5px] text-ink3">Not available yet</p>
            </div>
          )}
        </Panel>

        <Panel title="Details">
          <dl className="grid gap-2.5">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Node</dt>
              <dd className="text-[15px] text-ink">{instance.node?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Created</dt>
              <dd className="text-[15px] text-ink">{fmtDate(instance.createdAt)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Product</dt>
              <dd className="text-[15px] text-ink">{instance.product.name}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function ConsoleTab({ instance }: { instance: Instance }) {
  const credentials = useAsync(
    (signal) => get<ConsoleCredentials>(`/instances/${instance.id}/console`, undefined, signal),
    [instance.id],
  );
  const [showToken, setShowToken] = useState(false);

  if (credentials.loading) return <LoadingBlock rows={2} label="Loading console" />;

  if (credentials.error) {
    return (
      <ErrorState
        title="Console unavailable"
        message={`${credentials.error.message} The console is not configured for this instance.`}
        onRetry={credentials.reload}
      />
    );
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-2xl bg-con p-4 font-mono text-[13px] leading-relaxed text-con-ink">
        <p>No console output loaded.</p>
        <p className="mt-2 text-con-ink/70">
          The API returns console credentials for a live WebSocket session. This dashboard does not open one and the API
          exposes no console command endpoint, so no log lines or commands are shown here.
        </p>
      </div>

      <Panel title="Connection details">
        <dl className="grid gap-2.5">
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">WebSocket</dt>
            <dd className="truncate font-mono text-[13.5px] text-ink">{credentials.data?.websocket ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Token</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-ink">
                {showToken ? credentials.data?.token ?? '—' : maskToken(credentials.data?.token)}
              </span>
              <SoftButton onClick={() => setShowToken((value) => !value)} aria-label={showToken ? 'Hide console token' : 'Show console token'}>
                {showToken ? 'Hide' : 'Show'}
              </SoftButton>
            </dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}

function FilesTab({ instance }: { instance: Instance }) {
  const [path, setPath] = useState('');
  const [openPath, setOpenPath] = useState<string | null>(null);

  const listing = useAsync(
    (signal) => get<{ entries: FileEntry[] }>(`/instances/${instance.id}/files`, { path }, signal),
    [instance.id, path],
  );

  const entries = listing.data?.entries ?? [];
  const segments = path.split('/').filter(Boolean);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="File path" className="flex min-w-0 flex-wrap items-center gap-1 text-[13px]">
          <button
            type="button"
            onClick={() => setPath('')}
            aria-current={segments.length === 0 ? 'page' : undefined}
            className="rounded-lg px-1.5 py-1 font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-acc"
          >
            root
          </button>
          {segments.map((segment, index) => (
            <span key={`${segment}-${index}`} className="flex items-center gap-1">
              <span aria-hidden="true" className="text-ink3">
                /
              </span>
              <button
                type="button"
                onClick={() => setPath(segments.slice(0, index + 1).join('/'))}
                aria-current={index === segments.length - 1 ? 'page' : undefined}
                className="rounded-lg px-1.5 py-1 font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-acc"
              >
                {segment}
              </button>
            </span>
          ))}
        </nav>
        {path && (
          <SoftButton
            onClick={() => {
              const parent = segments.slice(0, -1).join('/');
              setPath(parent);
            }}
          >
            Up one level
          </SoftButton>
        )}
      </div>

      {openPath && <FileEditor instance={instance} path={openPath} onClose={() => setOpenPath(null)} />}

      {listing.loading ? (
        <LoadingBlock rows={3} label="Loading files" />
      ) : listing.error ? (
        <ErrorState title="We could not list the files" message={listing.error.message} onRetry={listing.reload} />
      ) : entries.length === 0 ? (
        <EmptyState title="This folder is empty." description="Nothing is stored here yet." />
      ) : (
        <div className="grid gap-1.5">
          {entries.map((entry) => (
            <div key={entry.name} className="flex items-center gap-3 rounded-2xl bg-s2 p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-s3 text-acc">
                <Icon name={entry.isDirectory ? 'folder' : 'doc'} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink">{entry.name}</p>
                <p className="truncate text-[12.5px] text-ink3">
                  {entry.isDirectory ? 'Directory' : fmtBytes(entry.size)} · {fmtDateTime(entry.modifiedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const target = joinPath(path, entry.name);
                  if (entry.isDirectory) setPath(target);
                  else setOpenPath(target);
                }}
                className="h-11 shrink-0 rounded-full bg-s3 px-4 text-[13.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:ring-2 focus-visible:ring-acc"
              >
                {entry.isDirectory ? 'Open' : 'Edit'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FileEditor({ instance, path, onClose }: { instance: Instance; path: string; onClose: () => void }) {
  const { push } = useToast();
  const file = useAsync(
    (signal) => get<{ content: string; encoding: string }>(`/instances/${instance.id}/file`, { path }, signal),
    [instance.id, path],
  );
  const [content, setContent] = useState('');
  const [binary, setBinary] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!file.data) return;
    const decoded = decodeContent(file.data.content ?? '', file.data.encoding ?? '');
    setContent(decoded.text);
    setBinary(decoded.binary);
  }, [file.data]);

  const save = useAction(async (next: string) => {
    await put<void>(`/instances/${instance.id}/file`, { path, content: next });
    return true;
  });

  const remove = useAction(async () => {
    await del<void>(`/instances/${instance.id}/file`, { path });
    return true;
  });

  const onSave = async () => {
    const done = await save.run(content);
    if (done) push('File saved.', 'ok');
  };

  const onDelete = async () => {
    const done = await remove.run();
    setConfirmOpen(false);
    if (done) {
      push('File deleted.', 'ok');
      onClose();
    }
  };

  return (
    <Panel title={`Edit ${path.split('/').pop() ?? path}`} action={<SoftButton onClick={onClose}>Close</SoftButton>}>
      {file.loading ? (
        <LoadingBlock rows={2} label="Loading file" />
      ) : file.error ? (
        <ErrorState title="We could not open the file" message={file.error.message} onRetry={file.reload} />
      ) : binary ? (
        <EmptyState
          title="This file is not text."
          description="Binary files cannot be edited here. Download it with the API if you need to change it."
        />
      ) : (
        <div className="grid gap-3">
          <TextArea
            label="File content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-[280px] font-mono"
            spellCheck={false}
          />
          {save.error && (
            <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-bold text-bad">
              {save.error}
            </p>
          )}
          {remove.error && (
            <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-bold text-bad">
              {remove.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={onSave} disabled={save.pending}>
              {save.pending ? 'Saving…' : 'Save file'}
            </PrimaryButton>
            <DangerButton onClick={() => setConfirmOpen(true)} disabled={remove.pending}>
              Delete file
            </DangerButton>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this file?"
        description={`${path} is deleted from the instance. This cannot be undone.`}
        confirmLabel="Delete file"
        busy={remove.pending}
        onConfirm={onDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </Panel>
  );
}

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
    'grid size-11 shrink-0 place-items-center rounded-full bg-s3 text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:ring-2 focus-visible:ring-acc disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="grid gap-2 rounded-2xl bg-s2 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-bold text-ink">{label}</p>
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

  const bounds = product.data?.product;
  const ready = Boolean(bounds);
  const minRam = bounds?.minRam ?? instance.ram;
  const maxRam = bounds?.maxRam ?? instance.ram;
  const minCpu = bounds?.minCpu ?? instance.cpu;
  const maxCpu = bounds?.maxCpu ?? instance.cpu;
  const minDisk = bounds?.minDisk ?? instance.disk;
  const maxDisk = bounds?.maxDisk ?? instance.disk;

  const save = useAction(async () => {
    const res = await put<{ instance: Instance; priceDelta: number }>(`/instances/${instance.id}/resources`, {
      ram,
      cpu,
      disk,
    });
    if (res?.instance) onUpdated(res.instance);
    return res;
  });

  const onSave = async () => {
    const res = await save.run();
    if (res) {
      setDelta(res.priceDelta ?? 0);
      push('Resources updated.', 'ok');
    }
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
        {delta !== null && (
          <p className="mt-1 text-[13.5px] text-ink2" aria-live="polite">
            Price change: <Money amount={delta} currency={instance.currency} period="month" />
          </p>
        )}
        {save.error && (
          <p role="alert" className="mt-2 rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-bold text-bad">
            {save.error}
          </p>
        )}
        <div className="mt-3">
          <PrimaryButton onClick={onSave} disabled={!ready || save.pending}>
            {save.pending ? 'Saving…' : 'Save resources'}
          </PrimaryButton>
        </div>
      </Panel>
    </div>
  );
}

function StartupTab({ instance, onUpdated }: { instance: Instance; onUpdated: (next: Instance) => void }) {
  const { push } = useToast();
  const current = instance as Instance & { startup?: string | null; environment?: Record<string, string> | null };

  const [startup, setStartup] = useState(current.startup ?? '');
  const [vars, setVars] = useState<{ key: string; value: string }[]>(() =>
    Object.entries(current.environment ?? {}).map(([key, value]) => ({ key, value })),
  );
  const [showSecrets, setShowSecrets] = useState(false);
  const [revealed, setRevealed] = useState<{ key: string; value: string }[] | null>(null);

  const save = useAction(async () => {
    const environment: Record<string, string> = {};
    for (const row of vars) {
      const key = row.key.trim();
      if (key) environment[key] = row.value;
    }
    const res = await put<{ instance: Instance }>(`/instances/${instance.id}/startup`, { startup, environment });
    if (res?.instance) onUpdated(res.instance);
    return res;
  });

  const onSave = async () => {
    const res = await save.run();
    if (res) {
      setShowSecrets(true);
      setRevealed(vars.filter((row) => row.key.trim() && isSecretKey(row.key)).map((row) => ({ key: row.key, value: row.value })));
      push('Startup configuration saved.', 'ok');
    }
  };

  return (
    <div className="grid gap-3">
      <Panel title="Startup command" description="The command the platform runs when the instance starts.">
        <div className="grid gap-3">
          <TextInput
            label="Command"
            value={startup}
            onChange={(event) => setStartup(event.target.value)}
            placeholder="npm run start"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          {save.error && (
            <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-bold text-bad">
              {save.error}
            </p>
          )}
          <div>
            <PrimaryButton onClick={onSave} disabled={save.pending}>
              {save.pending ? 'Saving…' : 'Save startup'}
            </PrimaryButton>
          </div>
        </div>
      </Panel>

      <Panel
        title="Environment variables"
        description="Values that look like secrets are masked until you save."
        action={
          <SoftButton
            onClick={() => setVars((rows) => [...rows, { key: '', value: '' }])}
            aria-label="Add environment variable"
          >
            Add variable
          </SoftButton>
        }
      >
        <div className="grid gap-2.5">
          {vars.length === 0 && (
            <p className="text-[14px] text-ink3">No environment variables. Add one if your app needs it.</p>
          )}
          {vars.map((row, index) => {
            const secret = isSecretKey(row.key);
            return (
              <div key={index} className="grid gap-2 rounded-2xl bg-s2 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <TextInput
                    label="Name"
                    value={row.key}
                    onChange={(event) =>
                      setVars((rows) => rows.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)))
                    }
                    placeholder="NODE_ENV"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div className="relative">
                    <TextInput
                      label="Value"
                      type={secret && !showSecrets ? 'password' : 'text'}
                      value={row.value}
                      onChange={(event) =>
                        setVars((rows) => rows.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))
                      }
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {secret && (
                    <SoftButton onClick={() => setShowSecrets((value) => !value)} aria-label={showSecrets ? 'Hide secret values' : 'Show secret values'}>
                      {showSecrets ? 'Hide values' : 'Show values'}
                    </SoftButton>
                  )}
                  <SoftButton
                    onClick={() => setVars((rows) => rows.filter((_, i) => i !== index))}
                    aria-label={`Remove ${row.key || 'environment variable'}`}
                  >
                    Remove
                  </SoftButton>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {revealed && revealed.length > 0 && (
        <Panel title="Saved secret values" description="Shown once after saving. Hide them again when you are done.">
          <div className="grid gap-2">
            {revealed.map((row) => (
              <div key={row.key} className="grid gap-1">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">{row.key}</p>
                <p className="truncate font-mono text-[13.5px] text-ink">{row.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <SoftButton onClick={() => setRevealed(null)}>Hide values</SoftButton>
          </div>
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
              className="inline-flex h-11 items-center justify-center rounded-full bg-acc px-5 text-[14.5px] font-bold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
                        className="font-bold text-acc underline underline-offset-2 hover:text-acc-h focus-visible:ring-2 focus-visible:ring-acc"
                      >
                        Open site
                      </a>
                    </>
                  )}
                </p>

                {domain.lastError && (
                  <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[13.5px] font-bold text-bad">
                    {domain.lastError}
                  </p>
                )}

                {domain.dnsRecords.length > 0 ? (
                  <div className="grid gap-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">DNS records</p>
                    {domain.dnsRecords.map((record) => (
                      <div key={`${record.name}-${record.type}`} className="flex flex-wrap items-center gap-2 rounded-2xl bg-s2 p-3">
                        <span className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink3">{record.type}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{record.name}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink2">{record.value}</span>
                        <SoftButton onClick={() => copy(record.value, 'DNS record')} aria-label={`Copy ${record.type} record for ${record.name}`}>
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
            className="text-[14px] font-bold text-acc underline underline-offset-2 transition-colors duration-[180ms] hover:text-acc-h focus-visible:ring-2 focus-visible:ring-acc"
          >
            Manage all domains
          </Link>
        </div>
      )}
    </div>
  );
}

function EventsTab({ instance }: { instance: Instance }) {
  const events = useAsync(
    (signal) => get<{ events: InstanceEvent[] }>(`/instances/${instance.id}/events`, undefined, signal),
    [instance.id],
  );
  const list = events.data?.events ?? [];

  if (events.loading) return <LoadingBlock rows={3} label="Loading events" />;

  if (events.error) {
    return <ErrorState title="We could not load the events" message={events.error.message} onRetry={events.reload} />;
  }

  if (list.length === 0) {
    return <EmptyState title="No events yet." description="Provisioning, power and billing events are recorded here." />;
  }

  return (
    <div className="grid gap-1.5">
      {list.map((event) => (
        <ListRow
          key={event.id}
          title={event.type}
          meta={event.message}
          right={<span className="font-mono text-[12px] text-ink3">{fmtDateTime(event.createdAt)}</span>}
        />
      ))}
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
        <TextInput label="Instance name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
        {rename.error && (
          <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-bold text-bad">
            {rename.error}
          </p>
        )}
        <div>
          <PrimaryButton onClick={onRename} disabled={rename.pending || !name.trim()}>
            {rename.pending ? 'Saving…' : 'Save name'}
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <h3 className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">Cancel instance</h3>
        <p className="text-[13.5px] text-ink2">
          The instance keeps running until the end of the paid period, then it is removed.
        </p>
        {cancel.error && (
          <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-bold text-bad">
            {cancel.error}
          </p>
        )}
        <div>
          <DangerButton onClick={() => setConfirmOpen(true)} disabled={cancel.pending}>
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

  const { data, loading, error, reload, setData } = useAsync(
    (signal) => get<{ instance: Instance }>(`/instances/${id}`, undefined, signal),
    [id],
  );

  const instance = data?.instance;

  const power = useAction(async (action: PowerAction) => {
    const res = await post<{ instance: Instance }>(`/instances/${id}/power`, { action });
    if (res?.instance) setData({ instance: res.instance });
    return true;
  });

  const onPower = async (action: PowerAction) => {
    const done = await power.run(action);
    if (done) push(`${POWER_LABEL[action]} requested.`, 'ok');
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
        <Link to="/app/instances" className="px-1 text-[14px] font-bold text-acc hover:underline">
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
        <Link to="/app/instances" className="font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-acc">
          Instances
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="truncate font-bold text-ink">
          {instance.name}
        </span>
      </nav>

      <header className="grid gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <ProductIcon icon={instance.product.icon} size={46} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-extrabold tracking-[-0.035em] text-ink">{instance.name}</h2>
            <p className="truncate text-[13px] text-ink3">{instance.product.name}</p>
          </div>
          <StatusPill status={instance.status} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {instance.url ? (
            <a
              href={instance.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-s3 px-4 text-[13.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:ring-2 focus-visible:ring-acc"
            >
              {instance.url}
              <Icon name="arrowUR" size={15} />
            </a>
          ) : (
            <span className="text-[13.5px] text-ink3">No public URL yet</span>
          )}

          <SoftButton onClick={() => onPower('start')} disabled={!canStart || power.pending}>
            Start
          </SoftButton>
          <SoftButton onClick={() => onPower('restart')} disabled={!canRestart || power.pending}>
            Restart
          </SoftButton>
          <SoftButton onClick={() => onPower('stop')} disabled={!canStop || power.pending}>
            Stop
          </SoftButton>
        </div>

        {power.error && (
          <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-bold text-bad">
            {power.error}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {power.pending ? 'Working' : ''}
        </p>
      </header>

      <Segmented options={TABS} value={tab} onChange={setTab} ariaLabel="Instance sections" />

      <section role="tabpanel" aria-label={TABS.find((entry) => entry.value === tab)?.label ?? 'Instance section'}>
        {tab === 'overview' && <OverviewTab instance={instance} />}
        {tab === 'console' && <ConsoleTab instance={instance} />}
        {tab === 'files' && <FilesTab instance={instance} />}
        {tab === 'resources' && <ResourcesTab instance={instance} onUpdated={(next) => setData({ instance: next })} />}
        {tab === 'startup' && <StartupTab instance={instance} onUpdated={(next) => setData({ instance: next })} />}
        {tab === 'domains' && <DomainsTab instance={instance} />}
        {tab === 'events' && <EventsTab instance={instance} />}
      </section>

      <SettingsPanel
        instance={instance}
        onUpdated={(next) => setData({ instance: next })}
        onCancelled={reload}
      />
    </div>
  );
}
