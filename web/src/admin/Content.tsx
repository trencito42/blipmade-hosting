import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Panel } from '../ui-app';
import { can, denseGhost, fmtDateTime, useAdminSession } from './Overview';

/**
 * The words of the public site. Each block opens on its own page, where its draft is edited, published,
 * taken down, or an earlier version is put back. The site keeps the words of the code until a version is published.
 */
interface BlockRow { key: string; label: string; description: string; hasDraft: boolean; draftBy: string | null; published: { id: string; at: string; by: string | null } | null }

export default function Content() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'content.write');
  const list = useAsync<{ blocks: BlockRow[]; placeholders: string[] }>((signal) => get('/admin/content', undefined, signal), []);
  if (session.loading || list.loading) return <LoadingBlock rows={3} label="Loading the content" />;
  if (list.error) return <ErrorState title="The content could not be loaded" message={list.error.message} onRetry={list.reload} />;
  if (!list.data || list.data.blocks.length === 0) return <EmptyState title="No editable content." description="Nothing is registered." />;
  return (
    <Panel title="Words of the public site" description="Edit a draft, publish it, and the site shows it within a minute, without a deploy. Until a version is published, and after it is taken down, the site uses the words of the code.">
      <ul className="divide-y divide-line">
        {list.data.blocks.map((block) => (
          <li key={block.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold text-ink">{block.label}</p>
              <p className="text-[12.5px] text-ink3">{block.published ? `published ${fmtDateTime(block.published.at)}` : 'the words of the code'}{block.hasDraft ? ' · draft waiting' : ''}</p>
            </div>
            <Link to={`/admin/content/${encodeURIComponent(block.key)}/edit`} className={denseGhost}>{mayWrite ? 'Edit' : 'View'}</Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
