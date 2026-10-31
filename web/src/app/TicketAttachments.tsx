import type { TicketAttachment } from '../lib/api';

function fmtSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TicketAttachments({ ticketId, messageId, attachments }: {
  ticketId: string;
  messageId: string;
  attachments: TicketAttachment[];
}) {
  if (!attachments.length) return null;

  return (
    <ul className="mt-3 grid gap-2">
      {attachments.map((file, index) => {
        const stored = Boolean(file.id && file.downloadable);
        const url = stored
          ? `/api/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(file.id!)}`
          : '';
        const image = stored && file.type.startsWith('image/');
        return (
          <li key={`${messageId}-${file.id ?? `${file.name}-${index}`}`} className="overflow-hidden rounded-xl bg-s3">
            {image && (
              <a href={url} download={file.name} className="block border-b border-line bg-bg/40 p-2">
                <img
                  src={url}
                  alt={`Attachment preview: ${file.name}`}
                  loading="lazy"
                  className="max-h-64 w-auto max-w-full rounded-lg object-contain"
                />
              </a>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
              <span className="min-w-0 break-all text-ink2">
                <span className="font-mono text-ink">{file.name}</span>
                <span className="mx-2 text-ink3">·</span>
                {fmtSize(file.size)}
                <span className="mx-2 text-ink3">·</span>
                {file.type || 'unknown type'}
              </span>
              {stored ? (
                <a href={url} download={file.name} className="shrink-0 font-bold text-acc hover:underline">
                  Download
                </a>
              ) : (
                <span className="shrink-0 text-ink3" title="This older upload stored metadata only.">
                  File unavailable
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
