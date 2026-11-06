# 18 — Testing and CI

`.github/workflows/ci.yml`: blocking jobs — api tsc, web tsc+vite+docs, vitest vs disposable `_test` DB, gitleaks, npm audit high, schema drift, actionlint. Concurrency cancel-in-progress. No repo secrets required for CI.

Current GitHub Actions result: **UNVERIFIED** (`gh` not installed). Docs claim green on older SHA `f26ba9c1`, not production `8b07cd2d`.

## What tests prove

- Access-control unit tests mock `enqueueProvisioning`.  
- Guest claim 401 expected.  
- Stripe sandbox live test `skipIf(!wanted || !isSandbox)` — does **not** run on live keys.  
- Backup offsite tests `skipIf(!TOOLS_AVAILABLE)`.  
- Playwright E2E uses stubs — not production.

`it.skip(` / `describe.skip(` (unconditional) not found in api tests; gated skipIf used.

## Gap

CI does not start Wings, Proxmox, Mailcow, or Stripe live. Green CI ≠ provisioned Minecraft. Do not run full vitest on the shared bench DB (rule).
