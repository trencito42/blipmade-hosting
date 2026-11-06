import { useState } from 'react';
import { get, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, Select, SoftButton, TextArea, TextInput } from '../ui-app';
import { can, denseGhost, densePrimary, useAdminSession } from './Overview';

type Tab = 'overview' | 'segments' | 'campaigns' | 'automations' | 'templates' | 'tasks' | 'opportunities' | 'analytics' | 'risk';

interface Campaign { id: string; name: string; status: string; suppressed: boolean; channel?: string; objective?: string }
interface Segment { id: string; name: string; kind?: string; version?: number }
interface Task { id: string; title: string; status: string; userId: string }
interface Opportunity { id: string; title: string; reason: string; family: string | null }
interface Automation { id: string; name: string; trigger: string; status: string; paused: boolean }

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'segments', label: 'Segments' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'automations', label: 'Automations' },
  { id: 'templates', label: 'Templates' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'risk', label: 'Risk review' },
];

const FACTS = ['core.lifecycle', 'core.plan_family', 'billing.spend_cents', 'billing.spend_band', 'support.open', 'consent.marketing', 'identity.discord', 'identity.oauth', 'account.verified'];
const CMPS = ['eq', 'neq', 'gt', 'lt', 'contains', 'in', 'exists', 'not_exists', 'older_than_days', 'within_days'];

type Cond = { fact: string; cmp: string; value: string };
type Group = { children: Cond[] };

function blankFilter(): { op: 'or'; children: { op: 'and'; children: Cond[] }[] } {
  return { op: 'or', children: [{ op: 'and', children: [{ fact: 'core.lifecycle', cmp: 'eq', value: 'active' }] }] };
}

function RuleBuilder({ groups, onChange }: { groups: Group[]; onChange: (groups: Group[]) => void }) {
  return (
    <div className="grid gap-3">
      {groups.map((group, gi) => (
        <div key={gi} className="rounded-2xl bg-s2 p-3">
          <p className="mb-2 text-[12px] font-medium text-ink3">{gi === 0 ? 'Match all of' : 'or match all of'}</p>
          {group.children.map((cond, ci) => (
            <div key={ci} className="mb-2 grid gap-2 sm:grid-cols-3">
              <Select label="Fact" value={cond.fact} onChange={(event) => {
                const next = groups.map((row, i) => i !== gi ? row : { children: row.children.map((item, j) => j === ci ? { ...item, fact: event.target.value } : item) });
                onChange(next);
              }}>
                {FACTS.map((fact) => <option key={fact} value={fact}>{fact}</option>)}
              </Select>
              <Select label="Operator" value={cond.cmp} onChange={(event) => {
                const next = groups.map((row, i) => i !== gi ? row : { children: row.children.map((item, j) => j === ci ? { ...item, cmp: event.target.value } : item) });
                onChange(next);
              }}>
                {CMPS.map((cmp) => <option key={cmp} value={cmp}>{cmp}</option>)}
              </Select>
              <TextInput label="Value" value={cond.value} onChange={(event) => {
                const next = groups.map((row, i) => i !== gi ? row : { children: row.children.map((item, j) => j === ci ? { ...item, value: event.target.value } : item) });
                onChange(next);
              }} />
            </div>
          ))}
          <SoftButton type="button" onClick={() => onChange(groups.map((row, i) => i === gi ? { children: [...row.children, { fact: 'core.lifecycle', cmp: 'eq', value: '' }] } : row))}>Add condition</SoftButton>
        </div>
      ))}
      <SoftButton type="button" onClick={() => onChange([...groups, { children: [{ fact: 'consent.marketing', cmp: 'eq', value: 'opt_in' }] }])}>Add OR group</SoftButton>
    </div>
  );
}

function toFilter(groups: Group[]) {
  return { op: 'or', children: groups.map((group) => ({ op: 'and', children: group.children })) };
}

export default function CrmDesk() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'promotions.write');
  const mayCustomers = can(session.staff, 'customers.write');
  const mayRisk = can(session.staff, 'risk.write');
  const mayRiskRead = can(session.staff, 'risk.read');
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div className="grid gap-4">
      <Panel title="CRM & growth" description="Facts, segments, campaigns and automations. Live marketing send stays off. Consent is read per recipient. Risk scores never become marketing variables.">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((entry) => (
            <button key={entry.id} type="button" aria-current={tab === entry.id ? 'page' : undefined} className={tab === entry.id ? densePrimary : denseGhost} onClick={() => setTab(entry.id)}>{entry.label}</button>
          ))}
          <Link to="/admin/promotions" className={denseGhost}>Promotions</Link>
          <Link to="/admin/customers" className={denseGhost}>Customers</Link>
        </div>
      </Panel>
      {tab === 'overview' && <OverviewPane />}
      {tab === 'segments' && <SegmentsPane mayWrite={mayCustomers} />}
      {tab === 'campaigns' && <CampaignsPane mayWrite={mayWrite} />}
      {tab === 'automations' && <AutomationsPane mayWrite={mayWrite} />}
      {tab === 'templates' && <TemplatesPane mayWrite={mayWrite} />}
      {tab === 'tasks' && <TasksPane mayWrite={mayCustomers} />}
      {tab === 'opportunities' && <OpportunitiesPane />}
      {tab === 'analytics' && <AnalyticsPane />}
      {tab === 'risk' && (mayRiskRead ? <RiskPane mayWrite={mayRisk} /> : <EmptyState title="No access" description="Risk review needs risk.read." />)}
    </div>
  );
}

function OverviewPane() {
  const state = useAsync<{ customers: number; campaigns: number; segments: number; openTasks: number; automations: number; delivery: boolean }>((signal) => get('/admin/crm/overview', undefined, signal), []);
  if (state.loading && !state.data) return <LoadingBlock rows={2} label="Loading CRM overview" />;
  if (state.error) return <ErrorState title="Overview could not be loaded" message={state.error.message} onRetry={state.reload} />;
  const data = state.data!;
  return (
    <Panel title="Workspace" description={`Live delivery: ${data.delivery ? 'on' : 'off'}`}>
      <dl className="grid gap-2 sm:grid-cols-5">
        {([['Customers', data.customers], ['Segments', data.segments], ['Campaigns', data.campaigns], ['Automations', data.automations], ['Open tasks', data.openTasks]] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-s2 px-4 py-3">
            <dt className="text-[12px] text-ink3">{label}</dt>
            <dd className="text-[18px] font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function SegmentsPane({ mayWrite }: { mayWrite: boolean }) {
  const segments = useAsync<{ segments: Segment[] }>((signal) => get('/admin/crm/segments', undefined, signal), []);
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<Group[]>(blankFilter().children);
  const [preview, setPreview] = useState<{ count: number; sample: { email: string; why: string[] }[] } | null>(null);
  const create = useAction(async () => {
    await post('/admin/crm/segments', { name: name.trim(), filter: toFilter(groups), kind: 'dynamic' });
    setName('');
    segments.reload();
  });
  const runPreview = useAction(async (id: string) => {
    setPreview(await post(`/admin/crm/segments/${encodeURIComponent(id)}/preview`, {}));
  });
  return (
    <Panel title="Segments" description="Nested AND/OR over typed facts. Counts use the customer table, not a 200-row sample. Security facts are refused.">
      {mayWrite && (
        <div className="mb-4 grid gap-3">
          <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <RuleBuilder groups={groups} onChange={setGroups} />
          <PrimaryButton type="button" disabled={!name.trim() || create.pending} onClick={() => void create.run()}>Save segment</PrimaryButton>
        </div>
      )}
      {create.error && <p role="alert" className="mb-2 text-[13px] text-bad">{create.error}</p>}
      <ul className="grid gap-2">
        {(segments.data?.segments ?? []).map((segment) => (
          <li key={segment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-3 py-2">
            <span className="text-[14px] text-ink">{segment.name} · v{segment.version ?? 1} · {segment.kind ?? 'dynamic'}</span>
            <SoftButton type="button" onClick={() => void runPreview.run(segment.id)}>Count audience</SoftButton>
          </li>
        ))}
      </ul>
      {preview && <p className="mt-3 text-[14px] text-ink2">Audience: {preview.count}. Sample {preview.sample.map((row) => row.email).join(', ') || 'none'}.</p>}
    </Panel>
  );
}

function CampaignsPane({ mayWrite }: { mayWrite: boolean }) {
  const campaigns = useAsync<{ campaigns: Campaign[]; delivery: boolean }>((signal) => get('/admin/crm/campaigns', undefined, signal), []);
  const segments = useAsync<{ segments: Segment[] }>((signal) => get('/admin/crm/segments', undefined, signal), []);
  const [name, setName] = useState('');
  const [body, setBody] = useState('Hello {{firstName}}');
  const [segmentId, setSegmentId] = useState('');
  const [objective, setObjective] = useState('retain');
  const [announce, setAnnounce] = useState('');
  const [announceNote, setAnnounceNote] = useState('');
  const create = useAction(async () => {
    await post('/admin/crm/campaigns', { name: name.trim(), body: body.trim(), segmentId: segmentId || null, objective, channel: 'email' });
    setName('');
    campaigns.reload();
  });
  const act = useAction(async (id: string, event: string) => {
    await post(`/admin/crm/campaigns/${encodeURIComponent(id)}/${encodeURIComponent(event)}`, {});
    campaigns.reload();
  });
  const queue = useAction(async (id: string) => {
    await post(`/admin/crm/campaigns/${encodeURIComponent(id)}/queue`, {});
    campaigns.reload();
  });
  const community = useAction(async () => {
    await post('/admin/crm/community-announce', { body: announce.trim() });
    setAnnounce('');
    setAnnounceNote('Announcement recorded. Production Discord was not posted to.');
  });
  return (
    <Panel title="Campaign studio" description="Draft, approve, pause, queue. Queue re-reads marketing consent per customer. Discord DMs are refused.">
      <p className="mb-3 text-[13px] text-ink3">Delivery enabled: {campaigns.data?.delivery ? 'yes' : 'no'}</p>
      {mayWrite && (
        <div className="mb-4 grid gap-2">
          <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <TextArea label="Body" value={body} onChange={(event) => setBody(event.target.value)} />
          <Select label="Objective" value={objective} onChange={(event) => setObjective(event.target.value)}>
            <option value="acquire">Acquire</option>
            <option value="retain">Retain</option>
            <option value="winback">Win back</option>
          </Select>
          <Select label="Segment" value={segmentId} onChange={(event) => setSegmentId(event.target.value)}>
            <option value="">All customers (still requires consent)</option>
            {(segments.data?.segments ?? []).map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
          </Select>
          <PrimaryButton type="button" disabled={!name.trim() || !body.trim() || create.pending} onClick={() => void create.run()}>Create draft</PrimaryButton>
        </div>
      )}
      {(create.error || act.error || queue.error || community.error) && <p role="alert" className="mb-2 text-[13px] text-bad">{create.error || act.error || queue.error || community.error}</p>}
      {announceNote && <p className="mb-2 text-[13px] text-ink3">{announceNote}</p>}
      <ul className="grid gap-2">
        {(campaigns.data?.campaigns ?? []).map((campaign) => (
          <li key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-3 py-2">
            <span className="text-[14px] text-ink">{campaign.name} · {campaign.status} · {campaign.objective ?? 'retain'}</span>
            {mayWrite && campaign.status === 'draft' && <SoftButton type="button" onClick={() => void act.run(campaign.id, 'submit')}>Submit</SoftButton>}
            {mayWrite && campaign.status === 'pending_approval' && (
              <span className="flex gap-2">
                <PrimaryButton type="button" className={densePrimary} onClick={() => void act.run(campaign.id, 'approve')}>Approve</PrimaryButton>
                <SoftButton type="button" onClick={() => void act.run(campaign.id, 'reject')}>Reject</SoftButton>
              </span>
            )}
            {mayWrite && campaign.status === 'approved' && (
              <span className="flex gap-2">
                <SoftButton type="button" onClick={() => void queue.run(campaign.id)}>Queue (no live send)</SoftButton>
                <SoftButton type="button" onClick={() => void act.run(campaign.id, 'pause')}>Pause</SoftButton>
                <SoftButton type="button" onClick={() => void act.run(campaign.id, 'suppress')}>Suppress</SoftButton>
              </span>
            )}
            {mayWrite && campaign.status === 'paused' && <SoftButton type="button" onClick={() => void act.run(campaign.id, 'resume')}>Resume</SoftButton>}
          </li>
        ))}
        {(campaigns.data?.campaigns ?? []).length === 0 && <EmptyState title="No campaigns." description="Create a draft. It cannot be sent without approval and consent." />}
      </ul>
      {mayWrite && (
        <div className="mt-4 grid gap-2">
          <TextArea label="Community announcement (never posts live)" value={announce} onChange={(event) => setAnnounce(event.target.value)} />
          <SoftButton type="button" disabled={!announce.trim() || community.pending} onClick={() => void community.run()}>Record announcement (no Discord post)</SoftButton>
        </div>
      )}
    </Panel>
  );
}

function AutomationsPane({ mayWrite }: { mayWrite: boolean }) {
  const state = useAsync<{ automations: Automation[]; triggers: string[] }>((signal) => get('/admin/crm/automations', undefined, signal), []);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('first_purchase');
  const create = useAction(async () => {
    await post('/admin/crm/automations', {
      name: name.trim(),
      trigger,
      graph: {
        start: 'msg',
        nodes: [{ id: 'msg', type: 'message', body: 'Thanks {{firstName}}' }, { id: 'task', type: 'task', title: 'Follow up' }],
        edges: [{ from: 'msg', to: 'task' }],
      },
    });
    setName('');
    state.reload();
  });
  return (
    <Panel title="Automations" description="Persistent workflow. Isolated run endpoint. Message effects never send while delivery is off.">
      {mayWrite && (
        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <Select label="Trigger" value={trigger} onChange={(event) => setTrigger(event.target.value)}>
            {(state.data?.triggers ?? ['first_purchase']).map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <PrimaryButton type="button" disabled={!name.trim() || create.pending} onClick={() => void create.run()}>Save draft workflow</PrimaryButton>
        </div>
      )}
      <ul className="grid gap-2">
        {(state.data?.automations ?? []).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-3 py-2 text-[14px] text-ink">
            <span>{row.name} · {row.trigger} · {row.paused ? 'paused' : row.status}</span>
            {mayWrite && (
              <span className="flex gap-1">
                {row.status !== 'active' && <SoftButton type="button" onClick={() => void post(`/admin/crm/automations/${encodeURIComponent(row.id)}/activate`, {}).then(() => state.reload())}>Activate</SoftButton>}
                {!row.paused && <SoftButton type="button" onClick={() => void post(`/admin/crm/automations/${encodeURIComponent(row.id)}/pause`, {}).then(() => state.reload())}>Pause</SoftButton>}
              </span>
            )}
          </li>
        ))}
        {(state.data?.automations ?? []).length === 0 && <EmptyState title="No automations." description="A draft records the graph. It does not send mail." />}
      </ul>
    </Panel>
  );
}

function TemplatesPane({ mayWrite }: { mayWrite: boolean }) {
  const state = useAsync<{ templates: { id: string; name: string; channel: string }[] }>((signal) => get('/admin/crm/templates', undefined, signal), []);
  const [name, setName] = useState('');
  const [body, setBody] = useState('Hello {{firstName}}');
  const create = useAction(async () => {
    await post('/admin/crm/templates', { name: name.trim(), body, channel: 'email' });
    setName('');
    state.reload();
  });
  return (
    <Panel title="Templates" description="Variables: email, firstName, lastName. Unknown variables are refused.">
      {mayWrite && (
        <div className="mb-4 grid gap-2">
          <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <TextArea label="Body" value={body} onChange={(event) => setBody(event.target.value)} />
          <PrimaryButton type="button" disabled={!name.trim() || create.pending} onClick={() => void create.run()}>Save template</PrimaryButton>
        </div>
      )}
      <ul className="grid gap-1 text-[14px] text-ink2">
        {(state.data?.templates ?? []).map((row) => <li key={row.id}>{row.name} · {row.channel}</li>)}
      </ul>
    </Panel>
  );
}

function TasksPane({ mayWrite }: { mayWrite: boolean }) {
  const state = useAsync<{ tasks: Task[] }>((signal) => get('/admin/crm/tasks', undefined, signal), []);
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const create = useAction(async () => {
    await post('/admin/crm/tasks', { userId: userId.trim(), title: title.trim() });
    setTitle('');
    state.reload();
  });
  const complete = useAction(async (id: string) => {
    await post(`/admin/crm/tasks/${encodeURIComponent(id)}/complete`, {});
    state.reload();
  });
  return (
    <Panel title="Follow-up tasks" description="Staff work, not customer-visible.">
      {mayWrite && (
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <TextInput label="Customer id" value={userId} onChange={(event) => setUserId(event.target.value)} />
          <TextInput label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <PrimaryButton type="button" disabled={!userId.trim() || title.trim().length < 2 || create.pending} onClick={() => void create.run()}>Create task</PrimaryButton>
        </div>
      )}
      <ul className="grid gap-2">
        {(state.data?.tasks ?? []).map((task) => (
          <li key={task.id} className="flex justify-between gap-2 rounded-2xl bg-s2 px-3 py-2 text-[14px] text-ink">
            {task.title} · {task.status}
            {mayWrite && task.status === 'open' && <SoftButton type="button" onClick={() => void complete.run(task.id)}>Done</SoftButton>}
          </li>
        ))}
        {(state.data?.tasks ?? []).length === 0 && <EmptyState title="No tasks." description="Automations and the customer record can create them." />}
      </ul>
    </Panel>
  );
}

function OpportunitiesPane() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'customers.write');
  const state = useAsync<{ opportunities: Opportunity[] }>((signal) => get('/admin/crm/opportunities', undefined, signal), []);
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const create = useAction(async () => {
    await post('/admin/crm/opportunities', { userId: userId.trim(), title: title.trim(), reason: reason.trim() });
    setTitle('');
    setReason('');
    state.reload();
  });
  return (
    <Panel title="Opportunities" description="Suggested from paid services and lifecycle. Not invented revenue.">
      {mayWrite && (
        <div className="mb-3 grid gap-2">
          <TextInput label="Customer id" value={userId} onChange={(event) => setUserId(event.target.value)} />
          <TextInput label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <TextInput label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          <PrimaryButton type="button" disabled={!userId.trim() || title.trim().length < 2 || reason.trim().length < 2 || create.pending} onClick={() => void create.run()}>Create opportunity</PrimaryButton>
        </div>
      )}
      <ul className="grid gap-2">
        {(state.data?.opportunities ?? []).map((row) => (
          <li key={row.id} className="rounded-2xl bg-s2 px-3 py-2 text-[14px] text-ink">{row.title} · {row.reason}</li>
        ))}
        {(state.data?.opportunities ?? []).length === 0 && <EmptyState title="No open opportunities." description="Open a customer Growth tab to derive them from facts." />}
      </ul>
    </Panel>
  );
}

function AnalyticsPane() {
  const state = useAsync<{
    snapshotAt: string;
    period: { acquisition: number; verified: number; firstPaid: number; paidOrders: number; collectedCents: number; refundedCents: number; taxCents: number; churnedSubscriptions: number; promotionRedemptions: number };
    snapshot: { mrrCents: number; marketingOptIn: number; marketingOptOut: number };
  }>((signal) => get('/admin/crm/analytics', undefined, signal), []);
  if (state.loading && !state.data) return <LoadingBlock rows={3} label="Loading analytics" />;
  if (state.error) return <ErrorState title="Analytics could not be loaded" message={state.error.message} onRetry={state.reload} />;
  const data = state.data!;
  return (
    <Panel title="Growth analytics" description="Period metrics use paidAt/createdAt in range. MRR is a current snapshot: yearly amounts are divided by 12. Nothing is estimated.">
      <p className="mb-2 text-[12px] text-ink3">Snapshot {data.snapshotAt}</p>
      <dl className="grid gap-2 sm:grid-cols-3">
        {([
          ['New customers (period)', data.period.acquisition],
          ['Verified (period)', data.period.verified],
          ['Paid customers (period)', data.period.firstPaid],
          ['Paid orders (period)', data.period.paidOrders],
          ['Collected cents (period)', data.period.collectedCents],
          ['Refunded cents (period)', data.period.refundedCents],
          ['Tax cents (period)', data.period.taxCents],
          ['Cancelled subscriptions (period)', data.period.churnedSubscriptions],
          ['MRR cents (snapshot)', data.snapshot.mrrCents],
          ['Marketing opt-in (snapshot)', data.snapshot.marketingOptIn],
          ['Marketing opt-out (snapshot)', data.snapshot.marketingOptOut],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-s2 px-4 py-3">
            <dt className="text-[12px] text-ink3">{label}</dt>
            <dd className="text-[18px] font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function RiskPane({ mayWrite }: { mayWrite: boolean }) {
  const state = useAsync<{ evaluations: { id: string; userId: string; score: number; level: string }[]; autoReject: boolean }>((signal) => get('/admin/crm/risk', undefined, signal), []);
  const [userId, setUserId] = useState('');
  const evaluate = useAction(async () => {
    await post(`/admin/crm/risk/${encodeURIComponent(userId)}/evaluate`, {});
    state.reload();
  });
  return (
    <Panel title="Risk review" description="Shadow mode. Scores never auto-reject. Shared IP and VPN remain staff-review signals. Raw fraud data is not a segment fact.">
      {mayWrite && (
        <div className="mb-3 flex gap-2">
          <TextInput label="Customer id" value={userId} onChange={(event) => setUserId(event.target.value)} />
          <PrimaryButton type="button" disabled={!userId.trim() || evaluate.pending} onClick={() => void evaluate.run()}>Evaluate</PrimaryButton>
        </div>
      )}
      <ul className="grid gap-1 text-[14px] text-ink2">
        {(state.data?.evaluations ?? []).map((row) => <li key={row.id}>{row.userId} · {row.level} · {row.score}</li>)}
      </ul>
    </Panel>
  );
}
