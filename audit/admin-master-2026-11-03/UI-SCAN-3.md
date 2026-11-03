# UI functional inventory 3/4 (operations/comms/settings)
Snapshot 48df705f110b46f7d2a7d90ef33e0cd0a289f74c; source-only; JSX and API string extraction does not prove clicking buttons succeeds.

## Ops (977 LOC; 10 action/dialog tags)
Titles: Offsite backups · Free services held for review · Payment webhooks that failed · Operations · Checks · Alerts · Channels · Incident
API call paths: /admin/backups/health · /admin/promotion-holds · /admin/customers/${encodeURIComponent(userId)}/promo-clearance · /admin/webhooks/failed · /admin/webhooks/replay · /ops/health · /ops/alerts · /ops/channels · /ops/checks/${encodeURIComponent(id)}/ack · /ops/incident
Linked admin paths: /admin/backups/health · /admin/promotion-holds · /admin/customers/ · /admin/webhooks/failed · /admin/webhooks/replay
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L354 <button type="button" onClick={() => onAcknowledge(check)} className={denseSoft}>
- L390 <button type="button" onClick={() => onAcknowledge(check)} className={denseSoft}>
- L609 <button type="button" className={hold.cleared ? denseSoft : densePrimary} disabled={clear.pending} onClick={() => void clear.run(hold.userId, !hold.cleared)}>
- L641 action={mayWrite && rows.length > 1 ? <button type="button" className={densePrimary} disabled={replay.pending} onClick={() => void replay.run()}>Replay all</button> : undefined}
- L660 <button type="button" className={denseSoft} disabled={replay.pending} onClick={() => void replay.run(event.eventId)}>Replay</button>
- L771 <button type="button" onClick={refresh} className={denseGhost}>
- L845 <Field label="What is happening" htmlFor="ops-incident-message" hint="Written in the words of the operator.">
- L856 <Field label="Until" htmlFor="ops-incident-until" hint="Optional. Local time, sent as UTC. Empty means it has no end yet.">
- L867 <button
- L875 <button type="button" onClick={() => setClearing(true)} disabled={clear.pending} className={denseDanger}>
- L899 <ConfirmWithReason
- L918 <ConfirmDialog

## Infrastructure (354 LOC; 2 action/dialog tags)
Titles: Infrastructure · Nodes · Eggs
API call paths: /admin/infrastructure · /admin/infrastructure/sync
Linked admin paths: /admin/infrastructure · /admin/infrastructure/sync
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L106 <button type="button" onClick={() => setConfirming(true)} disabled={sync.pending} className={densePrimary}>
- L342 <ConfirmDialog

## Capacity (299 LOC; 0 action/dialog tags)
Titles: Capacity and revenue · Nodes · Revenue by product
API call paths: /admin/capacity
Linked admin paths: /admin/capacity
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
No literal controls

## Queues (70 LOC; 3 action/dialog tags)
Titles: none
API call paths: /admin/queues · /admin/queues/${queue.name}/failed · /admin/queues/${queue.name}/jobs/${job.id}/retry · /admin/queues/${queue.name}/jobs/${job.id}
Linked admin paths: /admin/queues · /admin/queues/
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L45 <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => { if (window.confirm(`Remove all ${queue.counts.failed ?? queue.failed.length} failed jobs of ${queue.label}? They
- L57 <SoftButton disabled={busy !== null} onClick={() => void act(`${queue.name}${job.id}`, () => post(`/admin/queues/${queue.name}/jobs/${job.id}/retry`), 'The job was queued again.')}>Retry</SoftButton>
- L58 <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => void act(`${queue.name}${job.id}`, () => del(`/admin/queues/${queue.name}/jobs/${job.id}`), 'The job was removed.'

## Tools (134 LOC; 7 action/dialog tags)
Titles: Jobs that failed for good · Monthly price of the services · Email delivery
API call paths: /admin/dead-letters · /admin/dead-letters/${encodeURIComponent(target.entry.id)}/${target.action} · /admin/instances/reconcile-prices · /admin/email/delivery
Linked admin paths: /admin/dead-letters · /admin/dead-letters/ · /admin/instances/reconcile-prices · /admin/email/delivery
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L46 <button type="button" className={denseGhost} onClick={() => setTarget({ entry, action: 'requeue' })}>Queue again</button>
- L47 <button type="button" className={denseGhost} onClick={() => setTarget({ entry, action: 'close' })}>Close</button>
- L54 <ConfirmDialog
- L89 <button type="button" className={denseGhost} disabled={busy} onClick={() => void run(true)}>Check what would change</button>
- L90 {result?.dryRun && result.wouldCorrect > 0 && <button type="button" className={denseDanger} disabled={busy} onClick={() => setConfirm(true)}>Correct {result.wouldCorrect} services</button>}
- L100 <ConfirmDialog open={confirm} title="Correct the prices?" description="The figure of every service listed is replaced by the price of its configuration, and each change is written to the journal. Subs
- L116 <button type="button" className={`${denseGhost} mt-3`} onClick={state.reload}>Refresh</button>

## Audit (269 LOC; 2 action/dialog tags)
Titles: Audit log
API call paths: /admin/audit
Linked admin paths: /admin/audit
UI flags: {"cursor":true,"search":true,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L114 <button
- L129 <Field
- L256 {list.loadingMore ? <p role="status" className="text-[13px] text-ink3">Loading more…</p> : <SoftButton onClick={list.loadMore}>Load more</SoftButton>}

## EmailNotifications (2110 LOC; 11 action/dialog tags)
Titles: The overview · Messages · Events · Templates · The groups · The preferences · The activity of the last days
API call paths: /admin/notifications/deliveries · /admin/notifications/events · /admin/notifications/deliveries/${encodeURIComponent(delivery.key)}/retry · /admin/notifications/events/${encodeURIComponent(event.id)}/retry · /admin/notifications/templates/${encodeURIComponent(id)}/validate · /admin/notifications/test-send · /admin/notifications/overview · /admin/notifications/templates · /admin/notifications/categories · /admin/notifications/trends · /admin/notifications/preferences
Linked admin paths: /admin/notifications/deliveries · /admin/notifications/events · /admin/notifications/deliveries/ · /admin/notifications/events/ · /admin/notifications/templates/ · /admin/notifications/test-send · /admin/notifications/overview · /admin/notifications/templates · /admin/notifications/categories · /admin/notifications/trends · /admin/notifications/preferences
UI flags: {"cursor":true,"search":true,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L720 <button type="button" onClick={() => onRetry(delivery)} className={denseGhost}>
- L775 <button type="button" onClick={() => onRetry(delivery)} className={denseGhost}>
- L883 <button type="button" onClick={() => onRetry(event)} className={denseGhost}>
- L938 <button type="button" onClick={() => onRetry(event)} className={denseGhost}>
- L1026 <button type="button" onClick={() => onPreview(template)} className={denseGhost}>
- L1056 <button type="button" onClick={() => onPreview(template)} className={denseGhost}>
- L1107 <Field
- L1124 <button type="button" onClick={onPreview} disabled={busy || mayPreview === false} className={densePrimary}>
- L1207 <Field label="Address" htmlFor="notifications-test-to" hint="The one address that receives the test message.">
- L1220 <Field label="Template" htmlFor="notifications-test-template">
- L1221 <select
- L1236 <Field
- L1254 <button type="button" onClick={onSend} disabled={busy || !ready || maySend === false} className={densePrimary}>
- L1457 <button type="button" onClick={onLoadMore} disabled={pending} className={denseSoft}>
- L1499 <ConfirmDialog
- L1531 <ConfirmDialog
- L1776 <Segmented ariaLabel="The panels of the notifications" options={TABS} value={tab} onChange={setTab} />
- L1804 <Field label="State" htmlFor="notifications-delivery-state">
- L1805 <select
- L1818 <Field label="Kind" htmlFor="notifications-delivery-kind">
- L1830 <Field label="Recipient" htmlFor="notifications-delivery-recipient">
- L1889 <Field label="Kind" htmlFor="notifications-event-kind">
- L1901 <Field label="State" htmlFor="notifications-event-state">
- L1902 <select
- L1915 <Field label="Customer" htmlFor="notifications-event-customer">

## EmailTemplates (118 LOC; 2 action/dialog tags)
Titles: Email wording
API call paths: /admin/email-templates · /admin/email-templates/${encodeURIComponent(current.id)}
Linked admin paths: /admin/email-templates · /admin/email-templates/
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L71 <Select label="Template" value={id} onChange={(event) => setId(event.target.value)}>
- L100 <PrimaryButton onClick={() => void save.run()} disabled={save.pending}>{save.pending ? 'Saving…' : 'Save the wording'}</PrimaryButton>
- L101 {current.override && <SoftButton onClick={() => void reset.run()} disabled={reset.pending}>Back to the original</SoftButton>}

## EmailTools (87 LOC; 3 action/dialog tags)
Titles: Events and templates
API call paths: /admin/email-templates/${encodeURIComponent(id)}/versions · /admin/email-templates/coverage
Linked admin paths: /admin/email-templates/ · /admin/email-templates/coverage
UI flags: {"cursor":true,"search":false,"filter":false,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L36 <button type="button" className={denseGhost} disabled={busy} onClick={() => void act(async () => setPreview((await post<{ preview: { subject: string; html: string; text: string } }>(`${path}/preview`,
- L38 <button type="button" className={denseGhost} disabled={busy} onClick={() => void act(async () => { const result = await post<{ sentTo: string; state: string }>(`${path}/test`, { draft }); toast.push(`
- L56 <button type="button" className={denseGhost} disabled={busy} onClick={() => void act(async () => { await post(`${path}/restore`, { versionId: version.id }); toast.push('That wording is back.', 'ok'); 

## Content (122 LOC; 5 action/dialog tags)
Titles: Words of the public site
API call paths: /admin/content · /admin/content/${encodeURIComponent(key)}
Linked admin paths: /admin/content · /admin/content/
UI flags: {"cursor":true,"search":false,"filter":false,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L80 <Select label="Block" value={key} onChange={(event) => setKey(event.target.value)}>
- L92 <button type="button" className={denseGhost} disabled={busy || parsed.error !== null} onClick={() => void run(() => api(`${base}/draft`, { method: 'PUT', body: { data: parsed.value } }), 'The draft wa
- L93 <button type="button" className={densePrimary} disabled={busy || !current.draft} onClick={() => void run(() => post(`${base}/publish`), 'Published. The site shows it within a minute.')}>Publish the dr
- L94 <button type="button" className={denseGhost} disabled={busy || !current.draft} onClick={() => void run(() => api(`${base}/draft`, { method: 'DELETE' }), 'The draft was discarded.')}>Discard the draft<
- L95 <button type="button" className={denseGhost} disabled={busy || !current.published} onClick={() => void run(() => post(`${base}/unpublish`), 'Taken down. The site uses the words of the code.')}>Take do
- L109 {mayWrite && row.status === 'ARCHIVED' && <button type="button" className={denseGhost} disabled={busy} onClick={() => void run(() => post(`${base}/rollback`, { revisionId: row.id }), 'That version is 

## Commerce (143 LOC; 4 action/dialog tags)
Titles: Add-ons · History of the prices · Yearly discount
API call paths: /admin/options · /admin/options/${option.id} · /admin/pricing/history · /admin/settings
Linked admin paths: /admin/options · /admin/options/ · /admin/pricing/history · /admin/settings
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L55 <button type="button" className={denseGhost} disabled={busy || !changed} onClick={() => void run(() => api(`/admin/options/${option.id}`, { method: 'PATCH', body: { amount: Number(typed) } }), 'The am
- L56 <button type="button" className={denseGhost} disabled={busy} onClick={() => void run(() => api(`/admin/options/${option.id}`, { method: 'PATCH', body: { active: !option.active } }), option.active ? 'T
- L65 <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void run(async () => { await post('/admin/options', { code: draft.code, name: draft.name, amount: Number
- L66 <Field label="Code" htmlFor="addon-code" hint="Lowercase, dashes. It never changes."><input id="addon-code" className={denseInput} value={draft.code} onChange={(event) => setDraft({ ...draft, code: ev
- L67 <Field label="Name" htmlFor="addon-name"><input id="addon-name" className={denseInput} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field>
- L68 <Field label="Amount (cents)" htmlFor="addon-amount"><input id="addon-amount" className={`${denseInput} w-28`} type="number" min={0} value={draft.amount} onChange={(event) => setDraft({ ...draft, amou
- L69 <button type="submit" className={densePrimary} disabled={busy}>Create the add-on</button>
- L133 <Field label="Percent (0 to 50)" htmlFor="yearly-discount" error={valid ? undefined : 'Use a whole number from 0 to 50.'}>
- L136 {mayWrite && <button type="button" className={densePrimary} disabled={!changed || busy} onClick={save}>Save</button>}

## Settings (467 LOC; 8 action/dialog tags)
Titles: Accounting export · Company and tax · Configuration coverage · Where platform behaviour is configured · Settings · Who owns each setting
API call paths: /admin/settings · /admin/settings/${encodeURIComponent(key)}
Linked admin paths: /admin/products · /admin/pricing · /admin/promotions · /admin/infrastructure · /admin/incidents · /admin/mail/plans · /admin/email-templates · /admin/notifications · /admin/staff · /admin/settings · /admin/settings/
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L85 <Field label="From" htmlFor="acct-from">
- L88 <Field label="To" htmlFor="acct-to">
- L125 <Field key={field.key} label={field.label} htmlFor={`company-${field.key}`} hint={field.hint}>
- L142 <button type="button" className={densePrimary} disabled={save.pending} onClick={() => void save.run()}>{save.pending ? 'Saving…' : 'Save the company details'}</button>
- L165 <Field key={field.key} label={field.label} htmlFor={`operator-${field.key}`} hint={field.hint}>
- L175 {mayWrite && <div><button type="button" className={densePrimary} disabled={save.pending} onClick={() => void save.run()}>{save.pending ? 'Saving…' : `Save ${group.title.toLowerCase()}`}</button></div>
- L311 <button type="button" onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} className={`${section === id ? densePrimary : denseGhost} whitespace-nowrap`}>{label}</button>
- L340 <button type="button" onClick={addRow} className={denseGhost}>
- L357 <Field label="Key" htmlFor={`setting-key-${row.id}`}>
- L374 <Field label="Value" htmlFor={`setting-value-${row.id}`} hint="JSON when it parses, plain text otherwise.">
- L391 <button
- L407 <button type="button" onClick={submit} disabled={save.pending} className={densePrimary}>
- L410 <button type="button" onClick={addRow} className={denseGhost}>
- L451 <ConfirmDialog
