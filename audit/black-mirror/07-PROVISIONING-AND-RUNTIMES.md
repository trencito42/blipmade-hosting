# 07 — Provisioning and runtimes

Worker binds internally (`:3101` unpublished). Expected.

## Flow

Paid webhook → `Instance` `PENDING` + unique `provisioningKey` → `enqueueProvisioning` → worker. Reconcile every 60s (`worker.ts` `reconcileInterruptedInstances`). Dead-letter requeue exists. Admin can enqueue with reason.

Halfway fail: instance `FAILED` / line `FAILED`; money already captured. Credit path UNVERIFIED live.

## Eggs (BM-004)

Git: `pterodactyl-eggs/nodejs.json` `done` placeholder; `python.json` same.

Live panel API 2026-11-06: 83 eggs, `placeholder_done=1`. Egg 15/83 `done=["Node.js Version:"]`; 84 `["Python "]`; **egg 16 python generic still `done="change this part"`**. Sync from git would re-break Node.

Installer `installed` bit depends on Wings leaving `starting`. Placeholder `done` leaves UI lying.

## Git / ZIP / Discord

`git-deploy.ts` `installArchive` uploads then `client.decompressArchive`. Inspect-time zip filter does not wrap apply (BM-013). Discord bot SKU orderable; live install not watched this pass. K-13 Discord blank on panel server 353 marked installed 2026-11-05 — not re-probed.

## Persistence across sync

Egg `startup.done` lives in panel DB. Repo JSON is the next sync source. **Git is stale vs live Node hotfix.**

## Tests

Provider calls mocked in unit tests. No disposable-node install this pass.
