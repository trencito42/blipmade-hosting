import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, TextInput } from '../ui-app';
import { can, denseGhost, densePrimary, useAdminSession } from './Overview';

interface Campaign { id: string; name: string; status: string; suppressed: boolean }
interface Segment { id: string; name: string }

export default function CrmDesk() {
  const mayWrite = can(useAdminSession().staff, 'promotions.write');
  const campaigns = useAsync<{ campaigns: Campaign[]; delivery: boolean }>((signal) => get('/admin/crm/campaigns', undefined, signal), []);
  const segments = useAsync<{ segments: Segment[] }>((signal) => get('/admin/crm/segments', undefined, signal), []);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const create = useAction(async () => {
    await post('/admin/crm/campaigns', { name: name.trim(), body: body.trim() });
    setName('');
    setBody('');
    campaigns.reload();
  });
  const act = useAction(async (id: string, event: string) => {
    await post(`/admin/crm/campaigns/${encodeURIComponent(id)}/${encodeURIComponent(event)}`, {});
    campaigns.reload();
  });
  return (
    <div className="grid gap-4">
      <Panel
        title="CRM campaigns"
        description="Draft, approve and suppress. Live sending stays off until marketing delivery is authorised. Consent is checked per customer."
        action={<Link to="/admin/promotions" className={denseGhost}>Promotions</Link>}
      >
        {campaigns.loading && !campaigns.data ? <LoadingBlock rows={3} label="Loading campaigns" />
          : campaigns.error ? <ErrorState title="Campaigns could not be loaded" message={campaigns.error.message} onRetry={campaigns.reload} />
          : (
            <>
              <p className="mb-3 text-[13px] text-ink3">Delivery enabled: {campaigns.data?.delivery ? 'yes' : 'no'}</p>
              {mayWrite && (
                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} />
                  <TextInput label="Body" value={body} onChange={(event) => setBody(event.target.value)} />
                  <PrimaryButton type="button" disabled={!name.trim() || !body.trim() || create.pending} onClick={() => void create.run()}>Create draft</PrimaryButton>
                </div>
              )}
              <ul className="grid gap-2">
                {(campaigns.data?.campaigns ?? []).map((campaign) => (
                  <li key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-3 py-2">
                    <span className="text-[14px] text-ink">{campaign.name} · {campaign.status}</span>
                    {mayWrite && campaign.status === 'draft' && <SoftButton type="button" onClick={() => void act.run(campaign.id, 'submit')}>Submit</SoftButton>}
                    {mayWrite && campaign.status === 'pending_approval' && (
                      <span className="flex gap-2">
                        <PrimaryButton type="button" className={densePrimary} onClick={() => void act.run(campaign.id, 'approve')}>Approve</PrimaryButton>
                        <SoftButton type="button" onClick={() => void act.run(campaign.id, 'reject')}>Reject</SoftButton>
                      </span>
                    )}
                  </li>
                ))}
                {(campaigns.data?.campaigns ?? []).length === 0 && <EmptyState title="No campaigns." description="Create a draft. It cannot be sent without approval and consent." />}
              </ul>
            </>
          )}
      </Panel>
      <Panel title="Segments" description="Filters over typed facts. They do not copy the customer table.">
        {segments.loading && !segments.data ? <LoadingBlock rows={2} label="Loading segments" />
          : (
            <ul className="grid gap-1 text-[14px] text-ink2">
              {(segments.data?.segments ?? []).map((segment) => <li key={segment.id}>{segment.name}</li>)}
              {(segments.data?.segments ?? []).length === 0 && <li className="text-ink3">No saved segments yet.</li>}
            </ul>
          )}
      </Panel>
    </div>
  );
}
