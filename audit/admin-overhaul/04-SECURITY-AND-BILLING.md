# 04 · Security and billing

## Settings
- Every key of the `Setting` table has an owner (`api/src/services/setting-registry.ts`): domain, read permission, write permission, whether the general endpoint may write it, public or not, when it takes effect.
- Fail closed: an unregistered key cannot be written and is not shown. `internal.*` and `cancelled_instance_retention` are hidden and never written by the staff area. `offsite.destination` is written only by the backup agent.
- A request is all or nothing: every key is checked first, then written in one transaction. One audit entry names the keys and the domains, never the values.
- A value that did not change needs no permission, because the settings page sends back whole groups.
- Not done: step-up authentication and a confirmation dialog for the dangerous keys (`auto_delete_cancelled_instances`). The registry has the `effect` field but no confirmation flag yet.

## Proxmox
- `VPS_PROXMOX_FINGERPRINT` (SHA-256 of the certificate) or `VPS_PROXMOX_CA` is required. Without one of them the platform refuses to send the token. `VPS_PROXMOX_ALLOW_UNVERIFIED_TLS=true` exists for a lab and is ignored when `NODE_ENV=production`.
- The pin is compared right after the handshake and before the request is written (test: the server receives 0 requests with a wrong pin).
- The same agent serves the REST client and the terminal websocket.
- The certificate of the hypervisor is renewed by Proxmox about once a year. When it changes, the VPS service stops until the new fingerprint is written. This is the price of pinning; the alternative is a CA you control.
- Left as it was: the Mailcow client already pins a fingerprint (`api/src/services/mailcow.ts:220`).

## VPS allocation
- A slot is written in `VpsSlot` under a PostgreSQL advisory lock in the same transaction as the service. Slots are never handed out twice, not even after a service row is deleted. Backfilled from the existing services by the migration.
- Before any configure, adopt, stop or delete, the machine at the VMID must carry the tag `bmvps` and the id of the service in its description, or the name the platform gave it. Otherwise the slot is quarantined, the service moves to a fresh slot and the foreign machine is left alone.
- The reconciliation report compares services, ledger and the Proxmox pool (orphans, strangers in our range, missing machines, services missing from the ledger). It writes only the ledger and never touches a machine.
- Released slots are **not** reused. The row of a cancelled service keeps its unique slot. Capacity grows through `VPS_MAX_SLOTS` up to the size of the /24; a bigger network is an operator action on the hypervisor.
- The Proxmox token sees only its pool, so a machine outside the pool at one of our VMIDs shows up as "absent" to `vmExists` (HTTP 403) and Proxmox itself refuses the clone. The report cannot see such a machine.

## Billing of a VPS
- Two separate operations. The commercial change quotes first, refuses a stale quote, changes the subscription first (the step that can be taken back), then Proxmox, and restores the old amount if Proxmox fails. If the restore fails too, the audit entry `admin.vps.plan_inconsistent` says which side is ahead.
- The price becomes effective at the next renewal, nothing is prorated or charged today. Existing customers keep their price until a plan change is made on purpose.
- The free adjustment never touches Stripe. It needs `freeOverride:true` and a reason, it is recorded on the server (`resourceOverride`) and in the audit log.
- `GET /admin/vps-billing-check` lists servers whose size or bill disagree with their plan; a recorded override is not listed.
- Not verified: the real Stripe subscription update. The tests replace `updateSubscriptionAmount`. Not handled: yearly VPS subscriptions, tax, and a durable retry queue for the "inconsistent" case (it is audit-only).

## Money
- All VPS amounts are integer cents. The pricing engine and the checkout were not re-audited in this work (Phase 3 is not done).
