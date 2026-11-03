# Credential encryption migration and safe session rotation

Blipmade historically encrypted reversible credentials as `v1` with a key derived from `SESSION_SECRET`. The `v2` format uses a dedicated `DATA_ENCRYPTION_SECRET`, so session rotation no longer destroys those records.

Never put secret values in chat, commits, issue comments, or logs. The migration is not automatic and must be dry-run-first.

## Supported transition

- Without `DATA_ENCRYPTION_SECRET`, reads and writes remain v1 for compatibility.
- With an independent key of at least 32 characters, new ciphertext is v2.
- v1 remains readable only while the original `SESSION_SECRET` is available.
- v2 never falls back to the session secret when authentication fails.
- The scanner covers panel client tokens, instance generated/customer variables, TOTP secrets, and Git webhook secrets.

## Operator procedure

1. Freeze credential writes and verify a restorable encrypted off-provider backup.
2. Generate the independent key in the approved secret manager. Use the same value on every API/worker replica.
3. Deploy dual-read code with the original `SESSION_SECRET` unchanged. Do not rotate either secret yet.
4. In the platform runtime, run `npx tsx scripts/reencrypt-credentials.ts --dry-run`.
5. Stop if any legacy record is unreadable. Restore the matching original session secret before investigation.
6. After backup verification and owner approval, run `npx tsx scripts/reencrypt-credentials.ts --apply`.
7. Confirm zero legacy records remain and validate panel access, instance variables, TOTP, and Git webhook verification for samples.
8. Only after that evidence exists may `SESSION_SECRET` be rotated in a controlled maintenance window.

The script prints counts only. It never prints plaintext or ciphertext and uses conditional updates to stop on concurrent writes. A rollback to v1-only code is unsupported after any v2 value is written. Rotating `DATA_ENCRYPTION_SECRET` itself requires a separate keyring/rekey design.
