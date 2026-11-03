# UI functional inventory 4/4 (staff/secondary detail/shared)
Snapshot 48df705f110b46f7d2a7d90ef33e0cd0a289f74c; source-only; JSX and API string extraction does not prove clicking buttons succeeds.

## Staff (321 LOC; 3 action/dialog tags)
Titles: Staff and permissions
API call paths: /admin/staff · /admin/staff/${userId}
Linked admin paths: /admin/staff · /admin/staff/
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L164 <button
- L265 <button type="button" onClick={() => setSaving(member)} disabled={save.pending} className={densePrimary}>
- L272 <Field label="Role" htmlFor={`role-${member.userId}`}>
- L273 <select
- L305 <ConfirmDialog

## StaffSecurity (64 LOC; 1 action/dialog tags)
Titles: Staff security
API call paths: /admin/security
Linked admin paths: /admin/security
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L59 {mayWrite && <div><PrimaryButton onClick={() => void save.run()} disabled={save.pending}>{save.pending ? 'Saving…' : 'Save the rules'}</PrimaryButton></div>}

## ProductEditor (278 LOC; 4 action/dialog tags)
Titles: none
API call paths: /admin/products/${id} · /admin/products/${id}/change-preview · /admin/products/${id}/history · /admin/products/${id}/preview
Linked admin paths: /admin/products/
UI flags: {"cursor":true,"search":false,"filter":false,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L112 <Field label={label} htmlFor={`pe-${key}`} hint={props.hint}>
- L163 action={<button type="button" onClick={onClose} className={denseGhost}>Close</button>}
- L179 <Field label="Category" htmlFor="pe-category">
- L180 <select id="pe-category" value={form.category} disabled={readOnly || sold > 0 || !server} onChange={(event) => set('category', event.target.value)} className={denseSelect}>
- L186 <Field label="State" htmlFor="pe-lifecycle">
- L187 <select id="pe-lifecycle" value={form.lifecycle} disabled={readOnly} onChange={(event) => set('lifecycle', event.target.value)} className={denseSelect}>
- L244 <button type="button" className={denseGhost} disabled={busy || nothing || change.problems.length > 0} onClick={() => void review()}>Review the changes</button>
- L245 <button type="button" className={densePrimary} disabled={busy || !canSave} onClick={() => void save()}>Save the product</button>
- L246 <button type="button" className={denseGhost} disabled={busy || nothing} onClick={() => { setForm(toForm(product)); setPlan(null); }}>Discard</button>

## VpsOperations (64 LOC; 2 action/dialog tags)
Titles: Allocations · Billing check
API call paths: /admin/vps/allocations · /admin/vps/allocations/reconcile · /admin/vps-billing-check
Linked admin paths: /admin/vps/allocations · /admin/vps/allocations/reconcile · /admin/vps-billing-check
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L41 <button type="button" className={denseGhost} onClick={state.reload}>Read again</button>
- L43 <button type="button" className={denseDanger} disabled={busy} onClick={() => { setBusy(true); post('/admin/vps/allocations/reconcile').then(() => { toast.push('The ledger was updated. No machine was t

## abuse/AbuseInbox (354 LOC; 5 action/dialog tags)
Titles: Abuse reports
API call paths: /admin/abuse
Linked admin paths: /admin/abuse/ · /admin/abuse
UI flags: {"cursor":false,"search":true,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L214 <button type="button" className={denseGhost} onClick={() => onPage(page - 1)} disabled={page <= 1}>
- L217 <button type="button" className={denseGhost} onClick={() => onPage(page + 1)} disabled={page >= pages}>
- L262 <button
- L275 <Segmented
- L299 <button type="button" className={denseGhost} onClick={runSearch}>
- L303 <button

## abuse/AbuseDetail (676 LOC; 9 action/dialog tags)
Titles: Service · Customer · Related reports · Evidence · Investigation
API call paths: /admin/abuse/${id} · /admin/abuse/${id}/action · /admin/abuse/${id}/notes
Linked admin paths: /admin/services/ · /admin/customers/ · /admin/abuse/ · /admin/abuse
UI flags: {"cursor":true,"search":false,"filter":true,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L106 <PrimaryButton type="button" disabled={busy} onClick={() => onAction('investigating')}>
- L111 <SoftButton type="button" disabled={busy} onClick={() => onAction('resolve')}>
- L116 <SoftButton type="button" disabled={busy} onClick={() => onAction('dismiss')}>
- L121 <PrimaryButton type="button" disabled={busy} onClick={() => onAction('reopen')}>
- L126 <DangerButton type="button" disabled={busy} onClick={() => onAction('suspend')}>
- L371 <Field label={`Type ${serviceName} to confirm`} htmlFor="abuse-confirm-service">
- L388 <SoftButton onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
- L391 <button
- L587 <SoftButton type="button" disabled={noteBusy || !note.trim()} onClick={() => void addNote()}>
- L614 <ConfirmWithReason

## tickets/TicketInbox (683 LOC; 5 action/dialog tags)
Titles: Support inbox
API call paths: /admin/tickets
Linked admin paths: /admin/tickets · /admin/tickets?ticket=<id>
UI flags: {"cursor":true,"search":true,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L373 <button
- L469 <button
- L513 <Segmented
- L523 <Field label="Category" htmlFor="inbox-category">
- L524 <select
- L537 <Field label="Priority" htmlFor="inbox-priority">
- L538 <select
- L551 <Field label="Assignment" htmlFor="inbox-assignment">
- L552 <select
- L565 <Field label="Order" htmlFor="inbox-sort">
- L566 <select
- L584 <button
- L624 <select
- L637 <SoftButton onClick={previousPage} disabled={pageIndex === 0}>
- L640 <SoftButton onClick={nextPage} disabled={!hasMore}>

## tickets/TicketDetail (691 LOC; 4 action/dialog tags)
Titles: Conversation · Reply · The customer record · Ticket · Activity
API call paths: /tickets/${ticketId}/replies · /admin/support/replies · /tickets/${encodeURIComponent(ticketId)} · /admin/tickets · /admin/staff · /admin/support/departments · /admin/support/conversations/${encodeURIComponent(ticketId)}/department · /tickets/${encodeURIComponent(ticketId)}/status · /admin/tickets/${encodeURIComponent(ticketId)}/assign · /admin/support/conversations/${encodeURIComponent(ticketId)}/render
Linked admin paths: /admin/support/replies · /admin/tickets · /admin/staff · /admin/support/departments · /admin/support/conversations/ · /admin/tickets/ · /admin/customers/
UI flags: {"cursor":true,"search":true,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L205 <Segmented
- L228 <button
- L448 <Segmented
- L472 <select
- L552 <Field label="The state of the ticket" htmlFor="ticket-state">
- L553 <select
- L566 <SoftButton
- L598 <Field label="Move the ticket to" htmlFor="ticket-department">
- L599 <select id="ticket-department" value={department} onChange={(event) => setDepartment(event.target.value)} disabled={departments.loading} className={denseSelect}>
- L606 <SoftButton
- L634 <Field label="Assign the ticket to" htmlFor="ticket-owner">
- L635 <select
- L650 <SoftButton

## ContextPanel (74 LOC; 0 action/dialog tags)
Titles: The customer
API call paths: /admin/support/conversations/${ticketId}/context
Linked admin paths: /admin/support/conversations/ · /admin/tickets?ticket=
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
No literal controls

## FlowCanvas (255 LOC; 4 action/dialog tags)
Titles: none
API call paths: unresolved
Linked admin paths: none
UI flags: {"cursor":true,"search":true,"filter":false,"export":true,"urlState":false,"tab":true,"async":false}
Controls: 
- L191 <button type="button" onClick={() => zoomAt(1.2, (board.current?.clientWidth ?? 0) / 2, (board.current?.clientHeight ?? 0) / 2)} className="h-11 min-w-11 rounded-full border border-line bg-card px-3 t
- L192 <button type="button" onClick={() => zoomAt(1 / 1.2, (board.current?.clientWidth ?? 0) / 2, (board.current?.clientHeight ?? 0) / 2)} className="h-11 min-w-11 rounded-full border border-line bg-card px
- L193 <button type="button" onClick={fit} className="h-11 rounded-full border border-line bg-card px-4 text-[13.5px] font-medium text-ink hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-vi
- L223 <button

## EmailTools (87 LOC; 3 action/dialog tags)
Titles: Events and templates
API call paths: /admin/email-templates/${encodeURIComponent(id)}/versions · /admin/email-templates/coverage
Linked admin paths: /admin/email-templates/ · /admin/email-templates/coverage
UI flags: {"cursor":true,"search":false,"filter":false,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L36 <button type="button" className={denseGhost} disabled={busy} onClick={() => void act(async () => setPreview((await post<{ preview: { subject: string; html: string; text: string } }>(`${path}/preview`,
- L38 <button type="button" className={denseGhost} disabled={busy} onClick={() => void act(async () => { const result = await post<{ sentTo: string; state: string }>(`${path}/test`, { draft }); toast.push(`
- L56 <button type="button" className={denseGhost} disabled={busy} onClick={() => void act(async () => { await post(`${path}/restore`, { versionId: version.id }); toast.push('That wording is back.', 'ok'); 

## SupportAi (104 LOC; 3 action/dialog tags)
Titles: Assistant for the staff · Assistant
API call paths: /admin/support/ai · /admin/support/conversations/${ticketId}/ai
Linked admin paths: /admin/support/ai · /admin/support/conversations/
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L63 {mayEdit && <PrimaryButton onClick={() => void save.run()} disabled={save.pending}>Save</PrimaryButton>}
- L89 {ACTIONS.map((action) => <SoftButton key={action.value} onClick={() => void run.run(action.value)} disabled={run.pending}>{action.label}</SoftButton>)}
- L97 {result.action === 'suggest_reply' && <SoftButton onClick={() => onUse(result.text)}>Put it in the reply box</SoftButton>}
