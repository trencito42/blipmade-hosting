import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
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
import { Icon } from '../../icons';
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

// --- the tree --------------------------------------------------------------

function TreeNode({
  instanceId,
  path,
  name,
  depth,
  version,
  selectedPath,
  onSelect,
  onOpenFolder,
}: {
  instanceId: string;
  path: string;
  name: string;
  depth: number;
  version: number;
  selectedPath: string | null;
  onSelect: (selection: Selection) => void;
  onOpenFolder: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const isSelected = selectedPath === path;

  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded-2xl p-1 transition-colors duration-[180ms] ${
          isSelected ? 'bg-s3' : 'hover:bg-s2'
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`${open ? 'Close' : 'Open'} the folder ${name}`}
          className="grid size-11 shrink-0 place-items-center rounded-full text-ink3 transition-colors duration-[180ms] hover:bg-s3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          <Icon name={open ? 'close' : 'menu'} size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            onOpenFolder(path);
          }}
          className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          <span className="block truncate text-[14px] font-medium text-ink" title={name}>
            {name}
          </span>
          <span className="block truncate font-mono text-[11.5px] text-ink3" title={path}>
            {path}
          </span>
        </button>
      </div>

      {open && (
        <TreeChildren
          instanceId={instanceId}
          path={path}
          depth={depth}
          version={version}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onOpenFolder={onOpenFolder}
        />
      )}
    </li>
  );
}

function TreeChildren({
  instanceId,
  path,
  depth,
  version,
  selectedPath,
  onSelect,
  onOpenFolder,
}: {
  instanceId: string;
  path: string;
  depth: number;
  version: number;
  selectedPath: string | null;
  onSelect: (selection: Selection) => void;
  onOpenFolder: (path: string) => void;
}) {
  const listing = useAsync((signal) => listFiles(instanceId, path, signal), [instanceId, path, version]);
  const files = listing.data?.files ?? [];

  if (listing.loading) {
    return (
      <div className="px-3 py-1" style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}>
        <LoadingBlock rows={1} label="Loading the folder" />
      </div>
    );
  }

  if (listing.error) {
    return (
      <div className="px-3 py-1" style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}>
        <p className="break-words rounded-2xl bg-s2 px-3 py-2 text-[13px] text-ink2">
          {listing.error.message}
        </p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="px-3 py-1" style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}>
        <p className="text-[13px] text-ink3">This folder is empty.</p>
      </div>
    );
  }

  // Folders come first, then the files, both in the order of the panel.
  const sorted = [...files].sort((a, b) => {
    if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <ul className="grid gap-0.5">
      {sorted.map((file) => {
        const full = joinPath(path, file.name);
        if (file.is_directory) {
          return (
            <TreeNode
              key={full}
              instanceId={instanceId}
              path={full}
              name={file.name}
              depth={depth + 1}
              version={version}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onOpenFolder={onOpenFolder}
            />
          );
        }
        return (
          <li key={full}>
            <div
              className={`flex items-center gap-1 rounded-2xl p-1 transition-colors duration-[180ms] ${
                selectedPath === full ? 'bg-s3' : 'hover:bg-s2'
              }`}
              style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}
            >
              <span className="grid size-11 shrink-0 place-items-center text-ink3">
                <Icon name="doc" size={16} />
              </span>
              <button
                type="button"
                onClick={() => onSelect({ path: full, entry: file })}
                className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                <span className="block truncate text-[14px] font-medium text-ink" title={file.name}>
                  {file.name}
                </span>
                <span className="block truncate font-mono text-[11.5px] text-ink3" title={full}>
                  {fmtBytes(file.size)} · {fmtMode(file.mode)}
                </span>
              </button>
            </div>
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
    return decodeContent(file.data.content ?? '', file.data.encoding ?? '');
  }, [file.data]);

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
            <TextArea
              label="Content"
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setDirty(true);
              }}
              className="min-h-[240px] scroll-mt-16 font-mono"
              spellCheck={false}
            />
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

export default function FilesTab({ instance }: TabProps) {
  const { push } = useToast();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [folder, setFolder] = useState('/');
  const [version, setVersion] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const content = await file.arrayBuffer();
      await uploadFile(instance.id, folder, file.name, content);
      push(`${file.name} uploaded.`, 'ok');
      refresh();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The file could not be uploaded.', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Panel
        title="Folders"
        description={`Uploading goes to ${folder}.`}
        action={
          <SoftButton onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </SoftButton>
        }
      >
        <input
          ref={fileInput}
          type="file"
          onChange={(event) => void onUpload(event)}
          className="sr-only"
          aria-label="Upload a file to the instance"
        />

        <ul className="grid gap-0.5">
          <TreeNode
            instanceId={instance.id}
            path="/"
            name="root"
            depth={0}
            version={version}
            selectedPath={selected?.path ?? null}
            onSelect={setSelected}
            onOpenFolder={setFolder}
          />
        </ul>
      </Panel>

      {selected ? (
        <FilePanel
          key={selected.path}
          instanceId={instance.id}
          selection={selected}
          onChanged={refresh}
          onClosed={() => setSelected(null)}
        />
      ) : (
        <Panel title="No file open" description="Pick a file in the tree to read it, change it or download it.">
          <EmptyState
            title="Nothing is open."
            description="Open a file from the tree on the left to see its content and the actions you can run on it."
          />
        </Panel>
      )}
    </div>
  );
}
