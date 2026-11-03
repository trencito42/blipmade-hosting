# UI functional inventory 1/4 (commerce and hosting)
Snapshot 48df705f110b46f7d2a7d90ef33e0cd0a289f74c; source-only; JSX and API string extraction does not prove clicking buttons succeeds.

## Overview (439 LOC; 2 action/dialog tags)
Titles: No accounts yet · Go to
API call paths: /auth/session · /admin/overview
Linked admin paths: /admin/overview · /admin/services · /admin/customers · /admin/orders · /admin/tickets · /admin/infrastructure · /admin/audit
UI flags: {"cursor":true,"search":false,"filter":false,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L283 <Field label={reasonLabel} error={error ?? undefined} htmlFor="admin-confirm-reason">
- L297 <SoftButton onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
- L300 <button

## Customers (324 LOC; 6 action/dialog tags)
Titles: Customers
API call paths: /admin/tags · /admin/customers · /admin/customers/bulk-tags
Linked admin paths: /admin/tags · /admin/customers · /admin/customers/bulk-tags · /admin/customers/
UI flags: {"cursor":true,"search":true,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L180 <button
- L193 <Field label="Accounts" htmlFor="customer-role">
- L194 <select id="customer-role" value={role} onChange={(event) => setRole(event.target.value as typeof role)} className={denseInput}>
- L201 <Field label="Tag" htmlFor="customer-tag">
- L202 <select id="customer-tag" value={tag} onChange={(event) => setTag(event.target.value)} className={denseInput}>
- L208 <Field label="Search" htmlFor="customer-search" hint="Matches the name or the e-mail address.">
- L225 <button type="button" className={denseGhost} disabled={bulkBusy || !bulkTag.trim()} onClick={() => void bulk('add')}>Add the tag</button>
- L226 <button type="button" className={denseGhost} disabled={bulkBusy || !bulkTag.trim()} onClick={() => void bulk('remove')}>Remove the tag</button>
- L227 <button type="button" className={denseGhost} onClick={() => setSelected([])}>Clear</button>
- L307 <button type="button" className={denseGhost} disabled={pageCursors.length === 0 || state.loading} onClick={() => setPageCursors((current) => current.slice(0, -1))}>Previous</button>
- L308 <button type="button" className={denseGhost} disabled={!pagination?.hasMore || !pagination.nextCursor || state.loading} onClick={() => {

## CustomerDetail (1129 LOC; 28 action/dialog tags)
Titles: Account access · Instances · Invoices · Tickets · Orders · Account tools · Subscriptions · Notes and tags · Risk · Credit · Game panel access
API call paths: /admin/customers/${customerId}/impersonate · /admin/customers/${customerId}/suspend · /admin/customers/${id} · /admin/customers/${customerId}/name · /admin/customers/${customerId}/verify-email · /admin/customers/${customerId}/send-password-reset · /admin/customers/${customerId}/reset-2fa · /admin/customers/${customerId}/revoke-sessions · /admin/customers/${customerId}/subscriptions · /admin/subscriptions/${id}/${action} · /admin/customers/${customerId}/notes · /admin/customers/${customerId}/tags · /admin/customers/${customerId}/notes/${note.id} · /admin/customers/${customerId}/risk · /admin/customers/${customerId}/risk-decision · /admin/customers/${customerId}/credit · /admin/invoices/${invoice.id}/confirm-collection · /admin/customers/${customerId}/panel · /admin/customers/${customerId}/panel/credential
Linked admin paths: /admin/customers/ · /admin/customers · /admin/services/ · /admin/tickets?ticket= · /admin/orders/ · /admin/subscriptions/ · /admin/invoices/
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L174 <button
- L182 <button
- L192 <button type="button" onClick={() => void actAs()} disabled={acting} className={denseGhost}>
- L208 <ConfirmWithReason
- L376 <button
- L755 <button type="button" className={denseGhost} disabled={busy !== null || !firstName.trim() || !lastName.trim()} onClick={() => void run('name', () => patch(`/admin/customers/${customerId}/name`, { firs
- L759 <button type="button" className={denseGhost} disabled={busy !== null} onClick={() => void run('verify', () => post(`/admin/customers/${customerId}/verify-email`), 'The address is marked as verified.')
- L761 <button type="button" className={denseGhost} disabled={busy !== null} onClick={() => void run('reset', () => post(`/admin/customers/${customerId}/send-password-reset`), 'The reset link was queued for 
- L762 <button type="button" className={denseGhost} disabled={busy !== null} onClick={() => void run('reset2fa', () => post(`/admin/customers/${customerId}/reset-2fa`), 'Two-factor was reset and the sessions
- L763 <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => void run('sessions', () => post(`/admin/customers/${customerId}/revoke-sessions`), 'Every session of the customer 
- L820 <button type="button" className={denseGhost} disabled={busy !== null} onClick={() => void act(row.id, 'resume')}>Resume</button>
- L822 <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => void act(row.id, 'cancel')}>End at period end</button>
- L862 {mayWrite && <button type="button" aria-label={`Remove the tag ${entry}`} className="text-ink3 hover:text-ink" onClick={() => void run(() => put(`/admin/customers/${customerId}/tags`, { tags: tags.fil
- L866 <form className="flex items-center gap-1.5" onSubmit={(event) => { event.preventDefault(); if (tag.trim()) void run(() => put(`/admin/customers/${customerId}/tags`, { tags: [...tags, tag.trim()] }).th
- L868 <button type="submit" className={denseGhost} disabled={busy || !tag.trim()}>Add</button>
- L875 <div><button type="button" className={denseGhost} disabled={busy || !body.trim()} onClick={() => void run(() => post(`/admin/customers/${customerId}/notes`, { body }).then(() => setBody('')))}>Add the
- L885 {mayWrite && <button type="button" className="hover:text-ink" onClick={() => void run(() => del(`/admin/customers/${customerId}/notes/${note.id}`))}>Delete</button>}
- L919 {mayWrite && <div className="flex flex-wrap gap-2"><button type="button" className={denseGhost} onClick={() => { setReason(''); setDecision('approved'); }}>Approve</button><button type="button" classN
- L932 <ConfirmWithReason open={decision !== null} title={decision === 'blocked' ? 'Block this customer?' : `Mark risk as ${decision ?? 'reviewed'}?`} description={decision === 'blocked' ? 'The account is su
- L977 <button type="button" className={denseDanger} disabled={!valid} onClick={() => setConfirming(true)}>Give credit</button>
- L994 <ConfirmDialog
- L1045 <button type="button" className={denseGhost} onClick={() => setOpen(true)}>Mark as paid</button>
- L1046 <ConfirmWithReason
- L1110 <button type="button" className={denseGhost} disabled={busy || token.trim().length < 20} onClick={() => void run(() => post(`/admin/customers/${customerId}/panel/credential`, { token: token.trim() }),
- L1111 {panel.hasCredential && <button type="button" className={denseDanger} disabled={busy} onClick={() => setForgetting(true)}>Forget key</button>}
- L1117 <ConfirmDialog

## Orders (402 LOC; 7 action/dialog tags)
Titles: Orders
API call paths: /admin/orders · /admin/orders/${order.id}/refund · /admin/orders/${partial.id}/partial-refund
Linked admin paths: /admin/orders · /admin/orders/
UI flags: {"cursor":true,"search":true,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L148 <button type="button" className={denseGhost} onClick={() => { setPartReason(''); setPartAmount(''); setPartial(order); }}>Refund part</button>
- L149 <button
- L171 <button
- L191 <Segmented
- L328 <button type="button" className={denseGhost} disabled={pageCursors.length === 0 || state.loading} onClick={() => setPageCursors((current) => current.slice(0, -1))}>Previous</button>
- L329 <button type="button" className={denseGhost} disabled={!pagination?.hasMore || !pagination.nextCursor || state.loading} onClick={() => {
- L345 <ConfirmDialog
- L371 <ConfirmWithReason

## OrderDetail (117 LOC; 3 action/dialog tags)
Titles: Items and services · Payments · Invoices · Payment webhooks · Customer notifications
API call paths: /admin/orders/${id}
Linked admin paths: /admin/orders/ · /admin/orders · /admin/customers/ · /admin/promotions/ · /admin/services/
UI flags: {"cursor":true,"search":false,"filter":true,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L52 {mayWriteOrders && ['paid', 'fulfilled'].includes(order.status) && order.fulfillmentStatus !== 'fulfilled' && <button type="button" className={denseGhost} disabled={busy} onClick={() => { setReason(''
- L53 {mayWriteOrders && ['paid', 'fulfilled'].includes(order.status) && !order.payments.some((payment) => payment.status === 'refunded') && <button type="button" className={denseDanger} disabled={busy} onC
- L114 <ConfirmWithReason open={mayWriteOrders && action !== null} title={action === 'refund' ? `Refund ${order.number}?` : `Retry delivery for ${order.number}?`} description={action === 'refund' ? 'Stripe r

## Promotions (599 LOC; 7 action/dialog tags)
Titles: Promotions
API call paths: /admin/promotions · /admin/promotions/${promotion.id}
Linked admin paths: /admin/promotions · /admin/promotions/
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L196 <button type="button" onClick={() => setCreating((value) => !value)} aria-expanded={creating} className={densePrimary}>
- L206 <Field label="Code" htmlFor="promotion-code" error={codeError}>
- L217 <Field label="Type" htmlFor="promotion-type">
- L218 <select
- L234 <Field
- L257 <Field label="Redemption cap" htmlFor="promotion-cap" error={capError} hint="Empty means no cap.">
- L272 <Field
- L296 <Field label="Starts at" htmlFor="promotion-start" hint="Optional. Local time, sent as UTC.">
- L305 <Field label="Ends at" htmlFor="promotion-end" hint="Optional. Local time, sent as UTC.">
- L317 <button
- L325 <button type="button" onClick={() => setConfirming(true)} disabled={create.pending} className={densePrimary}>
- L476 <ConfirmDialog
- L549 <Field
- L579 <button type="button" onClick={() => setConfirming(true)} disabled={!changed || save.pending} className={densePrimary}>
- L582 <button type="button" onClick={onClose} className={denseSoft}>
- L587 <ConfirmDialog

## PromotionDetail (83 LOC; 3 action/dialog tags)
Titles: Campaign settings · Redemptions · Audit trail
API call paths: /admin/promotions/${id} · /admin/promotions/${promotion.id}
Linked admin paths: /admin/promotions/ · /admin/promotions · /admin/customers/ · /admin/orders/
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L63 <Field label="Total redemption cap" htmlFor="campaign-cap" hint={`At least ${promotion.stats.reserved}, or empty for no cap.`}><input id="campaign-cap" className={denseInput} inputMode="numeric" value
- L64 <Field label="Limit per account" htmlFor="campaign-per-user" hint="Empty means no account limit. Card identity still protects 100% campaigns."><input id="campaign-per-user" className={denseInput} inpu
- L65 <Field label="Starts at" htmlFor="campaign-start"><input id="campaign-start" type="datetime-local" className={denseInput} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></Fie
- L66 <Field label="Ends at" htmlFor="campaign-end"><input id="campaign-end" type="datetime-local" className={denseInput} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></Field>
- L68 <div className="mt-3 flex flex-wrap gap-2"><button type="button" aria-pressed={active} onClick={() => setActive((value) => !value)} className={active ? denseGhost : denseDanger}>{active ? 'Active — cl
- L80 <ConfirmDialog open={confirming} title={`Save ${promotion.code}?`} description={`The campaign will be ${active ? 'active' : 'paused'}, with ${max || 'no'} total cap and ${perUser || 'no'} per-account 

## Reports (91 LOC; 0 action/dialog tags)
Titles: Income · New customers · Cancellations · What sells · Top customers
API call paths: /admin/reports
Linked admin paths: /admin/reports
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
No literal controls

## Services (392 LOC; 5 action/dialog tags)
Titles: Services · Import a server
API call paths: /admin/services · /admin/instances/${instanceId}/retry · /admin/instances/import
Linked admin paths: /admin/services · /admin/instances/ · /admin/services/ · /admin/customers/ · /admin/instances/import
UI flags: {"cursor":false,"search":true,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L140 <button
- L153 <Segmented ariaLabel="Filter services by status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
- L155 <Field label="Search" htmlFor="service-search" hint="Matches the instance name.">
- L252 render: (service: AdminService) => ['pending', 'provisioning', 'failed', 'degraded'].includes(service.status) ? <button type="button" onClick={() => openRetry(service)} className={denseDanger}>Retry p
- L298 <div className="mt-3 flex flex-wrap gap-2"><Link to={`/admin/services/${service.id}`} className={denseGhost}>Open control</Link>{mayWrite && ['pending', 'provisioning', 'failed', 'degraded'].includes(
- L316 <ConfirmWithReason
- L378 <Field label="Panel server number" htmlFor="import-server">
- L381 <Field label="Customer id" htmlFor="import-customer" hint="The id in the address of the customer page.">
- L384 <Field label="Name (optional)" htmlFor="import-name">
- L387 <button type="button" className={denseGhost} disabled={!valid || busy} onClick={() => void submit()}>Import server</button>

## ServiceDetail (116 LOC; 9 action/dialog tags)
Titles: Management · Commercial chain · Safety and support · Timeline
API call paths: /admin/services/${id} · /admin/instances/${service.id}/feature-limits · /admin/instances/${service.id}/retry · /admin/instances/${service.id}/reinstall · /admin/instances/${service.id}/suspend · /admin/instances/${service.id}/power
Linked admin paths: /admin/services/ · /admin/services · /admin/customers/ · /admin/instances/ · /admin/orders/ · /admin/tickets?ticket=
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L74 {service.pterodactylServerId && <button type="button" className={denseGhost} disabled={busy || service.runtimeState === 'running'} onClick={() => { setReason(''); setAction('start'); }}>Start</button>
- L75 {service.pterodactylServerId && <button type="button" className={denseGhost} disabled={busy || service.runtimeState !== 'running'} onClick={() => { setReason(''); setAction('restart'); }}>Restart</but
- L76 {service.pterodactylServerId && <button type="button" className={denseGhost} disabled={busy || service.runtimeState !== 'running'} onClick={() => { setReason(''); setAction('stop'); }}>Stop</button>}
- L77 {service.pterodactylServerId && <button type="button" className={denseDanger} disabled={busy || service.runtimeState !== 'running'} onClick={() => { setReason(''); setAction('kill'); }}>Force stop</bu
- L78 {retryable.has(service.status) && <button type="button" className={denseGhost} disabled={busy} onClick={() => { setReason(''); setAction('retry'); }}>Retry provisioning</button>}
- L79 {service.pterodactylServerId && <button type="button" className={denseGhost} disabled={busy} onClick={() => { setReason(''); setAction(suspended ? 'resume' : 'suspend'); }}>{suspended ? 'Resume servic
- L80 {service.pterodactylServerId && <button type="button" className={denseDanger} disabled={busy} onClick={() => { setReason(''); setAction('reinstall'); }}>Reinstall</button>}
- L88 <button type="button" className={denseGhost} disabled={busy || databaseReason.trim().length < 3 || [databases, backups, allocations].some((value) => value !== '' && !/^\d+$/.test(value))} onClick={() 
- L113 <ConfirmWithReason open={action !== null} title={action === 'retry' ? `Retry provisioning for ${service.name}?` : action === 'reinstall' ? `Reinstall ${service.name}?` : action === 'resume' ? `Resume 

## Vps (265 LOC; 11 action/dialog tags)
Titles: Servers
API call paths: /admin/vps/${id}/usage · /vps/plans · /admin/vps/${server.id}/plan-quote · /admin/vps/${server.id}/plan · /admin/vps/${server.id}/resources · /admin/vps · /admin/vps/${server.id}/power · /admin/vps/${server.id}/retry · /admin/vps/${current.server.id} · /admin/vps/${current.server.id}/reinstall
Linked admin paths: /admin/vps/ · /admin/vps · /admin/customers/
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L94 <select aria-label={`Plan for ${server.name}`} value={slug} onChange={(event) => choose(event.target.value)} className={`${denseGhost} w-auto`}>
- L104 <button type="button" className={denseDanger} disabled={busy} onClick={() => {
- L129 if (!open) return <button type="button" className={denseGhost} onClick={() => setOpen(true)}>Adjust resources (free)</button>;
- L132 <form
- L154 <button type="submit" className={denseDanger} disabled={busy || !free || reason.trim().length < 10}>Apply the adjustment</button>
- L155 <button type="button" className={denseGhost} onClick={() => setOpen(false)}>Cancel</button>
- L215 <button type="button" className={denseGhost} disabled={busy !== null || server.power === 'running'} onClick={() => void run(server.id, () => post(`/admin/vps/${server.id}/power`, { action: 'start' }),
- L216 <button type="button" className={denseGhost} disabled={busy !== null || server.power !== 'running'} onClick={() => void run(server.id, () => post(`/admin/vps/${server.id}/power`, { action: 'reboot' })
- L217 <button type="button" className={denseGhost} disabled={busy !== null || server.power !== 'running'} onClick={() => void run(server.id, () => post(`/admin/vps/${server.id}/power`, { action: 'stop' }), 
- L218 <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => setConfirm({ kind: 'reinstall', server })}>Reinstall</button>
- L222 <button type="button" className={denseGhost} disabled={busy !== null} onClick={() => void run(server.id, () => post(`/admin/vps/${server.id}/retry`), 'Build queued again.')}>Build again</button>
- L227 <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => setConfirm({ kind: 'destroy', server })}>Delete the machine</button>
- L240 <ConfirmDialog

## Mail (1589 LOC; 7 action/dialog tags)
Titles: Mail health · Domains · Jobs · Mail services · The use of the platform
API call paths: /admin/mail/services/${encodeURIComponent(service.id)}/${action} · /admin/mail/services · /admin/mail/usage
Linked admin paths: /admin/mail/services/ · /admin/mail/services · /admin/mail/usage · /admin/mail/plans
UI flags: {"cursor":true,"search":true,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L427 <button
- L483 <button
- L975 <button type="button" onClick={() => onRepeat(job)} className={denseGhost}>
- L1000 <ConfirmDialog
- L1054 <button type="button" onClick={onLoadMore} disabled={pending} className={denseSoft}>
- L1356 <Field label="Search" htmlFor="admin-mail-search" hint="The name of the domain or the address of the customer.">
- L1368 <Field label="State" htmlFor="admin-mail-domain-state">
- L1369 <select
- L1416 <Field label="State" htmlFor="admin-mail-job-state">
- L1417 <select
- L1544 <ConfirmWithReason
- L1568 <ConfirmDialog
