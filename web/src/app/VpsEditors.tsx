import { useMemo, useState, type ReactNode } from 'react';
import { get, patch, post, put, type VpsServerView } from '../lib/api';
import { memLabel } from '../lib/pricing';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ErrorState, LoadingBlock, PrimaryButton, Select, SoftButton, TextArea, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from './components/premium';

/** Where a VPS editor returns: the server, on the tab it was opened from. */
const backFor = (id: string, tab: 'settings' | 'snapshots' | 'boot') => `/app/vps/${encodeURIComponent(id)}?tab=${tab}`;

function useServer(id: string) {
  const state = useAsync<{ server: VpsServerView }>((signal) => get<{ server: VpsServerView }>(`/vps/${encodeURIComponent(id)}`, undefined, signal), [id]);
  return { state, server: state.data?.server ?? null };
}

function ServerAside({ server, children }: { server: VpsServerView; children?: ReactNode }) {
  return (
    <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
      <h2 className="break-words text-[16px] font-semibold text-ink">{server.name}</h2>
      <p className="mt-1 font-mono text-[12.5px] text-ink3">
        {server.plan.name} · {server.cpu} vCPU · {memLabel(server.ram)} · {server.disk} GB
      </p>
      {server.image && <p className="mt-1 text-[12.5px] text-ink3">{server.image.label}</p>}
      {children}
    </aside>
  );
}

function Loading({ state }: { state: { loading: boolean; error: Error | null; reload: () => void } }) {
  if (state.loading) return <LoadingBlock rows={3} label="Loading the server" />;
  if (state.error) return <ErrorState title="The server could not be loaded" message={state.error.message} onRetry={state.reload} />;
  return <ErrorState title="Server not found" message="It does not exist or it does not belong to this account." />;
}

const alertClass = 'rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad';

/** The name of a server. It is also its hostname. */
export function RenameVps() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const { state, server } = useServer(id);
  const [draft, setDraft] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const name = draft ?? server?.name ?? '';
  const dirty = server !== null && draft !== null && draft.trim() !== server.name;
  const backTo = backFor(id, 'settings');
  useUnsavedChangesGuard(dirty, 'Discard the new name?');
  const save = useAction(async () => {
    await patch(`/vps/${encodeURIComponent(id)}`, { name: name.trim() });
    return true;
  });
  const error = touched && name.trim() === '' ? 'Enter a name.' : undefined;
  const submit = async () => {
    setTouched(true);
    if (!server || name.trim() === '' || !dirty) return;
    if (!(await save.run())) return;
    toast.push('The name was saved.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the new name?')) navigate(backTo);
  };
  return (
    <PageEditorShell
      eyebrow="Server"
      title="Rename server"
      description="The name is also the hostname of the server."
      backTo={backTo}
      backLabel="Back to the server"
      dirty={dirty}
      aside={server ? <ServerAside server={server} /> : undefined}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={save.pending || !dirty}>{save.pending ? 'Saving…' : 'Save name'}</PrimaryButton>
        </>
      }
    >
      {!server ? (
        <Loading state={state} />
      ) : (
        <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-4">
          <TextInput label="Name" value={name} onChange={(event) => setDraft(event.target.value)} autoComplete="off" spellCheck={false} error={error ?? save.fieldErrors.name} />
          {save.error && !save.fieldErrors.name && <p role="alert" className={alertClass}>{save.error}</p>}
        </form>
      )}
    </PageEditorShell>
  );
}

/** The key that opens the server. The server restarts once to read it; its data is not touched. */
export function ChangeVpsKey() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const { state, server } = useServer(id);
  const [key, setKey] = useState('');
  const [touched, setTouched] = useState(false);
  const dirty = key.trim() !== '';
  const backTo = backFor(id, 'settings');
  useUnsavedChangesGuard(dirty, 'Discard the new key?');
  const save = useAction(async () => {
    await put(`/vps/${encodeURIComponent(id)}/ssh-key`, { sshPublicKey: key.trim() });
    return true;
  });
  const submit = async () => {
    setTouched(true);
    if (!server || !dirty) return;
    if (!(await save.run())) return;
    toast.push('The key was changed. The server restarts to read it.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the new key?')) navigate(backTo);
  };
  return (
    <PageEditorShell
      eyebrow="Server"
      title="Change SSH key"
      description="Replaces the key that opens the server."
      backTo={backTo}
      backLabel="Back to the server"
      dirty={dirty}
      aside={
        server ? (
          <ServerAside server={server}>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink3">The server restarts once to read the new key. Its data is not touched, and the old key stops working.</p>
          </ServerAside>
        ) : undefined
      }
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={save.pending || !dirty}>{save.pending ? 'Changing…' : 'Change the key'}</PrimaryButton>
        </>
      }
    >
      {!server ? (
        <Loading state={state} />
      ) : (
        <div className="grid gap-4">
          <TextArea
            label="SSH public key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            error={save.error ?? (touched && !dirty ? 'Paste a public key.' : undefined)}
            hint="Starts with ssh-ed25519, ssh-rsa or ecdsa-sha2. Never paste a private key."
            rows={4}
            placeholder="ssh-ed25519 AAAA…"
            spellCheck={false}
          />
        </div>
      )}
    </PageEditorShell>
  );
}

interface IsoAnswer {
  isos: { file: string; size: number }[];
  mounted: string | null;
}
const isoName = (file: string) => file.replace(/\.iso$/i, '').replace(/[-_]x86_64|[-_]amd64/g, '').replace(/[-_]/g, ' ');

/** Mounts an installation image. The server boots from it at its next restart. */
export function MountVpsIso() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const { state: serverState, server } = useServer(id);
  const isos = useAsync<IsoAnswer>((signal) => get<IsoAnswer>(`/vps/${encodeURIComponent(id)}/iso`, undefined, signal), [id]);
  const [file, setFile] = useState('');
  const [touched, setTouched] = useState(false);
  const dirty = file !== '';
  const backTo = backFor(id, 'boot');
  useUnsavedChangesGuard(dirty, 'Discard this choice?');
  const mount = useAction(async () => {
    await put(`/vps/${encodeURIComponent(id)}/iso`, { file });
    return true;
  });
  const submit = async () => {
    setTouched(true);
    if (!file) return;
    if (!(await mount.run())) return;
    toast.push('The image is mounted. Restart the server to boot from it.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this choice?')) navigate(backTo);
  };
  return (
    <PageEditorShell
      eyebrow="Server"
      title="Boot from an image"
      description="Mount an installation image, restart the server and install from it. The display is a graphical one while an image is mounted."
      backTo={backTo}
      backLabel="Back to the server"
      dirty={dirty}
      aside={server ? <ServerAside server={server} /> : undefined}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={mount.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={mount.pending || !file}>{mount.pending ? 'Mounting…' : 'Mount the image'}</PrimaryButton>
        </>
      }
    >
      {!server ? (
        <Loading state={serverState} />
      ) : isos.loading ? (
        <LoadingBlock rows={2} label="Reading the images" />
      ) : isos.error ? (
        <ErrorState title="The images could not be read" message={isos.error.message} onRetry={isos.reload} />
      ) : (isos.data?.isos.length ?? 0) === 0 ? (
        <ErrorState title="No installation image is offered" message="There is nothing to mount at the moment." />
      ) : (
        <div className="grid gap-4">
          {isos.data?.mounted && (
            <p role="status" className="rounded-2xl bg-acc-bg px-4 py-3 text-[13.5px] text-acc">
              <span className="font-mono">{isos.data.mounted}</span> is mounted now. Mounting another one replaces it.
            </p>
          )}
          <Select label="Image" value={file} onChange={(event) => setFile(event.target.value)} error={touched && !file ? 'Choose an image.' : undefined}>
            <option value="">Choose an image</option>
            {isos.data?.isos.map((iso) => (
              <option key={iso.file} value={iso.file}>{isoName(iso.file)} · {memLabel(Math.round(iso.size / 1024 / 1024))}</option>
            ))}
          </Select>
          {mount.error && <p role="alert" className={alertClass}>{mount.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}

/** Reinstalling deletes everything on the disk of the server. The review names the server and the system. */
export function ReinstallVps() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const { state, server } = useServer(id);
  const images = useAsync<{ images: { slug: string; label: string }[] }>((signal) => get<{ images: { slug: string; label: string }[] }>('/vps/images', undefined, signal), []);
  const [image, setImage] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [touched, setTouched] = useState(false);
  const dirty = Boolean(confirmation || acknowledged || key.trim());
  const backTo = backFor(id, 'boot');
  useUnsavedChangesGuard(dirty, 'Discard this reinstall?');
  const chosen = image ?? server?.image?.slug ?? 'debian-13';
  const matches = Boolean(server && confirmation === server.name);
  const reinstall = useAction(async () => {
    await post(`/vps/${encodeURIComponent(id)}/reinstall`, { confirm: true, image: chosen, ...(key.trim() ? { sshPublicKey: key.trim() } : {}) });
    return true;
  });
  const submit = async () => {
    setTouched(true);
    if (!server || !matches || !acknowledged) return;
    if (!(await reinstall.run())) return;
    toast.push('The server is being built again.', 'ok');
    navigate(`/app/vps/${encodeURIComponent(id)}`, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this reinstall?')) navigate(backTo);
  };
  return (
    <PageEditorShell
      eyebrow="Server"
      title="Reinstall server"
      description="Build the server again from a clean image of the system you choose."
      backTo={backTo}
      backLabel="Back to the server"
      dirty={dirty}
      aside={server ? <ServerAside server={server} /> : undefined}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={reinstall.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={reinstall.pending || !server || !matches || !acknowledged}>{reinstall.pending ? 'Starting…' : 'Reinstall the server'}</PrimaryButton>
        </>
      }
    >
      {!server ? (
        <Loading state={state} />
      ) : (
        <div className="grid gap-5">
          <div role="alert" className="rounded-2xl border border-bad/25 bg-bad/10 p-4">
            <h2 className="text-[14px] font-semibold text-bad">Everything on the disk of {server.name} is deleted</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">The address, the plan and the subscription stay as they are. Take a snapshot first if you may need the current state.</p>
          </div>
          <Select label="Operating system" value={chosen} onChange={(event) => setImage(event.target.value)}>
            {(images.data?.images ?? [{ slug: chosen, label: server.image?.label ?? 'Debian 13' }]).map((entry) => (
              <option key={entry.slug} value={entry.slug}>{entry.label}</option>
            ))}
          </Select>
          <TextArea label="New SSH public key (optional)" value={key} onChange={(event) => setKey(event.target.value)} hint="Leave it empty to keep the current key." rows={2} spellCheck={false} />
          <TextInput label={`Type “${server.name}” to confirm`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" error={touched && !matches ? `Type “${server.name}” exactly.` : undefined} />
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-[13.5px] text-ink2">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-5 accent-[var(--color-acc)]" />
            <span><strong className="block text-ink">I understand the disk is erased</strong>This cannot be undone.</span>
          </label>
          {touched && !acknowledged && <p role="alert" className="text-[13px] font-medium text-bad">Acknowledge the erasure before reinstalling.</p>}
          {reinstall.error && <p role="alert" className={alertClass}>{reinstall.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}

interface SnapshotsAnswer {
  max: number;
  snapshots: { name: string; description: string; createdAt: string | null }[];
}
const SNAPSHOT_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** A snapshot is a point of the disk to go back to. A server keeps a few of them. */
export function NewVpsSnapshot() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const { state, server } = useServer(id);
  const snapshots = useAsync<SnapshotsAnswer>((signal) => get<SnapshotsAnswer>(`/vps/${encodeURIComponent(id)}/snapshots`, undefined, signal), [id]);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const dirty = name.trim() !== '';
  const backTo = backFor(id, 'snapshots');
  useUnsavedChangesGuard(dirty, 'Discard this snapshot?');
  const full = snapshots.data ? snapshots.data.snapshots.length >= snapshots.data.max : false;
  const taken = useMemo(() => snapshots.data?.snapshots.some((entry) => entry.name === name.trim()) ?? false, [snapshots.data, name]);
  const nameError = !SNAPSHOT_NAME.test(name.trim()) ? 'Use lowercase letters, numbers and dashes, starting with a letter or a number.' : taken ? 'A snapshot with this name already exists.' : undefined;
  const create = useAction(async () => {
    await post(`/vps/${encodeURIComponent(id)}/snapshots`, { name: name.trim() });
    return true;
  });
  const submit = async () => {
    setTouched(true);
    if (!server || nameError || full) return;
    if (!(await create.run())) return;
    toast.push('The snapshot was taken.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this snapshot?')) navigate(backTo);
  };
  return (
    <PageEditorShell
      eyebrow="Server"
      title="Take a snapshot"
      description="A point of the disk you can go back to before a risky change."
      backTo={backTo}
      backLabel="Back to the server"
      dirty={dirty}
      aside={
        server ? (
          <ServerAside server={server}>
            {snapshots.data && <p className="mt-3 text-[12.5px] text-ink3">{snapshots.data.snapshots.length} of {snapshots.data.max} snapshots used.</p>}
          </ServerAside>
        ) : undefined
      }
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending || !dirty || full}>{create.pending ? 'Working…' : 'Take the snapshot'}</PrimaryButton>
        </>
      }
    >
      {!server ? (
        <Loading state={state} />
      ) : snapshots.loading ? (
        <LoadingBlock rows={2} label="Reading the snapshots" />
      ) : snapshots.error ? (
        <ErrorState title="The snapshots could not be read" message={snapshots.error.message} onRetry={snapshots.reload} />
      ) : full ? (
        <ErrorState title="This server keeps no more snapshots" message={`It already has ${snapshots.data?.max} snapshots. Delete one first.`} />
      ) : (
        <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-4">
          <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value.toLowerCase())} placeholder="before-upgrade" hint="Lowercase letters, numbers and dashes." autoComplete="off" spellCheck={false} error={touched ? nameError ?? create.fieldErrors.name : undefined} />
          {create.error && !create.fieldErrors.name && <p role="alert" className={alertClass}>{create.error}</p>}
        </form>
      )}
    </PageEditorShell>
  );
}

/** Restoring a snapshot replaces the disk as it is now. */
export function RestoreVpsSnapshot() {
  const { id = '', name: rawName = '' } = useParams();
  const snapshotName = decodeURIComponent(rawName);
  const { navigate } = useRouter();
  const toast = useToast();
  const { state, server } = useServer(id);
  const snapshots = useAsync<SnapshotsAnswer>((signal) => get<SnapshotsAnswer>(`/vps/${encodeURIComponent(id)}/snapshots`, undefined, signal), [id]);
  const snapshot = snapshots.data?.snapshots.find((entry) => entry.name === snapshotName);
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [touched, setTouched] = useState(false);
  const dirty = Boolean(confirmation || acknowledged);
  const backTo = backFor(id, 'snapshots');
  useUnsavedChangesGuard(dirty, 'Discard this restore?');
  const matches = Boolean(snapshot && confirmation === snapshot.name);
  const restore = useAction(async () => {
    await post(`/vps/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snapshotName)}/restore`);
    return true;
  });
  const submit = async () => {
    setTouched(true);
    if (!snapshot || !matches || !acknowledged) return;
    if (!(await restore.run())) return;
    toast.push('The snapshot was restored.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this restore?')) navigate(backTo);
  };
  return (
    <PageEditorShell
      eyebrow="Server"
      title="Restore snapshot"
      description="Review what is replaced and confirm."
      backTo={backTo}
      backLabel="Back to the server"
      dirty={dirty}
      aside={
        snapshot ? (
          <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
            <h2 className="break-all font-mono text-[15px] font-semibold text-ink">{snapshot.name}</h2>
            <p className="mt-2 text-[12.5px] text-ink3">{snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : ''}</p>
            {snapshot.description && <p className="mt-1 text-[12.5px] text-ink3">{snapshot.description}</p>}
          </aside>
        ) : undefined
      }
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={restore.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={restore.pending || !snapshot || !matches || !acknowledged}>{restore.pending ? 'Restoring…' : 'Restore the snapshot'}</PrimaryButton>
        </>
      }
    >
      {!server ? (
        <Loading state={state} />
      ) : snapshots.loading ? (
        <LoadingBlock rows={2} label="Reading the snapshots" />
      ) : snapshots.error ? (
        <ErrorState title="The snapshots could not be read" message={snapshots.error.message} onRetry={snapshots.reload} />
      ) : !snapshot ? (
        <ErrorState title="Snapshot not found" message="It was deleted or it never belonged to this server." />
      ) : (
        <div className="grid gap-5">
          <div role="alert" className="rounded-2xl border border-bad/25 bg-bad/10 p-4">
            <h2 className="text-[14px] font-semibold text-bad">The disk of {server.name} goes back to this snapshot</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">Everything written since the snapshot is lost. Take a new snapshot first if you may need the current state.</p>
          </div>
          <TextInput label={`Type “${snapshot.name}” to confirm`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" error={touched && !matches ? `Type “${snapshot.name}” exactly.` : undefined} />
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-[13.5px] text-ink2">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-5 accent-[var(--color-acc)]" />
            <span><strong className="block text-ink">I understand the current disk is replaced</strong>This cannot be undone.</span>
          </label>
          {touched && !acknowledged && <p role="alert" className="text-[13px] font-medium text-bad">Acknowledge the replacement before restoring.</p>}
          {restore.error && <p role="alert" className={alertClass}>{restore.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}
