import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { relativeTime } from '../../lib/api';
import { baseName, fmtBytes, fmtMode, joinPath, parentPath, parseMode, archiveFormatOf, type TabProps } from './common';
import {
  archiveFiles,
  chmodFile,
  copyFile,
  createFolder,
  deleteFile,
  downloadFile,
  listFiles,
  moveFile,
  renameFile,
  unarchiveFile,
  uploadFile,
  writeFile,
  type InstanceFile,
} from '../../lib/instance-api';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../icons';
import { ConfirmDialog, LoadingBlock, SoftButton, useToast } from '../../ui-app';
import ContextMenu, { type MenuItem } from './files/ContextMenu';
import FileViewer from './files/FileViewer';
import PromptDialog from './files/PromptDialog';
import { iconOfFile, isInside, saveBlob, uniqueName } from './files/file-utils';

/**
 * Files.
 *
 * The explorer on the left holds the folders and the files of the instance. A
 * double click opens a folder, or opens a file in a tab on the right, and a
 * right click opens the menu of the file. Files are copied, cut and pasted,
 * and they are moved by dragging them onto a folder. Files from the computer
 * are uploaded by dropping them on the explorer. Every action is a call to the
 * API of Blipmade; the panel of the game is never opened.
 */

/** The type that marks a drag of files of the explorer, as against a drag of files from the computer. */
const INTERNAL_DRAG = 'application/x-blipmade-paths';

/** Tabs that may be open at once. */
const MAX_TABS = 12;

interface Tab {
  path: string;
  entry: InstanceFile;
}

interface Clipboard {
  mode: 'copy' | 'cut';
  paths: string[];
}

type PromptKind = 'rename' | 'newFile' | 'newFolder' | 'permissions';

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

/** A file made up for a file that was just created, so it can open before the folder is listed again. */
function newEntry(name: string): InstanceFile {
  const now = new Date().toISOString();
  return { name, mode: '0644', size: 0, modified_at: now, created_at: now, is_file: true, is_directory: false, is_symlink: false };
}

const coarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export default function FilesTab({ instance }: TabProps) {
  const { push } = useToast();
  const [folder, setFolder] = useState('/');
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [prompt, setPrompt] = useState<{ kind: PromptKind; path?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragFiles, setDragFiles] = useState(false);
  const anchor = useRef<string | null>(null);
  const counter = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // The answer carries the folder it is for. While another folder is loading, the
  // list of the previous one must not be shown under the new path.
  const listing = useAsync(
    async (signal) => ({ folder, files: (await listFiles(instance.id, folder, signal)).files }),
    [instance.id, folder, version],
  );
  const current = listing.data?.folder === folder ? listing.data : null;
  const entries = useMemo(
    () =>
      [...(current?.files ?? [])].sort((a, b) => {
        if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [current],
  );
  const names = useMemo(() => new Set(entries.map((entry) => entry.name)), [entries]);
  const uploading = uploads.some((upload) => upload.state === 'waiting' || upload.state === 'uploading');

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const entryAt = useCallback((path: string) => entries.find((entry) => joinPath(folder, entry.name) === path) ?? null, [entries, folder]);

  // --- state that follows the folder --------------------------------------

  const openFolder = useCallback((path: string) => {
    setFolder(path);
    setSelected([]);
    anchor.current = null;
  }, []);

  // A selection that no longer exists in the folder is dropped.
  useEffect(() => {
    setSelected((current) => current.filter((path) => entries.some((entry) => joinPath(folder, entry.name) === path)));
  }, [entries, folder]);

  // The browser warns before it leaves a page that has text that was not saved.
  useEffect(() => {
    if (dirty.size === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onDirtyChange = useCallback((path: string, value: boolean) => {
    setDirty((current) => {
      if (current.has(path) === value) return current;
      const next = new Set(current);
      if (value) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  // --- tabs ---------------------------------------------------------------

  const openFile = (path: string, entry: InstanceFile) => {
    if (!tabs.some((tab) => tab.path === path) && tabs.length >= MAX_TABS) {
      push('Close a tab before you open another file.', 'error');
      return;
    }
    setTabs((current) => (current.some((tab) => tab.path === path) ? current : [...current, { path, entry }]));
    setActive(path);
  };

  const closeTab = (path: string) => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.path === path);
      const next = current.filter((tab) => tab.path !== path);
      setActive((now) => (now !== path ? now : (next[Math.min(index, next.length - 1)]?.path ?? null)));
      return next;
    });
    setClosing(null);
  };

  const requestClose = (path: string) => (dirty.has(path) ? setClosing(path) : closeTab(path));

  /** Files that are open with unsaved text must not be moved, renamed or deleted from under the editor. */
  const guardOpen = (paths: string[]): boolean => {
    const blocked = tabs.find((tab) => dirty.has(tab.path) && paths.some((path) => isInside(tab.path, path)));
    if (blocked) {
      push(`Save or close ${baseName(blocked.path)} first. It has unsaved changes.`, 'error');
      return false;
    }
    return true;
  };

  const dropTabsWithin = (paths: string[]) => {
    setTabs((current) => {
      const next = current.filter((tab) => !paths.some((path) => isInside(tab.path, path)));
      setActive((now) => (now && next.some((tab) => tab.path === now) ? now : (next[next.length - 1]?.path ?? null)));
      return next;
    });
  };

  // --- running an action ---------------------------------------------------

  const run = async (task: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await task();
      if (done) push(done, 'ok');
    } catch (error) {
      push(error instanceof Error ? error.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const open = (path: string) => {
    const entry = entryAt(path);
    if (!entry) return;
    if (entry.is_directory) openFolder(path);
    else openFile(path, entry);
  };

  const copyToClipboard = (mode: 'copy' | 'cut', paths: string[]) => {
    if (!paths.length) return;
    setClipboard({ mode, paths });
    push(`${paths.length === 1 ? baseName(paths[0]!) : `${paths.length} items`} ${mode === 'copy' ? 'copied' : 'cut'}. Paste it in a folder.`, 'ok');
  };

  const paste = async (destination: string = folder) => {
    if (!clipboard) return;
    const { mode, paths } = clipboard;
    if (mode === 'cut' && !guardOpen(paths)) return;
    await run(async () => {
      const taken = new Set(
        destination === folder ? names : (await listFiles(instance.id, destination)).files.map((file) => file.name),
      );
      for (const path of paths) {
        const base = baseName(path);
        if (mode === 'cut') {
          if (isInside(destination, path)) throw new Error('A folder cannot be moved into itself.');
          const target = joinPath(destination, base);
          if (target === path) continue;
          if (taken.has(base)) throw new Error(`${base} already exists in ${destination}.`);
          await moveFile(instance.id, path, target);
          taken.add(base);
        } else {
          if (isInside(destination, path) && destination !== parentPath(path)) throw new Error('A folder cannot be copied into itself.');
          const name = uniqueName(base, taken);
          await copyFile(instance.id, path, joinPath(destination, name));
          taken.add(name);
        }
      }
      if (mode === 'cut') {
        dropTabsWithin(paths);
        setClipboard(null);
      }
    }, mode === 'cut' ? 'Moved.' : 'Pasted.');
  };

  const move = async (paths: string[], destination: string) => {
    const movable = paths.filter((path) => parentPath(path) !== destination && !isInside(destination, path));
    if (!movable.length || !guardOpen(movable)) return;
    await run(async () => {
      for (const path of movable) await moveFile(instance.id, path, joinPath(destination, baseName(path)));
      dropTabsWithin(movable);
      setSelected([]);
    }, movable.length === 1 ? `${baseName(movable[0]!)} moved to ${destination}.` : `${movable.length} items moved to ${destination}.`);
  };

  const duplicate = (path: string) =>
    run(async () => {
      await copyFile(instance.id, path, joinPath(parentPath(path), uniqueName(baseName(path), names)));
    }, 'Duplicated.');

  const remove = async (paths: string[]) => {
    setConfirmDelete(null);
    await run(async () => {
      for (const path of paths) await deleteFile(instance.id, path);
      dropTabsWithin(paths);
      setSelected([]);
    }, paths.length === 1 ? `${baseName(paths[0]!)} deleted.` : `${paths.length} items deleted.`);
  };

  const compress = (paths: string[]) =>
    run(async () => {
      await archiveFiles(instance.id, paths);
    }, 'Archive created.');

  const extract = (path: string) =>
    run(async () => {
      await unarchiveFile(instance.id, path);
    }, 'Archive extracted.');

  const download = async (path: string) => {
    try {
      saveBlob(await downloadFile(instance.id, path), baseName(path));
      push('Download started.', 'ok');
    } catch (error) {
      push(error instanceof Error ? error.message : 'The file could not be downloaded.', 'error');
    }
  };

  // --- uploads -------------------------------------------------------------

  // The files go one after the other, so a node that is slow is not asked for ten transfers at once.
  const send = async (files: File[], target: string = folder) => {
    if (!files.length) return;
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
      push(uploaded === 1 ? 'File uploaded.' : `${uploaded} files uploaded.`, 'ok');
      refresh();
    }
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void send(files);
  };

  // --- the menu ------------------------------------------------------------

  const itemsFor = (paths: string[]): MenuItem[] => {
    const single = paths.length === 1 ? entryAt(paths[0]!) : null;
    const path = paths[0]!;
    const items: MenuItem[] = [];
    if (single) {
      items.push({
        key: 'open',
        label: single.is_directory ? 'Open folder' : 'Open',
        icon: single.is_directory ? 'folderOpen' : 'eye',
        hint: 'Enter',
        onSelect: () => open(path),
      });
    }
    items.push(
      { key: 'copy', label: 'Copy', icon: 'copy', hint: 'Ctrl C', separated: Boolean(single), onSelect: () => copyToClipboard('copy', paths) },
      { key: 'cut', label: 'Cut', icon: 'cut', hint: 'Ctrl X', onSelect: () => copyToClipboard('cut', paths) },
    );
    if (single?.is_directory && clipboard) {
      items.push({ key: 'paste-into', label: `Paste into ${single.name}`, icon: 'paste', onSelect: () => void paste(path) });
    }
    if (single) {
      items.push(
        { key: 'duplicate', label: 'Duplicate', icon: 'clone', onSelect: () => void duplicate(path) },
        { key: 'rename', label: 'Rename', icon: 'pen', hint: 'F2', onSelect: () => setPrompt({ kind: 'rename', path }) },
      );
      if (!single.is_directory) items.push({ key: 'download', label: 'Download', icon: 'download', separated: true, onSelect: () => void download(path) });
    }
    items.push({ key: 'compress', label: 'Compress', icon: 'archive', separated: !single || single.is_directory, onSelect: () => void compress(paths) });
    if (single && archiveFormatOf(single.name)) {
      items.push({ key: 'extract', label: 'Extract here', icon: 'fileZip', onSelect: () => void extract(path) });
    }
    if (single) items.push({ key: 'permissions', label: 'Permissions', icon: 'lock', onSelect: () => setPrompt({ kind: 'permissions', path }) });
    items.push({ key: 'delete', label: 'Delete', icon: 'trash', hint: 'Del', danger: true, separated: true, onSelect: () => guardOpen(paths) && setConfirmDelete(paths) });
    return items;
  };

  const backgroundItems = (): MenuItem[] => [
    { key: 'new-file', label: 'New file', icon: 'filePlus', onSelect: () => setPrompt({ kind: 'newFile' }) },
    { key: 'new-folder', label: 'New folder', icon: 'folderPlus', onSelect: () => setPrompt({ kind: 'newFolder' }) },
    { key: 'paste', label: clipboard ? `Paste ${clipboard.paths.length === 1 ? baseName(clipboard.paths[0]!) : `${clipboard.paths.length} items`}` : 'Paste', icon: 'paste', hint: 'Ctrl V', disabled: !clipboard, separated: true, onSelect: () => void paste() },
    { key: 'upload', label: 'Upload files', icon: 'upload', separated: true, onSelect: () => fileInput.current?.click() },
    { key: 'refresh', label: 'Refresh', icon: 'refresh', onSelect: refresh },
  ];

  const openMenu = (event: { clientX: number; clientY: number }, items: MenuItem[]) => setMenu({ x: event.clientX, y: event.clientY, items });

  const onRowContextMenu = (event: MouseEvent, path: string) => {
    event.preventDefault();
    event.stopPropagation();
    const paths = selected.includes(path) ? selected : [path];
    if (!selected.includes(path)) {
      setSelected([path]);
      anchor.current = path;
    }
    openMenu(event, itemsFor(paths));
  };

  // --- selection and keys --------------------------------------------------

  const onRowClick = (event: MouseEvent, path: string) => {
    if (event.shiftKey && anchor.current) {
      const order = entries.map((entry) => joinPath(folder, entry.name));
      const from = order.indexOf(anchor.current);
      const to = order.indexOf(path);
      if (from !== -1 && to !== -1) {
        setSelected(order.slice(Math.min(from, to), Math.max(from, to) + 1));
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelected((current) => (current.includes(path) ? current.filter((item) => item !== path) : [...current, path]));
      anchor.current = path;
      return;
    }
    setSelected([path]);
    anchor.current = path;
    // A touch screen has no double click, so a tap opens the item.
    if (coarsePointer()) open(path);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const modifier = event.ctrlKey || event.metaKey;
    const order = entries.map((entry) => joinPath(folder, entry.name));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const current = selected.length ? order.indexOf(selected[selected.length - 1]!) : -1;
      const next = order[Math.max(0, Math.min(order.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (!next) return;
      if (event.shiftKey && anchor.current) {
        const from = order.indexOf(anchor.current);
        const to = order.indexOf(next);
        setSelected(order.slice(Math.min(from, to), Math.max(from, to) + 1));
      } else {
        setSelected([next]);
        anchor.current = next;
      }
      document.querySelector<HTMLElement>(`[data-path="${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && selected.length === 1) {
      event.preventDefault();
      open(selected[0]!);
    } else if (event.key === 'Backspace' && !modifier && folder !== '/') {
      event.preventDefault();
      openFolder(parentPath(folder));
    } else if (event.key === 'F2' && selected.length === 1) {
      event.preventDefault();
      setPrompt({ kind: 'rename', path: selected[0] });
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length && guardOpen(selected)) {
      event.preventDefault();
      setConfirmDelete(selected);
    } else if (modifier && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelected(order);
    } else if (modifier && event.key.toLowerCase() === 'c' && selected.length) {
      event.preventDefault();
      copyToClipboard('copy', selected);
    } else if (modifier && event.key.toLowerCase() === 'x' && selected.length) {
      event.preventDefault();
      copyToClipboard('cut', selected);
    } else if (modifier && event.key.toLowerCase() === 'v' && clipboard) {
      event.preventDefault();
      void paste();
    } else if (event.key === 'Escape') {
      setSelected([]);
    }
  };

  // --- dragging ------------------------------------------------------------

  const onRowDragStart = (event: DragEvent, path: string) => {
    const paths = selected.includes(path) ? selected : [path];
    if (!selected.includes(path)) setSelected([path]);
    event.dataTransfer.setData(INTERNAL_DRAG, JSON.stringify(paths));
    event.dataTransfer.effectAllowed = 'move';
  };

  /** The handlers of a place that takes dropped files: a folder, a crumb of the path. */
  const dropProps = (destination: string) => ({
    'data-drop-folder': destination,
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(INTERNAL_DRAG) && !event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = event.dataTransfer.types.includes(INTERNAL_DRAG) ? 'move' : 'copy';
      setDropTarget(destination);
    },
    onDragLeave: () => setDropTarget((current) => (current === destination ? null : current)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(null);
      setDragFiles(false);
      const raw = event.dataTransfer.getData(INTERNAL_DRAG);
      if (raw) {
        try {
          void move(JSON.parse(raw) as string[], destination);
        } catch {
          /* A drag that is not ours is ignored. */
        }
      } else if (event.dataTransfer.files.length) {
        void send(Array.from(event.dataTransfer.files), destination);
      }
    },
  });

  // --- the prompt ----------------------------------------------------------

  const validateName = (value: string, own?: string): string | null => {
    if (/[/\\]/.test(value)) return 'A name cannot contain slashes.';
    if (value === '.' || value === '..') return 'Use another name.';
    if (value !== own && names.has(value)) return `${value} already exists in this folder.`;
    return null;
  };

  const promptFor = () => {
    if (!prompt) return null;
    const close = () => setPrompt(null);
    if (prompt.kind === 'rename' && prompt.path) {
      const path = prompt.path;
      return (
        <PromptDialog
          title="Rename"
          label="New name"
          initial={baseName(path)}
          confirmLabel="Rename"
          validate={(value) => validateName(value, baseName(path))}
          onCancel={close}
          onSubmit={async (value) => {
            if (!guardOpen([path])) return;
            close();
            if (value === baseName(path)) return;
            await run(async () => {
              await renameFile(instance.id, path, joinPath(parentPath(path), value));
              dropTabsWithin([path]);
            }, 'Renamed.');
          }}
        />
      );
    }
    if (prompt.kind === 'newFile') {
      return (
        <PromptDialog
          title="New file"
          label={`Name of the file in ${folder}`}
          initial=""
          confirmLabel="Create"
          mono
          validate={(value) => validateName(value)}
          onCancel={close}
          onSubmit={async (value) => {
            close();
            await run(async () => {
              const path = joinPath(folder, value);
              await writeFile(instance.id, path, '');
              openFile(path, newEntry(value));
            }, `${value} created.`);
          }}
        />
      );
    }
    if (prompt.kind === 'newFolder') {
      return (
        <PromptDialog
          title="New folder"
          label={`Name of the folder in ${folder}`}
          initial=""
          confirmLabel="Create"
          mono
          validate={(value) => validateName(value)}
          onCancel={close}
          onSubmit={async (value) => {
            close();
            await run(async () => {
              await createFolder(instance.id, joinPath(folder, value));
            }, `${value} created.`);
          }}
        />
      );
    }
    if (prompt.kind === 'permissions' && prompt.path) {
      const path = prompt.path;
      return (
        <PromptDialog
          title="Permissions"
          label="Permissions"
          hint="The three octal digits of the permissions, for example 644."
          initial={fmtMode(entryAt(path)?.mode)}
          confirmLabel="Save"
          mono
          validate={(value) => (parseMode(value) === null ? 'Use three digits between 0 and 7.' : null)}
          onCancel={close}
          onSubmit={async (value) => {
            close();
            const bits = parseMode(value);
            if (bits === null) return;
            await run(async () => {
              await chmodFile(instance.id, path, bits);
            }, 'Permissions changed.');
          }}
        />
      );
    }
    return null;
  };

  // --- the page ------------------------------------------------------------

  const crumbs = crumbsOf(folder);
  const cutPaths = clipboard?.mode === 'cut' ? clipboard.paths : [];
  const rowBase =
    'group flex min-h-[52px] w-full cursor-default select-none items-center gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors duration-150 outline-none';

  return (
    <div
      className="grid gap-3"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragFiles(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragFiles(false);
          setDropTarget(null);
        }
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragFiles(false);
        void send(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-2 pl-3">
        <nav aria-label="Folder" className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 font-mono text-[13.5px]">
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex items-center gap-0.5">
              {index > 0 && <Icon name="chevronDown" size={9} className="-rotate-90 text-ink3" />}
              <button
                type="button"
                {...dropProps(crumb.path)}
                onClick={() => openFolder(crumb.path)}
                aria-current={index === crumbs.length - 1 ? 'page' : undefined}
                className={`rounded-md px-1.5 py-1 transition-colors hover:bg-s2 focus-visible:outline-2 focus-visible:outline-acc ${dropTarget === crumb.path ? 'bg-acc-bg text-acc' : index === crumbs.length - 1 ? 'text-ink' : 'text-ink3'}`}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>
        <SoftButton onClick={() => setPrompt({ kind: 'newFile' })}>
          <Icon name="filePlus" size={14} />
          <span className="max-sm:sr-only">New file</span>
        </SoftButton>
        <SoftButton onClick={() => setPrompt({ kind: 'newFolder' })}>
          <Icon name="folderPlus" size={14} />
          <span className="max-sm:sr-only">New folder</span>
        </SoftButton>
        <SoftButton onClick={() => fileInput.current?.click()} disabled={uploading}>
          <Icon name="upload" size={14} />
          <span className="max-sm:sr-only">{uploading ? 'Uploading…' : 'Upload'}</span>
        </SoftButton>
        {clipboard && (
          <SoftButton onClick={() => void paste()} disabled={busy}>
            <Icon name="paste" size={14} />
            Paste {clipboard.paths.length > 1 ? `${clipboard.paths.length} items` : ''}
          </SoftButton>
        )}
        <SoftButton onClick={refresh} aria-label="Refresh the folder">
          <Icon name="refresh" size={14} />
        </SoftButton>
        <input ref={fileInput} type="file" multiple onChange={onPick} className="sr-only" aria-label="Upload files to the instance" />
      </div>

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

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        {/* The explorer */}
        <section
          aria-label="Files"
          aria-busy={busy}
          className={`relative rounded-2xl border bg-card p-2 ${dragFiles ? 'border-acc outline-2 outline-dashed outline-acc' : 'border-line'} ${busy ? 'opacity-70' : ''}`}
        >
          {dragFiles && !dropTarget && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl bg-bg/80 px-4 text-center text-[15px] font-semibold text-ink">
              Drop the files to upload them to {folder}
            </div>
          )}
          <div
            role="listbox"
            aria-multiselectable="true"
            aria-label={`Contents of ${folder}`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onContextMenu={(event) => {
              event.preventDefault();
              openMenu(event, backgroundItems());
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) setSelected([]);
            }}
            className="max-h-[70dvh] min-h-[220px] overflow-y-auto overscroll-contain rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            {folder !== '/' && (
              <div
                {...dropProps(parentPath(folder))}
                role="option"
                aria-selected="false"
                onClick={() => openFolder(parentPath(folder))}
                className={`${rowBase} cursor-pointer text-ink3 hover:bg-s2 hover:text-ink ${dropTarget === parentPath(folder) ? 'bg-acc-bg' : ''}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-s2">
                  <Icon name="arrowUp" size={14} />
                </span>
                <span className="text-[14px] font-medium">Up one level</span>
              </div>
            )}

            {!current && !listing.error ? (
              <div className="p-2"><LoadingBlock rows={4} label="Loading the folder" /></div>
            ) : listing.error ? (
              <p role="alert" className="m-2 break-words rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">{listing.error.message}</p>
            ) : entries.length === 0 ? (
              <p className="px-3 py-10 text-center text-[14px] text-ink3">This folder is empty. Drop files here, or right-click for more.</p>
            ) : (
              entries.map((file) => {
                const full = joinPath(folder, file.name);
                const isSelected = selected.includes(full);
                const isFolder = file.is_directory;
                const opened = tabs.some((tab) => tab.path === full);
                return (
                  <div
                    key={full}
                    data-path={full}
                    role="option"
                    aria-selected={isSelected}
                    draggable
                    onDragStart={(event) => onRowDragStart(event, full)}
                    onDragEnd={() => setDropTarget(null)}
                    {...(isFolder ? dropProps(full) : {})}
                    onClick={(event) => onRowClick(event, full)}
                    onDoubleClick={() => open(full)}
                    onContextMenu={(event) => onRowContextMenu(event, full)}
                    className={`${rowBase} ${isSelected ? 'bg-s3' : 'hover:bg-s2'} ${dropTarget === full ? 'bg-acc-bg ring-2 ring-acc' : ''} ${cutPaths.includes(full) ? 'opacity-50' : ''}`}
                  >
                    <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${isFolder ? 'bg-acc-bg text-acc' : 'bg-s2 text-ink3'}`}>
                      <Icon name={isFolder ? 'folder' : iconOfFile(file.name)} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-[14.5px] font-medium text-ink" title={file.name}>
                        <span className="truncate">{file.name}</span>
                        {opened && <span aria-label="Open in a tab" className="size-1.5 shrink-0 rounded-full bg-acc" />}
                      </span>
                      <span className="block truncate font-mono text-[11.5px] text-ink3">
                        {isFolder ? 'Folder' : fmtBytes(file.size)} · {relativeTime(file.modified_at)}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Actions for ${file.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        const box = event.currentTarget.getBoundingClientRect();
                        const paths = isSelected ? selected : [full];
                        if (!isSelected) setSelected([full]);
                        setMenu({ x: box.right - 8, y: box.bottom, items: itemsFor(paths) });
                      }}
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-ink3 hover:bg-s3 hover:text-ink focus-visible:outline-2 focus-visible:outline-acc [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                    >
                      <Icon name="ellipsis" size={15} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <p className="px-2 pt-2 text-[12px] text-ink3">
            {selected.length > 1 ? `${selected.length} selected. ` : ''}Double-click opens, right-click shows the menu, drag onto a folder to move.
          </p>
        </section>

        {/* The tabs */}
        <section aria-label="Open files" className={`min-w-0 rounded-2xl border border-line bg-card ${tabs.length ? '' : 'max-xl:hidden'}`}>
          {tabs.length === 0 ? (
            <div className="grid min-h-[260px] place-items-center p-6 text-center">
              <div className="grid justify-items-center gap-2">
                <span className="grid size-12 place-items-center rounded-2xl bg-s2 text-ink3"><Icon name="fileCode" size={20} /></span>
                <p className="text-[15.5px] font-semibold text-ink">No file open</p>
                <p className="max-w-[28em] text-[13.5px] text-ink2">Double-click a file to edit it or to see a preview. Every file you open gets a tab, so you can move between them.</p>
              </div>
            </div>
          ) : (
            <>
              <div role="tablist" aria-label="Open files" className="flex overflow-x-auto border-b border-line p-1.5 no-scrollbar">
                {tabs.map((tab) => {
                  const isActive = tab.path === active;
                  return (
                    <div
                      key={tab.path}
                      className={`flex shrink-0 items-center rounded-xl ${isActive ? 'bg-s3 text-ink' : 'text-ink3 hover:bg-s2 hover:text-ink'}`}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        title={tab.path}
                        onClick={() => setActive(tab.path)}
                        onAuxClick={(event) => {
                          if (event.button === 1) requestClose(tab.path);
                        }}
                        className="flex h-10 max-w-[220px] items-center gap-2 rounded-xl pr-1 pl-3 text-[13.5px] font-medium focus-visible:outline-2 focus-visible:outline-acc"
                      >
                        <Icon name={iconOfFile(tab.entry.name)} size={13} />
                        <span className="truncate">{baseName(tab.path)}</span>
                        {dirty.has(tab.path) && <span aria-label="Unsaved changes" className="size-2 shrink-0 rounded-full bg-warn" />}
                      </button>
                      <button
                        type="button"
                        aria-label={`Close ${baseName(tab.path)}`}
                        onClick={() => requestClose(tab.path)}
                        className="mr-1 grid size-7 place-items-center rounded-lg hover:bg-s2 focus-visible:outline-2 focus-visible:outline-acc"
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="p-3 sm:p-4">
                {/* Every tab stays drawn, so the text that was not saved is kept when another tab is shown. */}
                {tabs.map((tab) => (
                  <div key={tab.path} role="tabpanel" hidden={tab.path !== active}>
                    <p className="mb-2 truncate font-mono text-[12.5px] text-ink3" title={tab.path}>{tab.path}</p>
                    <FileViewer instanceId={instance.id} path={tab.path} entry={tab.entry} onDirtyChange={onDirtyChange} onChanged={refresh} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {promptFor()}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={confirmDelete && confirmDelete.length > 1 ? `Delete ${confirmDelete.length} items?` : 'Delete this item?'}
        description={confirmDelete ? `${confirmDelete.length === 1 ? confirmDelete[0] : `${confirmDelete.length} items`} will be removed from the instance. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmDialog
        open={closing !== null}
        title="Close without saving?"
        description={closing ? `${baseName(closing)} has changes that were not saved. They are lost if you close the tab.` : ''}
        confirmLabel="Close the tab"
        onConfirm={() => closing && closeTab(closing)}
        onCancel={() => setClosing(null)}
      />
    </div>
  );
}
