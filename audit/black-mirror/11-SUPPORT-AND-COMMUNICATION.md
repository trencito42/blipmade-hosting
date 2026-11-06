# 11 — Support and communication

## Guest chat (BM-022 — not a defect)

`POST /support/guest/claim` → `requireAuth`. No session → 401. No guest cookie + authed → `{claimed:0}`. Tests expect 401. `ChatWidget` mounts in authenticated customer shell only. Public `GuestChatWidget` uses thread/config, not claim.

## Tickets / diagnose

Ticket routes exist. `instance-help` reads logs for “check my logs” — file reads, not shell. Live ticket not created. Discord bridge code exists; live UNVERIFIED.

## Admin support

Nav: Support numbers, automations, bots, console, queue, knowledge — six entries. Likely more UI than operators. Click-through BLOCKED (no staff session).

## Product

Diagnose-from-files is the right shape. Guest 401 is correct. Do not “fix” it. Missing: a single Support inbox; bots/automations/analytics can wait.
