import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { downloadFile, readFile, unarchiveFile, writeFile, type InstanceFile } from '../../../lib/instance-api';
import { useAction, useAsync } from '../../../lib/useAsync';
import { Icon } from '../../../icons';
import { LANGUAGE_LABEL, languageOf } from '../editor-language';
import { LoadingBlock, PrimaryButton, SoftButton, useToast } from '../../../ui-app';
import { baseName, fmtBytes, fmtDateTime, fmtMode } from '../common';
import { decodeContent, iconOfFile, kindOf, looksBinary, previewMime, saveBlob } from './file-utils';

const CodeEditor = lazy(() => import('../CodeEditor'));

/** A text file larger than this is not opened in the editor. */
const EDIT_LIMIT = 2_000_000;
/** A preview larger than this is not read into the browser. */
const PREVIEW_LIMIT = 60_000_000;

/**
 * The content of one open file.
 *
 * Text opens in the editor, an image, a PDF, a video or a sound opens as a
 * preview, an archive offers to extract itself, and any other file shows what
 * it is and offers the download. The viewer tells its tab when the text has
 * unsaved changes.
 */
export default function FileViewer({
  instanceId,
  path,
  entry,
  onDirtyChange,
  onChanged,
}: {
  instanceId: string;
  path: string;
  entry: InstanceFile;
  onDirtyChange: (path: string, dirty: boolean) => void;
  onChanged: () => void;
}) {
  const { push } = useToast();
  const kind = kindOf(entry.name);
  const mime = previewMime(entry.name);
  const previewable = mime !== null && (kind === 'image' || kind === 'pdf' || kind === 'video' || kind === 'audio');
  const editable = kind === 'text' && entry.size <= EDIT_LIMIT;

  const file = useAsync(
    (signal) => (editable ? readFile(instanceId, path, signal) : Promise.resolve({ content: '', encoding: 'utf8' })),
    [instanceId, path, editable],
  );
  const decoded = useMemo(() => {
    if (!file.data || !editable) return { text: '', binary: false };
    if (looksBinary(entry.name, file.data.content ?? '')) return { text: '', binary: true };
    return decodeContent(file.data.content ?? '', file.data.encoding ?? '');
  }, [file.data, editable, entry.name]);

  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const dirty = content !== saved;

  useEffect(() => {
    setContent(decoded.text);
    setSaved(decoded.text);
  }, [decoded.text]);

  useEffect(() => {
    onDirtyChange(path, dirty);
    return () => onDirtyChange(path, false);
  }, [dirty, path, onDirtyChange]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!previewable || !mime) return;
    if (entry.size > PREVIEW_LIMIT) {
      setPreviewError('This file is too large to preview. Download it to open it.');
      return;
    }
    let active = true;
    let url: string | null = null;
    setPreviewUrl(null);
    setPreviewError(null);
    void downloadFile(instanceId, path)
      .then(async (blob) => {
        let data = blob;
        // An image that an earlier upload stored as base64 text is decoded for the preview.
        if (kind === 'image' && blob.size < 10_000_000) {
          const text = (await blob.text()).trim();
          if (/^(iVBOR|\/9j\/|R0lGOD|UklGR)/.test(text)) {
            try {
              data = new Blob([Uint8Array.from(atob(text), (char) => char.charCodeAt(0))], { type: mime });
            } catch {
              /* The download is kept as it is. */
            }
          }
        }
        if (!active) return;
        url = URL.createObjectURL(new Blob([data], { type: mime }));
        setPreviewUrl(url);
      })
      .catch((error) => {
        if (active) setPreviewError(error instanceof Error ? error.message : 'The preview could not be loaded.');
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [instanceId, path, previewable, mime, kind, entry.size]);

  const save = useAction(async (next: string) => {
    await writeFile(instanceId, path, next);
    return true;
  });
  const extract = useAction(async () => {
    await unarchiveFile(instanceId, path);
    return true;
  });

  const onSave = async () => {
    if (!dirty || save.pending) return;
    const text = content;
    if (await save.run(text)) {
      setSaved(text);
      push('File saved.', 'ok');
      onChanged();
    }
  };

  const onDownload = async () => {
    try {
      saveBlob(await downloadFile(instanceId, path), baseName(path));
      push('Download started.', 'ok');
    } catch (error) {
      push(error instanceof Error ? error.message : 'The file could not be downloaded.', 'error');
    }
  };

  const onExtract = async () => {
    if (await extract.run()) {
      push('Archive extracted.', 'ok');
      onChanged();
    }
  };

  const facts = (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-ink3">
      <div className="flex gap-1.5"><dt>Size</dt><dd className="font-mono text-ink2">{fmtBytes(entry.size)}</dd></div>
      <div className="flex gap-1.5"><dt>Modified</dt><dd className="text-ink2">{fmtDateTime(entry.modified_at)}</dd></div>
      <div className="flex gap-1.5"><dt>Permissions</dt><dd className="font-mono text-ink2">{fmtMode(entry.mode)}</dd></div>
    </dl>
  );

  const actions = (
    <SoftButton onClick={() => void onDownload()}>
      <Icon name="download" size={14} />
      Download
    </SoftButton>
  );

  // A file that cannot be shown: what it is, and the download.
  const plain = (title: string, text: string, extra?: React.ReactNode) => (
    <div className="grid justify-items-start gap-3 rounded-2xl bg-s2 p-5">
      <span className="grid size-12 place-items-center rounded-2xl bg-card text-ink3">
        <Icon name={iconOfFile(entry.name)} size={20} />
      </span>
      <div>
        <p className="text-[15.5px] font-semibold text-ink">{title}</p>
        <p className="mt-1 text-[13.5px] text-ink2">{text}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {extra}
        {actions}
      </div>
    </div>
  );

  let body;
  if (previewable) {
    body = previewError ? (
      plain('No preview', previewError)
    ) : !previewUrl ? (
      <LoadingBlock rows={2} label="Loading the preview" />
    ) : kind === 'image' ? (
      <div className="grid place-items-center rounded-2xl border border-line bg-s1 p-3">
        <img src={previewUrl} alt={entry.name} className="max-h-[60dvh] max-w-full rounded-xl object-contain" />
      </div>
    ) : kind === 'pdf' ? (
      <iframe title={entry.name} src={previewUrl} className="h-[60dvh] w-full rounded-2xl border border-line bg-white" />
    ) : kind === 'video' ? (
      <video src={previewUrl} controls className="max-h-[60dvh] w-full rounded-2xl bg-black" />
    ) : (
      <audio src={previewUrl} controls className="w-full" />
    );
  } else if (kind === 'archive') {
    body = plain(
      'An archive',
      'Extract it into this folder, or download it. The files of an archive are not listed before they are extracted.',
      <PrimaryButton onClick={() => void onExtract()} disabled={extract.pending}>
        {extract.pending ? 'Extracting…' : 'Extract here'}
      </PrimaryButton>,
    );
  } else if (kind === 'text' && !editable) {
    body = plain('Too large to edit', `Files over ${fmtBytes(EDIT_LIMIT)} are not opened in the editor. Download the file to read it.`);
  } else if (kind === 'text') {
    body = file.loading ? (
      <LoadingBlock rows={3} label="Loading the file" />
    ) : file.error ? (
      <p role="alert" className="break-words rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-medium text-bad">{file.error.message}</p>
    ) : decoded.binary ? (
      plain('This file is not text', 'A binary file cannot be edited here. Download it to open it with another program.')
    ) : (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[12.5px] text-ink3">
          <span>{LANGUAGE_LABEL[languageOf(entry.name)]} · Ctrl S saves, Ctrl F finds</span>
          <span className="flex items-center gap-2">
            {dirty && <span>Unsaved changes</span>}
            <PrimaryButton onClick={() => void onSave()} disabled={save.pending || !dirty} className="h-9 px-4">
              {save.pending ? 'Saving…' : 'Save'}
            </PrimaryButton>
          </span>
        </div>
        <Suspense fallback={<LoadingBlock rows={3} label="Loading the editor" />}>
          <CodeEditor
            label={`Content of ${entry.name}`}
            value={content}
            language={languageOf(entry.name)}
            height="min(62dvh, 620px)"
            onChange={setContent}
            onSave={() => void onSave()}
          />
        </Suspense>
        {save.error && <p role="alert" className="break-words text-[13.5px] font-medium text-bad">{save.error}</p>}
      </div>
    );
  } else {
    body = plain('This file cannot be shown here', 'Download it to open it with another program.');
  }

  return (
    <div className="grid gap-3">
      {facts}
      {body}
      {extract.error && <p role="alert" className="break-words text-[13.5px] font-medium text-bad">{extract.error}</p>}
    </div>
  );
}
