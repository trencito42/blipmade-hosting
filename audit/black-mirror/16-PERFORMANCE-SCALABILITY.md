# 16 — Performance, scale, workers

No load test. No API p95.

## Observed

- VM103 disk **85%**, Docker build cache ~40 GB reclaimable (BM-005). Next image build can fill Postgres disk.  
- Host RAM 251 GiB, ~164 GiB assigned; game node 131 GiB. Headroom until game fill.  
- CPU 37/80 assigned.  
- Host `/` 32% of 1.7T; thin qcow2 can still surprise.  
- `VPS_MAX_SLOTS` default 150 without RAM check (BM-016).  
- Game DNAT 30000–39999 — port space exists; node disk/RAM do not at 150 VPS.

## Workers / cron (code)

`worker.ts` intervals: reconcile instances 60s; domain routes 60s; game connect 5m; queue prune 10m; sessions 1h; billing 15m; mail 30m; webhook retry 5m; status 60s; ops health 5m; notifications 5s; dead-letter 3m; runtime state 60s; Discord roles if configured.

Host timers: `blipmade-backup`, offsite platform/VPS/retention, game-node customer/database, `blipmade-network`. Mail VM: `dpkg-db-backup` only.

Worker not published on host `:3101` — by design.

## Scale opinion

One 80G VM for API+CI+Postgres is the bottleneck, not CPU. Split CI or prune before any catalogue growth. Do not sell 150 VPS.
