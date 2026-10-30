import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { relativeTime } from '../../lib/api';
import {
  archiveFormatOf,
  baseName,
  ButtonRow,
  fmtBytes,
  fmtDateTime,
  fmtMode,
  joinPath,
  parentPath,
  parseMode,
  type TabProps,
} from './common';
import {
  archiveFiles,
  chmodFile,
  copyFile,
  deleteFile,
  downloadFile,
  listFiles,
  moveFile,
  readFile,
  renameFile,
  unarchiveFile,
  uploadFile,
  writeFile,
  type InstanceFile,
} from '../../lib/instance-api';
import { useAction, useAsync } from '../../lib/useAsync';
import { Icon, type IconName } from '../../icons';
import { LANGUAGE_LABEL, languageOf } from './editor-language';
import {
  ConfirmDialog,
  DangerButton,
  EmptyState,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  TextArea,
  TextInput,
  useToast,
} from '../../ui-app';

const CodeEditor = lazy(() => import('./CodeEditor'));

/**
 * Files.
 *
 * The tree on the left holds the folders of the instance, the panel on the
 * right holds the file that is open. Every action of the file manager is a
 * call to the API of Blipmade; the panel of the game is never opened.
 */

type ActionPanel = 'none' | 'rename' | 'move' | 'copy' | 'permissions';

interface Selection {
  path: string;
  entry: InstanceFile;
}

/** Files that are never text, whatever the node says about their encoding. */
const BINARY_EXTENSIONS = new Set(['zip', 'gz', 'tgz', 'tar', 'rar', '7z', 'bz2', 'xz', 'jar', 'war', 'class', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'pdf', 'exe', 'dll', 'so', 'bin', 'dat', 'db', 'sqlite', 'mca', 'nbt', 'woff', 'woff2', 'ttf', 'mp3', 'mp4', 'ogg', 'wav', 'webm', 'pak', 'vpk']);

/**
 * True when the content of a file is not text.
 *
 * The node may send the bytes of a binary file as base64 and call them text,
 * so the name of the file and the look of the content are read as well.
 */
function looksBinary(name: string, content: string): boolean {
  const extension = name.toLowerCase().split('.').pop() ?? '';
  if (BINARY_EXTENSIONS.has(extension)) return true;
  if (content.includes('\u0000')) return true;
  // A long run of base64 without a space or a line break is the bytes of a file.
  return content.length > 400 && /^[A-Za-z0-9+/=]+$/.test(content.slice(0, 400)) && !content.slice(0, 400).includes(' ');
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

/** Browser preview type for common image files. */
function imageMime(name: string): string | null {
  const extension = name.toLowerCase().split('.').pop();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' } as Record<string, string>)[extension ?? ''] ?? null;
}

/** Puts a downloaded file on the disk of the browser. */
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// --- the explorer ----------------------------------------------------------

/** The icon of a file, from its name. */
function iconOfFile(name: string): IconName {
  const extension = name.toLowerCase().split('.').pop() ?? '';
  if (['zip', 'gz', 'tgz', 'tar', 'rar', '7z', 'jar', 'bz2', 'xz'].includes(extension)) return 'fileZip';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico'].includes(extension)) return 'fileImage';
  if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'yml', 'yaml', 'py', 'sh', 'lua', 'php', 'java', 'go', 'rs', 'html', 'css', 'toml', 'xml', 'sql'].includes(extension)) return 'fileCode';
  if (extension === 'pdf') return 'filePdf';
  if (['txt', 'md', 'log', 'cfg', 'conf', 'ini', 'properties', 'env'].includes(extension)) return 'doc';
  return 'file';
}

/**
 * The files of one folder, as a list.
 *
 * A folder opens in place and a file opens in the panel next to the list. The
 * folders come first, then the files, and a row that goes one level up is on
 * top, so the reader never needs a tree to find the way back.
 */
function Explorer({
  instanceId,
  folder,
  version,
  selectedPath,
  onOpenFolder,
  onSelect,
}: {
  instanceId: string;
  folder: string;
  version: number;
  selectedPath: string | null;
  onOpenFolder: (path: string) => void;
  onSelect: (selection: Selection) => void;
}) {
  const listing = useAsync((signal) => listFiles(instanceId, folder, signal), [instanceId, folder, version]);
  const files = listing.data?.files ?? [];
  const sorted = [...files].sort((a, b) => {
    if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const parent = folder === '/' ? null : folder.split('/').slice(0, -1).join('/') || '/';

  if (listing.loading) return <LoadingBlock rows={4} label="Loading the folder" />;
  if (listing.error) {
    return (
      <p role="alert" className="break-words rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">
        {listing.error.message}
      </p>
    );
  }

  const row = 'flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc';

  return (
    <ul className="grid gap-0.5">
      {parent !== null && (
        <li>
          <button type="button" onClick={() => onOpenFolder(parent)} className={`${row} text-ink3 hover:bg-s2 hover:text-ink`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-s2">
              <Icon name="arrowUp" size={14} />
            </span>
            <span className="text-[14px] font-medium">Up one level</span>
          </button>
        </li>
      )}
      {sorted.length === 0 && <li className="px-3 py-6 text-center text-[14px] text-ink3">This folder is empty.</li>}
      {sorted.map((file) => {
        const full = joinPath(folder, file.name);
        const isFolder = file.is_directory;
        const active = selectedPath === full;
        return (
          <li key={full}>
            <button
              type="button"
              onClick={() => (isFolder ? onOpenFolder(full) : onSelect({ path: full, entry: file }))}
              aria-current={active ? 'true' : undefined}
              className={`${row} ${active ? 'bg-s3' : 'hover:bg-s2'}`}
            >
              <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${isFolder ? 'bg-acc-bg text-acc' : 'bg-s2 text-ink3'}`}>
                <Icon name={isFolder ? 'folder' : iconOfFile(file.name)} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium text-ink" title={file.name}>
                  {file.name}
                </span>
                <span className="block truncate font-mono text-[11.5px] text-ink3">
                  {isFolder ? 'Folder' : fmtBytes(file.size)} · {relativeTime(file.modified_at)}
                </span>
              </span>
              <span className="hidden shrink-0 font-mono text-[11.5px] text-ink3 sm:block">{fmtMode(file.mode)}</span>
              {isFolder && <Icon name="arrow" size={12} className="shrink-0 text-ink3" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// --- the file panel --------------------------------------------------------

function FilePanel({
  instanceId,
  selection,
  onChanged,
  onClosed,
}: {
  instanceId: string;
  selection: Selection;
  onChanged: () => void;
  onClosed: () => void;
}) {
  const { push } = useToast();
  const { path, entry } = selection;
  const imageType = imageMime(entry.name);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<ActionPanel>('none');
  const [value, setValue] = useState('');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const file = useAsync((signal) => imageType ? Promise.resolve({ content: '', encoding: 'binary' }) : readFile(instanceId, path, signal), [instanceId, path]);
  const decoded = useMemo(() => {
    if (!file.data) return { text: '', binary: false };
    if (looksBinary(entry.name, file.data.content ?? '')) return { text: '', binary: true };
    return decodeContent(file.data.content ?? '', file.data.encoding ?? '');
  }, [file.data, entry.name]);

  useEffect(() => {
    if (!imageType) { setPreviewUrl(null); return; }
    let active = true;
    let url: string | null = null;
    void downloadFile(instanceId, path).then(async (blob) => {
      let image = blob;
      // Earlier uploads accidentally stored the base64 text itself. Show those too.
      if (blob.size < 10_000_000) {
        const text = await blob.text();
        if (/^(iVBOR|\/9j\/|R0lGOD|UklGR)/.test(text.trim())) {
          try {
            const bytes = Uint8Array.from(atob(text.trim()), (char) => char.charCodeAt(0));
            image = new Blob([bytes], { type: imageType });
          } catch { /* Keep the original download. */ }
        }
      }
      if (!active) return;
      url = URL.createObjectURL(new Blob([image], { type: imageType }));
      setPreviewUrl(url);
    }).catch(() => { if (active) setPreviewUrl(null); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [instanceId, path, imageType]);

  useEffect(() => {
    setContent(decoded.text);
    setDirty(false);
  }, [decoded.text]);

  useEffect(() => {
    setMode('none');
    setValue('');
  }, [entry.name]);

  const save = useAction(async (next: string) => {
    await writeFile(instanceId, path, next);
    return true;
  });

  const rename = useAction(async (next: string) => {
    await renameFile(instanceId, path, next);
    return true;
  });

  const move = useAction(async (next: string) => {
    await moveFile(instanceId, path, next);
    return true;
  });

  const copy = useAction(async (next: string) => {
    await copyFile(instanceId, path, next);
    return true;
  });

  const chmod = useAction(async (next: number) => {
    await chmodFile(instanceId, path, next);
    return true;
  });

  const compress = useAction(async () => {
    await archiveFiles(instanceId, [path]);
    return true;
  });

  const decompress = useAction(async () => {
    await unarchiveFile(instanceId, path);
    return true;
  });

  const remove = useAction(async () => {
    await deleteFile(instanceId, path);
    return true;
  });

  const onSave = async () => {
    const done = await save.run(content);
    if (done) {
      setDirty(false);
      push('File saved.', 'ok');
      onChanged();
    }
  };

  const onDownload = async () => {
    try {
      const blob = await downloadFile(instanceId, path);
      saveBlob(blob, baseName(path));
      push('Download started.', 'ok');
    } catch (error) {
      push(error instanceof Error ? error.message : 'The file could not be downloaded.', 'error');
    }
  };

  const onRename = async () => {
    const name = value.trim();
    if (!name) return;
    // The name travels with its folder, so the API can move it inside the
    // same folder whatever it does with the path.
    const done = await rename.run(joinPath(parentPath(path), name));
    if (done) {
      push('File renamed.', 'ok');
      setMode('none');
      setValue('');
      onChanged();
    }
  };

  const onMove = async () => {
    const target = value.trim();
    if (!target) return;
    // The destination is the full path of the file in its new folder.
    const done = await move.run(joinPath(target, baseName(path)));
    if (done) {
      push('File moved.', 'ok');
      setMode('none');
      setValue('');
      onChanged();
    }
  };

  const onCopy = async () => {
    const target = value.trim();
    if (!target) return;
    const done = await copy.run(joinPath(target, baseName(path)));
    if (done) {
      push('File copied.', 'ok');
      setMode('none');
      setValue('');
      onChanged();
    }
  };

  const onChmod = async () => {
    const bits = parseMode(value);
    if (bits === null) return;
    const done = await chmod.run(bits);
    if (done) {
      push('Permissions changed.', 'ok');
      setMode('none');
      setValue('');
      onChanged();
    }
  };

  const onCompress = async () => {
    const done = await compress.run();
    if (done) {
      push('Archive created.', 'ok');
      onChanged();
    }
  };

  const onDecompress = async () => {
    const done = await decompress.run();
    if (done) {
      push('Archive extracted.', 'ok');
      onChanged();
    }
  };

  const onDelete = async () => {
    const done = await remove.run();
    setConfirmDelete(false);
    if (done) {
      push('File deleted.', 'ok');
      onClosed();
    }
  };

  const isArchive = archiveFormatOf(entry.name) !== null;
  const actionError = save.error ?? rename.error ?? move.error ?? copy.error ?? chmod.error ?? compress.error ?? decompress.error ?? remove.error;

  return (
    <Panel
      title={baseName(path)}
      description={path}
      action={
        <SoftButton onClick={onClosed} disabled={dirty}>
          {dirty ? 'Close without saving' : 'Close'}
        </SoftButton>
      }
    >
      <div className="grid gap-3">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-0.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Size</dt>
            <dd className="font-mono text-[14px] text-ink">{fmtBytes(entry.size)}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Permissions</dt>
            <dd className="font-mono text-[14px] text-ink" title={fmtMode(entry.mode)}>
              {fmtMode(entry.mode)}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Modified</dt>
            <dd className="text-[14px] text-ink">{fmtDateTime(entry.modified_at)}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Type</dt>
            <dd className="break-words text-[14px] text-ink" title={entry.mime_type ?? imageType ?? 'File'}>
              {entry.mime_type ?? imageType ?? 'File'}
            </dd>
          </div>
        </dl>

        {file.loading ? (
          <LoadingBlock rows={2} label="Loading the file" />
        ) : file.error ? (
          <p role="alert" className="break-words rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-medium text-bad">
            {file.error.message}
          </p>
        ) : imageType ? (
          previewUrl ? <img src={previewUrl} alt={entry.name} className="max-h-[480px] max-w-full rounded-2xl border border-line object-contain" /> : <p className="text-[14px] text-ink3">Loading image preview…</p>
        ) : decoded.binary ? (
          <EmptyState
            title="This file is not text."
            description="Binary files cannot be edited here. Download the file to change it."
          />
        ) : (
          <div className="grid gap-2">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3 px-1 text-[12.5px] text-ink3">
                <span className="font-mono">{entry.name}</span>
                <span>{LANGUAGE_LABEL[languageOf(entry.name)]} · Ctrl S saves, Ctrl F finds</span>
              </div>
              <Suspense fallback={<LoadingBlock rows={3} label="Loading the editor" />}>
                <CodeEditor
                  label={`Content of ${entry.name}`}
                  value={content}
                  language={languageOf(entry.name)}
                  height="min(60dvh, 560px)"
                  onChange={(next) => {
                    setContent(next);
                    setDirty(true);
                  }}
                  onSave={() => void onSave()}
                />
              </Suspense>
            </div>
            <ButtonRow>
              <PrimaryButton onClick={() => void onSave()} disabled={save.pending || !dirty}>
                {save.pending ? 'Saving…' : 'Save file'}
              </PrimaryButton>
              {dirty && <span className="text-[13px] text-ink3">There are unsaved changes.</span>}
            </ButtonRow>
          </div>
        )}

        {actionError && (
          <p role="alert" className="break-words rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-medium text-bad">
            {actionError}
          </p>
        )}

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SoftButton onClick={() => void onDownload()} disabled={entry.is_directory}>
              Download
            </SoftButton>
            <SoftButton
              onClick={() => {
                setMode('rename');
                setValue(entry.name);
              }}
              disabled={entry.is_directory}
            >
              Rename
            </SoftButton>
            <SoftButton
              onClick={() => {
                setMode('move');
                setValue(parentPath(path));
              }}
              disabled={entry.is_directory}
            >
              Move
            </SoftButton>
            <SoftButton
              onClick={() => {
                setMode('copy');
                setValue(parentPath(path));
              }}
            >
              Copy
            </SoftButton>
            <SoftButton
              onClick={() => {
                setMode('permissions');
                setValue(fmtMode(entry.mode));
              }}
            >
              Permissions
            </SoftButton>
            <DangerButton onClick={() => setConfirmDelete(true)} disabled={remove.pending}>
              Delete
            </DangerButton>
          </div>

          {mode === 'rename' && (
            <div className="grid gap-2 rounded-2xl bg-s2 p-3">
              <TextInput
                label="New name"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="scroll-mt-16"
              />
              <ButtonRow>
                <PrimaryButton onClick={() => void onRename()} disabled={rename.pending || !value.trim()}>
                  {rename.pending ? 'Renaming…' : 'Rename file'}
                </PrimaryButton>
                <SoftButton onClick={() => setMode('none')} disabled={rename.pending}>
                  Cancel
                </SoftButton>
              </ButtonRow>
            </div>
          )}

          {(mode === 'move' || mode === 'copy') && (
            <div className="grid gap-2 rounded-2xl bg-s2 p-3">
              <TextInput
                label={mode === 'move' ? 'Destination folder' : 'Copy into folder'}
                hint="The full path of the folder on the instance, for example /home/container/logs."
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="scroll-mt-16 font-mono"
              />
              <ButtonRow>
                <PrimaryButton onClick={() => void (mode === 'move' ? onMove() : onCopy())} disabled={!value.trim()}>
                  {mode === 'move' ? 'Move file' : 'Copy file'}
                </PrimaryButton>
                <SoftButton onClick={() => setMode('none')}>Cancel</SoftButton>
              </ButtonRow>
            </div>
          )}

          {mode === 'permissions' && (
            <div className="grid gap-2 rounded-2xl bg-s2 p-3">
              <TextInput
                label="Permissions"
                hint="The three octal digits of the permissions, for example 644."
                value={value}
                onChange={(event) => setValue(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                className="scroll-mt-16 font-mono"
                error={value.trim() !== '' && parseMode(value) === null ? 'Use three digits between 0 and 7.' : undefined}
              />
              <ButtonRow>
                <PrimaryButton onClick={() => void onChmod()} disabled={chmod.pending || parseMode(value) === null}>
                  {chmod.pending ? 'Saving…' : 'Save permissions'}
                </PrimaryButton>
                <SoftButton onClick={() => setMode('none')} disabled={chmod.pending}>
                  Cancel
                </SoftButton>
              </ButtonRow>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <SoftButton onClick={() => void onCompress()} disabled={compress.pending}>
              {compress.pending ? 'Compressing…' : 'Compress'}
            </SoftButton>
            {isArchive && (
              <SoftButton onClick={() => void onDecompress()} disabled={decompress.pending}>
                {decompress.pending ? 'Extracting…' : 'Extract'}
              </SoftButton>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this file?"
        description={`${path} is removed from the instance. This cannot be undone.`}
        confirmLabel="Delete file"
        busy={remove.pending}
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </Panel>
  );
}

// --- the tab ---------------------------------------------------------------

/** The state of one file of the queue of uploads. */
interface Upload {
  id: number;
  name: string;
  folder: string;
  state: 'waiting' | 'uploading' | 'done' | 'error';
  message?: string;
}

/** The segments of a folder, each with the path that leads to it. */
function crumbsOf(folder: string): { label: string; path: string }[] {
  const parts = folder.split('/').filter(Boolean);
  return [{ label: 'root', path: '/' }, ...parts.map((label, index) => ({ label, path: `/${parts.slice(0, index + 1).join('/')}` }))];
}

export default function FilesTab({ instance }: TabProps) {
  const { push } = useToast();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [folder, setFolder] = useState('/');
  const [version, setVersion] = useState(0);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const busy = uploads.some((upload) => upload.state === 'waiting' || upload.state === 'uploading');

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  // The files go one after the other, so a node that is slow is not asked
  // for ten transfers at once.
  const send = async (files: File[]) => {
    if (!files.length) return;
    const target = folder;
    const items: Upload[] = files.map((file) => ({ id: (counter.current += 1), name: file.name, folder: target, state: 'waiting' }));
    setUploads((previous) => [...items, ...previous].slice(0, 12));
    const patch = (id: number, change: Partial<Upload>) => setUploads((previous) => previous.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)));
    let uploaded = 0;
    for (const [index, file] of files.entries()) {
      const item = items[index]!;
      patch(item.id, { state: 'uploading' });
      try {
        await uploadFile(instance.id, target, file.name, await file.arrayBuffer());
        patch(item.id, { state: 'done' });
        uploaded += 1;
      } catch (error) {
        patch(item.id, { state: 'error', message: error instanceof Error ? error.message : 'The file could not be uploaded.' });
      }
    }
    if (uploaded) {
      push(uploaded === 1 ? `${files.find((_, i) => items[i]!.state !== 'error')?.name ?? 'The file'} uploaded.` : `${uploaded} files uploaded.`, 'ok');
      refresh();
    }
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void send(files);
  };

  const createFile = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || /[/\\]/.test(name) || name === '.' || name === '..') {
      push('Use a name without slashes.', 'error');
      return;
    }
    try {
      await writeFile(instance.id, `${folder === '/' ? '' : folder}/${name}`, '');
      push(`${name} created.`, 'ok');
      setNewName('');
      setNaming(false);
      refresh();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The file could not be created.', 'error');
    }
  };

  return (
    <div
      className="grid gap-3"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void send(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-2 pl-4">
        <nav aria-label="Folder" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 font-mono text-[13.5px]">
          {crumbsOf(folder).map((crumb, index, all) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {index > 0 && <Icon name="chevronDown" size={9} className="-rotate-90 text-ink3" />}
              <button
                type="button"
                onClick={() => setFolder(crumb.path)}
                aria-current={index === all.length - 1 ? 'page' : undefined}
                className={`rounded-md px-1.5 py-1 transition-colors hover:bg-s2 focus-visible:outline-2 focus-visible:outline-acc ${index === all.length - 1 ? 'text-ink' : 'text-ink3'}`}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>
        <SoftButton onClick={() => setNaming((value) => !value)} aria-expanded={naming}>
          <Icon name="filePlus" size={14} />
          New file
        </SoftButton>
        <SoftButton onClick={() => fileInput.current?.click()} disabled={busy}>
          <Icon name="upload" size={14} />
          {busy ? 'Uploading…' : 'Upload'}
        </SoftButton>
        <input ref={fileInput} type="file" multiple onChange={onPick} className="sr-only" aria-label="Upload files to the instance" />
      </div>

      {naming && (
        <form onSubmit={(event) => void createFile(event)} className="flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-card p-3">
          <div className="min-w-[200px] flex-1">
            <TextInput label={`New file in ${folder}`} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="server.properties" autoComplete="off" spellCheck={false} className="font-mono" />
          </div>
          <PrimaryButton type="submit" disabled={!newName.trim()}>Create</PrimaryButton>
          <SoftButton onClick={() => { setNaming(false); setNewName(''); }}>Cancel</SoftButton>
        </form>
      )}

      {uploads.length > 0 && (
        <ul aria-label="Uploads" className="grid gap-1 rounded-2xl border border-line bg-card p-2">
          {uploads.map((upload) => (
            <li key={upload.id} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px]">
              <Icon name={upload.state === 'done' ? 'check' : upload.state === 'error' ? 'warn' : 'upload'} size={14} className={upload.state === 'done' ? 'text-acc' : upload.state === 'error' ? 'text-bad' : 'text-ink3'} />
              <span className="min-w-0 flex-1 truncate font-mono text-ink">{upload.name}</span>
              <span className={`shrink-0 text-[12.5px] ${upload.state === 'error' ? 'text-bad' : 'text-ink3'}`}>
                {upload.state === 'waiting' ? 'Waiting' : upload.state === 'uploading' ? 'Uploading' : upload.state === 'done' ? `Saved in ${upload.folder}` : upload.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className={`relative grid gap-3 ${selected ? 'xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]' : ''} ${dragging ? 'rounded-3xl outline-2 outline-dashed outline-acc outline-offset-4' : ''}`}>
        {dragging && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-3xl bg-bg/80 text-[17px] font-semibold text-ink">
            Drop the files to upload them to {folder}
          </div>
        )}
        <Panel title="Files" description={`Drop files here to upload them to ${folder}.`}>
          <Explorer
            instanceId={instance.id}
            folder={folder}
            version={version}
            selectedPath={selected?.path ?? null}
            onOpenFolder={(next) => {
              setFolder(next);
              setSelected(null);
            }}
            onSelect={setSelected}
          />
        </Panel>

        {selected && <FilePanel key={selected.path} instanceId={instance.id} selection={selected} onChanged={refresh} onClosed={() => setSelected(null)} />}
      </div>
    </div>
  );
}
