# 14 — CRM, risk, growth (#28)

`gh` missing. Issue #28 text not fetched. Schema:

- `CustomerNote` — staff notes.  
- `DeviceSignal` — `@@unique([userId, hash])`. Used at checkout (`recordDeviceSignal` in orders.ts). Risk/fingerprint, **not** a campaign CRM.  
- `Promotion*` + card fingerprint unique. Sponsored checkout + card check when payments on.  
- `NotificationPreference`.

No campaign builder, no lifecycle email product, no pipeline UI beyond notes.

## Verdict on #28

Growth CRM is **not launch-blocking**. DeviceSignal is anti-abuse. Do not market it as CRM. Issue body UNVERIFIED.

P4: notes + Stripe customer + tickets are enough until paying volume exists. A HubSpot clone on this host is the wrong fight.
