# Credential encryption migration & safe session rotation

## Why

Blipmade historically encrypted Pterodactyl client tokens and customer instance
variables as `v1` using a key derived from `SESSION_SECRET`. Rotating that
cookie/session secret made stored credentials unreadable. New ciphertext can use
a dedicated `DATA_ENCRYPTION_SECRET` and is tagged `v2`.

No production secret is included in this document. **Do not put secret values
in chat, issue comments, CI logs or committed environment files.**

## Supported behavior

- Without `DATA_ENCRYPTION_SECRET`, the system continues reading/writing v1,
  for compatibility until an intentional migration.
- With an independent key of at least 32 characters, new ciphertext is v2.
- v1 remains readable while the original SESSION_SECRET is still available.
- v2 is decrypted using the independent key and survives session-secret changes.
- The migration is **not** automatic. Do not rotate SESSION_SECRET prematurely.

## Operator procedure (maintenance window)

1. Verify the latest production commit, inventory secret holders, and freeze
   credential writes during the migration.
2. Capture and verify an encrypted database backup off-provider, plus key
   escrow/recovery access. Test restoration.
3. Generate a **new independent random secret** in an approved secure secret
   manager, at least 32 characters. Do not derive it from SESSION_SECRET.
4. Deploy the version of the API and worker that reads both v1 and v2, using
   the unchanged original SESSION_SECRET and the same
   DATA_ENCRYPTION_SECRET across all replicas. Verify credential reads.
5. In the platform runtime, run the *preflight* with no writes:

   `npx tsx scripts/reencrypt-credentials.ts --dry-run`

6. Inspect counts. Any unreadable v1 ciphertext blocks the migration.
7. With backup verified and credential writes quiesced, explicitly run:

   `npx tsx scripts/reencrypt-credentials.ts --apply`

8. Confirm the count of legacy records remaining is zero, and verify real
   panel authentication plus a sample of generated and customer-provided
   variables for multiple tenant accounts.
9. Create a recovery checkpoint. **Only now** rotate SESSION_SECRET and
   invalidate existing sessions. Restart components in a controlled order.
10. Verify that Pterodactyl account access and customer credentials still work,
    and monitor failed decryptions and account access.

The script scans `PanelCredential.tokenEnc`,
`Instance.generatedVariables`, and `Instance.customerVariables`.
It never prints plaintext or ciphertext values. It aborts on unreadable legacy
records, and uses conditional updates to avoid overwriting concurrent writes.
A partial migration can be resumed after the cause has been diagnosed. Never
run against a database without its backup.

## Release restrictions

- Never turn on the new key for only some replicas; that creates unreadable
  v2 records for replicas without the same key.
- A rollback to application code that only understands v1 is **not supported**
  after any v2 ciphertext is written. Use a tested forward-fix or a complete
  restore coordinated with the matching original keys.
- Changing DATA_ENCRYPTION_SECRET itself is **not** supported as an in-place
  rotation by this procedure; a keyring/rekey process is required separately.
- A production migration requires authorized operator execution and evidence
  stored in a private runbook. This PR does not perform the migration.
