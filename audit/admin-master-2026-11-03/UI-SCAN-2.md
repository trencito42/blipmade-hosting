# UI functional inventory 2/4 (catalog/support/trust)
Snapshot 48df705f110b46f7d2a7d90ef33e0cd0a289f74c; source-only; JSX and API string extraction does not prove clicking buttons succeeds.

## MailProducts (1123 LOC; 10 action/dialog tags)
Titles: Plans of hosted mail
API call paths: /admin/mail/plans · /admin/mail/plans/${encodeURIComponent(id)}
Linked admin paths: /admin/mail/plans · /admin/mail/plans/ · /admin/mail
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L567 <button type="button" onClick={() => onToggleSale(plan)} className={denseGhost}>
- L593 <button type="button" onClick={() => onEdit(plan)} className={denseSoft}>
- L596 <button type="button" onClick={() => onDelete(plan)} className={denseDanger}>
- L649 <button type="button" onClick={() => onToggleSale(plan)} className={denseGhost}>
- L652 <button type="button" onClick={() => onEdit(plan)} className={denseSoft}>
- L655 <button type="button" onClick={() => onDelete(plan)} className={denseDanger}>
- L732 <Field label="Name" htmlFor={`mail-plan-${scope}-name`} error={touched ? errors.name : undefined}>
- L743 <Field
- L761 <Field label="Description" htmlFor={`mail-plan-${scope}-description`}>
- L771 <Field label="Icon" htmlFor={`mail-plan-${scope}-icon`} hint="Optional. The name of the icon of the plan.">
- L784 <Field
- L801 <Field
- L827 <Segmented
- L837 <Segmented
- L857 <Field
- L873 <Field
- L900 <button type="button" onClick={submit} disabled={busy} className={densePrimary}>
- L903 <button type="button" onClick={onCancel} disabled={busy} className={denseSoft}>
- L934 <ConfirmDialog
- L1017 <button

## Products (692 LOC; 14 action/dialog tags)
Titles: Catalog
API call paths: /admin/products · /admin/products/${id}
Linked admin paths: /admin/products · /admin/products/
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L154 <button type="button" onClick={() => setCreating((value) => !value)} aria-expanded={creating} className={densePrimary}>
- L221 <button
- L249 <button
- L292 <button type="button" onClick={() => setEditing(product.id)} className={denseGhost}>{mayWrite ? 'Edit' : 'View'}</button>
- L293 {mayWrite && <button type="button" onClick={() => setRemoving(product)} className={denseDanger}>Delete</button>}
- L342 <div className="mt-3"><button type="button" onClick={() => setEditing(product.id)} className={denseGhost}>{mayWrite ? 'Edit' : 'View'}</button></div>
- L345 <button
- L353 <button
- L361 <button type="button" onClick={() => setRemoving(product)} className={denseDanger}>
- L380 <ConfirmDialog
- L406 <ConfirmDialog
- L492 <Field label="Slug" htmlFor="product-slug" error={slugError} hint="Lowercase, numbers and dashes.">
- L503 <Field label="Name" htmlFor="product-name" error={nameError}>
- L517 <Field label="Category" htmlFor="product-category">
- L518 <select
- L531 <Field label="Icon" htmlFor="product-icon" hint="Icon name used by the catalog.">
- L543 <Field label="Description" htmlFor="product-description" error={descriptionError}>
- L554 <Field label="Docker image" htmlFor="product-image" hint="Optional. The image the worker provisions.">
- L566 <Field
- L584 <Field label="Min memory (MB)" htmlFor="product-min-ram">
- L595 <Field label="Min vCPU" htmlFor="product-min-cpu">
- L606 <Field label="Min disk (GB)" htmlFor="product-min-disk">
- L617 <Field label="Max memory (MB)" htmlFor="product-max-ram">
- L628 <Field label="Max vCPU" htmlFor="product-max-cpu">
- L639 <Field label="Max disk (GB)" htmlFor="product-max-disk">
- L652 <Field label="Base price (cents)" htmlFor="product-base" hint="Integer minor units. The server prices every quote." error={numberError}>
- L665 <button type="button" aria-pressed={visible} onClick={() => setVisible((value) => !value)} className={visible ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}>
- L668 <button
- L685 <button type="button" onClick={submit} disabled={create.pending} className={densePrimary}>

## Pricing (587 LOC; 7 action/dialog tags)
Titles: Pricing · Rate card of the platform
API call paths: /admin/pricing · /admin/pricing/rates · /admin/pricing/${price.id}
Linked admin paths: /admin/pricing · /admin/pricing/rates · /admin/pricing/
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L222 <Field label="Per GB memory (cents)" htmlFor="card-ram">
- L234 <Field label="Per vCPU (cents)" htmlFor="card-cpu">
- L246 <Field label="Per GB disk (cents)" htmlFor="card-disk">
- L258 <Field label="Instance fee (cents)" htmlFor="card-fee">
- L290 <button type="button" onClick={() => setConfirming(true)} disabled={!changed || save.pending} className={densePrimary}>
- L293 <button
- L309 <ConfirmDialog
- L438 <button
- L451 <Field
- L471 <Field label="Per GB memory (cents)" htmlFor={`ram-${price.id}`}>
- L483 <Field label="Per vCPU (cents)" htmlFor={`cpu-${price.id}`}>
- L495 <Field label="Per GB disk (cents)" htmlFor={`disk-${price.id}`}>
- L555 <button type="button" onClick={() => setConfirming(true)} disabled={!changed || save.pending} className={densePrimary}>
- L558 <button
- L575 <ConfirmDialog

## Support (334 LOC; 6 action/dialog tags)
Titles: Departments · Chat for visitors who are not signed in · Your name and photo in the chat
API call paths: /admin/support/conversations · /admin/support/departments · /admin/support/presence · /admin/support/departments/${department.id} · /admin/support/guest · /admin/support/me · /admin/support/me/avatar
Linked admin paths: /admin/support/conversations · /admin/support/counts · /admin/support/departments · /admin/support/presence · /admin/tickets?ticket= · /admin/support/departments/ · /admin/support/guest · /admin/support/me · /admin/support/me/avatar
UI flags: {"cursor":true,"search":true,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L138 <button
- L151 <Select label="Your status" value={mine?.chosen ?? 'AVAILABLE'} onChange={(event) => void setPresence.run(event.target.value)} disabled={!can(session.staff, 'tickets.write')}>
- L163 <Select label="Department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
- L241 <SoftButton onClick={() => void toggle.run(department)}>{department.visible ? 'Hide' : 'Show'}</SoftButton>
- L242 <SoftButton onClick={() => void remove.run(department)} disabled={department.conversations > 0}>Delete</SoftButton>
- L250 <form
- L258 <SoftButton type="submit" disabled={create.pending || !name.trim()}>Add</SoftButton>
- L290 {mayEdit && <SoftButton onClick={() => void save.run()} disabled={save.pending}>Save</SoftButton>}
- L325 {me.data.avatar && <SoftButton onClick={() => void save.run(null)} disabled={save.pending}>Remove</SoftButton>}

## SupportBots (504 LOC; 25 action/dialog tags)
Titles: Support bots · New bot · What to fix · The map · The flow · Versions · Export and import · Try it
API call paths: /admin/support/bots · /admin/support/bots/${id} · /admin/support/bots/${id}?force=true · /admin/support/departments · /admin/support/bots/${id}/draft · /admin/support/bots/${id}/publish · /admin/support/bots/${id}/rollback · /admin/support/bots/import · /admin/support/bots/simulate
Linked admin paths: /admin/support/bots · /admin/support/bots/ · /admin/support/departments · /admin/support/bots/import · /admin/support/bots/simulate
UI flags: {"cursor":true,"search":true,"filter":true,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L109 <SoftButton onClick={() => setOpenId(bot.id)}>{mayEdit ? 'Edit' : 'View'}</SoftButton>
- L110 {mayEdit && <SoftButton onClick={() => void toggle.run(bot.id, !bot.enabled)} disabled={!bot.publishedVersion && !bot.enabled}>{bot.enabled ? 'Switch off' : 'Switch on'}</SoftButton>}
- L111 {mayEdit && <SoftButton onClick={() => setDeleting({ id: bot.id, name: bot.name, conversations: bot.conversations })}>Delete</SoftButton>}
- L119 <ConfirmDialog
- L136 <SoftButton onClick={() => void create.run(true)} disabled={create.pending || name.trim().length < 2}>From the template</SoftButton>
- L137 <SoftButton onClick={() => void create.run(false)} disabled={create.pending || name.trim().length < 2}>Empty</SoftButton>
- L246 <SoftButton onClick={undo} disabled={past.length === 0}>Undo</SoftButton>
- L247 <SoftButton onClick={redo} disabled={future.length === 0}>Redo</SoftButton>
- L248 {mayEdit && <SoftButton onClick={() => void save.run()} disabled={save.pending || !dirty}>Save draft</SoftButton>}
- L249 {mayEdit && <PrimaryButton onClick={() => void publish.run()} disabled={publish.pending}>Publish</PrimaryButton>}
- L250 <SoftButton onClick={onClose}>Back</SoftButton>
- L280 <Select label="The first block" value={flow.start} onChange={(event) => change({ ...flow, start: event.target.value })} disabled={!mayEdit}>
- L295 {flow.persona?.avatarUrl && <SoftButton onClick={() => change({ ...flow, persona: { ...flow.persona, avatarUrl: '' } })}>Remove</SoftButton>}
- L306 <Select label="Add a block" value={addType} onChange={(event) => setAddType(event.target.value)}>
- L309 <SoftButton onClick={addNode} disabled={nodeIds.length >= 60}>Add</SoftButton>
- L325 {mayEdit && <SoftButton onClick={() => void rollback.run(version.version)} disabled={rollback.pending}>Put back as the draft and the live version</SoftButton>}
- L334 <SoftButton onClick={() => {
- L362 <SoftButton onClick={() => void run.run()} disabled={run.pending || !text.trim()}>Import as a new bot</SoftButton>
- L370 <Select label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)} disabled={disabled}>
- L397 {!readOnly && <SoftButton onClick={onRemove}>Remove</SoftButton>}
- L408 <Select label="Priority" value={node.priority ?? 'NORMAL'} onChange={(event) => set({ priority: event.target.value })} disabled={readOnly}>
- L413 <Select label={node.type === 'transfer' ? 'Department (optional)' : 'Department'} value={node.departmentId ?? ''} onChange={(event) => set({ departmentId: event.target.value || undefined })} disabled=
- L427 {!readOnly && <SoftButton onClick={() => set({ options: node.options!.filter((_, i) => i !== index) })} disabled={(node.options ?? []).length <= 1}>Remove the button</SoftButton>}
- L430 {!readOnly && (node.options ?? []).length < 8 && <SoftButton onClick={() => set({ options: [...(node.options ?? []), { id: `option${(node.options ?? []).length + 1}`, label: 'Option', next: '' }] })}>
- L438 <Select label="When the answer" value={entry.equals !== undefined ? 'equals' : 'contains'} onChange={(event) => set({ cases: node.cases!.map((c, i) => (i === index ? { next: c.next, [event.target.valu
- L444 {!readOnly && <SoftButton onClick={() => set({ cases: node.cases!.filter((_, i) => i !== index) })} disabled={(node.cases ?? []).length <= 1}>Remove the case</SoftButton>}
- L447 {!readOnly && <SoftButton onClick={() => set({ cases: [...(node.cases ?? []), { contains: 'word', next: '' }] })}>Add a case</SoftButton>}
- L483 {out.kind === 'buttons' && <span className="mt-1 flex flex-wrap gap-1.5">{(out.options ?? []).map((option) => <button key={option.id} type="button" onClick={() => setInputs([...inputs, { option: optio
- L484 {out.kind === 'ask' && out.input === 'service' && <span className="mt-1 flex flex-wrap gap-1.5">{(out.options ?? []).map((option) => <button key={option.id} type="button" onClick={() => setInputs([...
- L492 <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (text.trim()) { setInputs([...inputs, { text }]); setText(''); } }}>
- L494 <SoftButton type="submit" disabled={!text.trim()}>Send</SoftButton>
- L499 <SoftButton onClick={() => setInputs([])} disabled={inputs.length === 0}>Start again</SoftButton>

## SupportAutomations (315 LOC; 14 action/dialog tags)
Titles: Automation rules · Try it · Business hours
API call paths: /admin/support/automations · /admin/support/departments · /admin/support/automations/${rule.id} · /admin/support/automations/${id}/runs · /admin/support/automation-runs/${runId}/retry · /admin/support/automations/${draft.id} · /admin/support/automations/dry-run · /admin/support/hours
Linked admin paths: /admin/support/automations · /admin/support/departments · /admin/support/automations/ · /admin/support/automation-runs/ · /admin/support/automations/dry-run · /admin/support/hours
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L87 <SoftButton onClick={() => setHistory(history === rule.id ? null : rule.id)}>History</SoftButton>
- L88 <SoftButton onClick={() => setEditing(rule)}>{mayEdit ? 'Edit' : 'View'}</SoftButton>
- L89 {mayEdit && <SoftButton onClick={() => void toggle.run(rule)}>{rule.enabled ? 'Switch off' : 'Switch on'}</SoftButton>}
- L90 {mayEdit && <SoftButton onClick={() => void remove.run(rule)}>Delete</SoftButton>}
- L99 {mayEdit && <div className="mt-3"><SoftButton onClick={() => setEditing(blank())}>New rule</SoftButton></div>}
- L121 {mayEdit && run.status !== 'ok' && <SoftButton onClick={() => void retry.run(run.id)} disabled={retry.pending}>Try again</SoftButton>}
- L165 <Select label="When" value={draft.trigger} onChange={(event) => set({ trigger: event.target.value, afterMinutes: WAITING.includes(event.target.value) ? draft.afterMinutes ?? 60 : null })} disabled={!m
- L173 <Select label="Department" value={String(draft.conditions.departmentId ?? '')} onChange={(event) => condition('departmentId', event.target.value)} disabled={!mayEdit}>
- L177 <Select label="Channel" value={String(draft.conditions.channel ?? '')} onChange={(event) => condition('channel', event.target.value)} disabled={!mayEdit}>
- L183 <Select label="Assigned" value={String(draft.conditions.assigned ?? '')} onChange={(event) => condition('assigned', event.target.value)} disabled={!mayEdit}>
- L188 <Select label="Priority" value={String((draft.conditions.priority as string[] | undefined)?.[0] ?? '')} onChange={(event) => condition('priority', event.target.value ? [event.target.value] : [])} disa
- L192 <Select label="Status" value={String((draft.conditions.status as string[] | undefined)?.[0] ?? '')} onChange={(event) => condition('status', event.target.value ? [event.target.value] : [])} disabled={
- L196 <Select label="Business hours" value={String(draft.conditions.businessHours ?? '')} onChange={(event) => condition('businessHours', event.target.value)} disabled={!mayEdit}>
- L206 <Select label="Do" value={action.type} onChange={(event) => setAction(index, { type: event.target.value, ...(event.target.value === 'set_priority' ? { priority: 'HIGH' } : event.target.value === 'set_
- L210 <Select label="Priority" value={action.priority ?? 'HIGH'} onChange={(event) => setAction(index, { ...action, priority: event.target.value })} disabled={!mayEdit}>
- L215 <Select label="Status" value={action.status ?? 'CLOSED'} onChange={(event) => setAction(index, { ...action, status: event.target.value })} disabled={!mayEdit}>
- L220 <Select label="Department" value={action.departmentId ?? ''} onChange={(event) => setAction(index, { ...action, departmentId: event.target.value })} disabled={!mayEdit}>
- L231 {mayEdit && <SoftButton onClick={() => set({ actions: draft.actions.filter((_, i) => i !== index) })} disabled={draft.actions.length <= 1}>Remove this action</SoftButton>}
- L234 {mayEdit && draft.actions.length < 8 && <SoftButton onClick={() => set({ actions: [...draft.actions, { type: 'add_note', text: '' }] })}>Add an action</SoftButton>}
- L238 {mayEdit && <PrimaryButton onClick={() => void save.run()} disabled={save.pending || !draft.name.trim()}>Save</PrimaryButton>}
- L239 <SoftButton onClick={onClose}>Back</SoftButton>
- L247 <SoftButton onClick={() => void dry.run()} disabled={dry.pending || !ticketNumber}>Try</SoftButton>
- L286 {mayEdit && <SoftButton onClick={() => setHours(fresh)}>Set business hours</SoftButton>}
- L306 <PrimaryButton onClick={() => void save.run(hours)} disabled={save.pending}>Save the hours</PrimaryButton>
- L307 <SoftButton onClick={() => void save.run(null).then(() => setHours(null))}>Remove the hours</SoftButton>

## SupportAnalytics (180 LOC; 3 action/dialog tags)
Titles: Support numbers · Now · In the period · Workload · Answer time policies · What customers rated
API call paths: /admin/support/analytics · /admin/support/departments · /admin/support/sla · /admin/support/ratings
Linked admin paths: /admin/support/analytics · /admin/support/departments · /admin/support/sla · /admin/support/ratings · /admin/tickets?ticket=
UI flags: {"cursor":false,"search":false,"filter":true,"export":true,"urlState":false,"tab":true,"async":true}
Controls: 
- L58 <Select label="Period" value={days} onChange={(event) => setDays(event.target.value)}>
- L63 <Select label="Department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
- L67 <Select label="Channel" value={channel} onChange={(event) => setChannel(event.target.value)}>
- L140 {mayEdit && <SoftButton onClick={() => setRows(rows.filter((_, i) => i !== index))}>Remove</SoftButton>}
- L146 {free[0] && <SoftButton onClick={() => setRows([...rows, { priority: free[0]!, firstResponseMinutes: 60 }])}>Add a policy for {free[0].toLowerCase()}</SoftButton>}
- L147 <PrimaryButton onClick={() => void save.run()} disabled={save.pending}>Save the policies</PrimaryButton>

## SupportAi (104 LOC; 3 action/dialog tags)
Titles: Assistant for the staff · Assistant
API call paths: /admin/support/ai · /admin/support/conversations/${ticketId}/ai
Linked admin paths: /admin/support/ai · /admin/support/conversations/
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L63 {mayEdit && <PrimaryButton onClick={() => void save.run()} disabled={save.pending}>Save</PrimaryButton>}
- L89 {ACTIONS.map((action) => <SoftButton key={action.value} onClick={() => void run.run(action.value)} disabled={run.pending}>{action.label}</SoftButton>)}
- L97 {result.action === 'suggest_reply' && <SoftButton onClick={() => onUse(result.text)}>Put it in the reply box</SoftButton>}

## Tickets (23 LOC; 0 action/dialog tags)
Titles: none
API call paths: unresolved
Linked admin paths: /admin/tickets?ticket=<id>
UI flags: {"cursor":false,"search":true,"filter":false,"export":true,"urlState":false,"tab":true,"async":false}
Controls: 
No literal controls

## Knowledge (81 LOC; 6 action/dialog tags)
Titles: Knowledge base
API call paths: /admin/support/knowledge
Linked admin paths: /admin/support/knowledge
UI flags: {"cursor":false,"search":true,"filter":true,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L29 action={mayWrite ? <button type="button" className={densePrimary} onClick={() => setDraft({ id: Math.random().toString(36).slice(2, 10), title: '', body: '', tags: [] })}>New article</button> : undefi
- L43 <button type="button" className={densePrimary} disabled={save.pending || !draft.title.trim() || !draft.body.trim()} onClick={() => void save.run([...all.filter((article) => article.id !== draft.id), d
- L44 <button type="button" className={denseGhost} onClick={() => setDraft(null)}>Cancel</button>
- L60 <button type="button" className="text-left text-[14.5px] font-semibold text-ink" aria-expanded={open === article.id} onClick={() => setOpen(open === article.id ? null : article.id)}>
- L68 <button type="button" className={denseSoft} onClick={() => setDraft(article)}>Edit</button>
- L69 <button type="button" className={denseGhost} onClick={() => void save.run(all.filter((entry) => entry.id !== article.id))}>Delete</button>

## Abuse (14 LOC; 0 action/dialog tags)
Titles: none
API call paths: unresolved
Linked admin paths: none
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":false,"async":false}
Controls: 
No literal controls

## Incidents (165 LOC; 7 action/dialog tags)
Titles: Incidents · Announcements
API call paths: /admin/incidents/${incident.id}/updates · /admin/incidents/${incident.id} · /admin/incidents · /admin/announcements · /admin/announcements/${entry.id}
Linked admin paths: /admin/incidents/ · /admin/incidents · /admin/announcements · /admin/announcements/
UI flags: {"cursor":false,"search":false,"filter":false,"export":true,"urlState":false,"tab":false,"async":true}
Controls: 
- L57 <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
- L62 <PrimaryButton onClick={() => void send()} disabled={busy || message.trim().length < 3}>Publish</PrimaryButton>
- L63 <button type="button" className={denseDanger} onClick={() => setRemoving(true)}>Delete</button>
- L67 <ConfirmDialog open={removing} title="Delete this incident?" description="It disappears from the status page and from the history." confirmLabel="Delete" onCancel={() => setRemoving(false)}
- L102 <Select label="Impact" value={form.impact} onChange={(event) => setForm({ ...form, impact: event.target.value })}>
- L107 <PrimaryButton disabled={busy || form.title.trim().length < 3 || form.message.trim().length < 3}
- L124 <Select label="Kind" value={note.severity} onChange={(event) => setNote({ ...note, severity: event.target.value })}>
- L133 <PrimaryButton disabled={busy || note.title.trim().length < 3 || note.body.trim().length < 3}
- L153 <SoftButton onClick={() => void run(() => patch(`/admin/announcements/${entry.id}`, { active: !entry.active }), entry.active ? 'Switched off.' : 'Switched on.', announcements.reload)}>{entry.active ? 
- L154 <button type="button" className={denseDanger} onClick={() => void run(() => del(`/admin/announcements/${entry.id}`), 'Deleted.', announcements.reload)}>Delete</button>
