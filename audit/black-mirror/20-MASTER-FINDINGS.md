# 20 — Master findings (open register)

IDs are stable. Update in place; do not renumber. Last pass 2026-11-06T06:32Z. BM-004/BM-006/BM-010 revalidated. New: BM-015–BM-022.

---

**Finding ID:** BM-001  
**Title:** Single host on RAID 0; infra VM disks have no off-host copy  
**Priority:** P0  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** Hypervisor `n7030e1`, all VMs, customer game disks, mail, VPS  
**Files and lines:** `/proc/mdstat`; `pvesm status`; empty `/var/lib/vz/dump`; `scripts/backup.sh` lines 4–7; `docs/BACKUP-DISASTER-RECOVERY.md` RAID 0 warning  
**Infrastructure evidence:** 2026-11-06T06:28Z two Samsung MZ7L3960 960 GB SSDs, `md1` RAID 0 ext4 `/`; `pvesm` only `local` dir. VPS 1001/1002 have weekly encrypted vzdump off-site (BM-006). VM100–105 qcow2 live only on this array.  
**Description:** One SSD failure loses the hypervisor and every qcow2. Platform Postgres has nightly off-site. VPS pool has weekly off-site. Wings volumes, Mailcow, panel, platform VM disks do not. PBS client present, unused.  
**Impact:** One disk or host loss destroys running customer servers. Off-site encrypted DB copy cannot recreate game worlds or mailboxes.  
**Reproduction:** `cat /proc/mdstat`; `ls /var/lib/vz/dump`; `pvesm status`.  
**Root cause:** Cost/simplicity; backup chain designed for VM103 only.  
**Recommendation:** Independent disks or RAID1/ZFS; vzdump or PBS to a second failure domain; document RPO for Wings `/var/lib/pterodactyl`.  
**Alternative approaches:** Replicate VM101 storage off-host nightly; accept “best effort game files” in ToS (does not fix mail/VPS).  
**Estimated effort:** Architectural  
**Regression risk:** Low (ops change)  
**Dependencies:** BM-006 is the empty dump dir specifically.  
**Acceptance test:** Restore a VM from off-host backup onto a spare disk; timed.  
**Launch blocker:** Yes  

---

**Finding ID:** BM-002  
**Title:** Production Stripe is live and payments are enabled  
**Priority:** P0  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** Billing, checkout, subscriptions  
**Files and lines:** `api/src/env.ts` (`paymentsEnabled`); `api/src/services/stripe.ts` `createCheckout` (throws only when payments off)  
**Infrastructure evidence:** 2026-11-06T06:03Z VM103 `.env` `PAYMENTS_ENABLED=true`; public health `stripe:"live"`. **2026-11-06T07:11Z containment:** `.env` `PAYMENTS_ENABLED=false`, api/worker recreated; in-process `env.paymentsEnabled===false`; `createCheckout` 503 `payments_unavailable`. Stripe live: **2 paid charges** (299+399 cents, 2026-10-30), **9 active subscriptions still renewing**, 1 open Checkout expired.  
**Description:** Live Checkout was on. Money already moved (two paid charges). Flag now off for **new** sessions. Existing Stripe subscriptions are unchanged.  
**Impact:** Real charges for unproven catalogue/provisioning. Failed provision after payment is a refund/ops incident.  
**Reproduction:** `curl -sS https://blipmade.com/api/health` (no secrets). Do not complete a live Checkout.  
**Root cause:** Flag turned on in production `.env`.  
**Recommendation:** Set `PAYMENTS_ENABLED=false` until catalogue, provision, VAT, and refunds are proven — owner action, not this audit.  
**Alternative approaches:** Keep live keys but disable checkout; Stripe test mode only.  
**Estimated effort:** Small (flag) / Large (to be actually ready)  
**Regression risk:** Low for turning off  
**Dependencies:** K-02, K-17, BM-012  
**Acceptance test:** Health shows sandbox or `paymentsEnabled` false; checkout returns `payments_unavailable`.  
**Launch blocker:** Yes, until product readiness matches money.

---

**Finding ID:** BM-003  
**Title:** `DATA_ENCRYPTION_SECRET` unset; sealed secrets use `SESSION_SECRET`  
**Priority:** P1  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** 2FA, OAuth refresh, panel client tokens, Cloudflare zone tokens, instance generated variables  
**Files and lines:** `api/src/lib/secrets.ts` 10–27; `api/src/env.ts` 33–36  
**Infrastructure evidence:** 2026-11-06T06:03Z production env `DATA_ENCRYPTION_SECRET=UNSET`  
**Description:** `encryptSecret` writes `v1` boxes keyed from `SESSION_SECRET`. Rotating the session secret (or leaking it) decrypts or bricks long-lived credentials.  
**Impact:** Session secret becomes a master key for stored secrets.  
**Reproduction:** Confirm env key unset (metadata only); read `secrets.ts`.  
**Root cause:** Migration to v2 never applied in production.  
**Recommendation:** Set a 32+ char data key, run upgrade path `upgradeSecretEncryption`, keep session and data keys separate.  
**Alternative approaches:** None that keep v1.  
**Estimated effort:** Medium (careful dual-read)  
**Regression risk:** High if rotated wrong  
**Dependencies:** —  
**Acceptance test:** New rows start with `v2.`; decrypt still works after session secret rotation.  
**Launch blocker:** Yes if you will store customer OAuth/panel tokens in production.

---

**Finding ID:** BM-004  
**Title:** Node/Python eggs in repo still use placeholder Wings `done` markers  
**Priority:** P1  
**Confidence:** High  
**Evidence status:** VERIFIED (live panel + git)  
**Affected systems:** Discord bots, Node/Python deploys, installer `installed` bit  
**Files and lines:** `pterodactyl-eggs/nodejs.json` line 30; `pterodactyl-eggs/python.json` line 26  
**Infrastructure evidence:** 2026-11-06T06:29Z application API: 83 eggs, `placeholder_done=1`. Live: egg 15/83 `done=["Node.js Version:"]`; egg 84 `["Python "]`; **egg 16 `python generic` still `done="change this part"`**. Git copies of nodejs.json/python.json still have yolk placeholders.  
**Description:** Live Node eggs are fixed. Live **python generic (16)** is not. Repo would re-break Node on sync. Python generic still leaves Wings `starting`.  
**Impact:** Installer never records installed; UI lies; jobs stick.  
**Reproduction:** Open those JSON files. Live egg dump is the missing proof.  
**Root cause:** Placeholder yolk templates copied; hotfix not in git.  
**Recommendation:** Commit the real markers (`Node.js Version:`, `Python `) and re-verify after reinstall.  
**Alternative approaches:** Per-egg `done` from actual entrypoint.  
**Estimated effort:** Small  
**Regression risk:** Medium (egg sync)  
**Dependencies:** K-13  
**Acceptance test:** New Node/Python server reaches Wings `running` and installer `installed` after reinstall.  
**Launch blocker:** Yes for bot/app SKUs.

---

**Finding ID:** BM-005  
**Title:** Platform VM disk 85% full plus ~40 GB Docker build cache  
**Priority:** P1  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** VM103 postgres, deploys, backups  
**Files and lines:** compose logging comments already warn a full disk kills Postgres  
**Infrastructure evidence:** 2026-11-06T06:04Z `df /` 64G/79G 85%; `docker system df` Build Cache 39.98GB reclaimable  
**Description:** 12 GB free. Next image build or backup spike can fill the disk. Bench containers also occupy space.  
**Impact:** Database stop, failed deploys.  
**Reproduction:** `df -h /`; `docker system df` on VM103.  
**Root cause:** Image sprawl (472 images) and cache; 80G disk undersized for CI+prod on one VM.  
**Recommendation:** Owner-approved `docker builder prune` / image GC; split CI disk; alert at 70%.  
**Alternative approaches:** Larger disk.  
**Estimated effort:** Small (prune) / Medium (split)  
**Regression risk:** Low if prune unused only  
**Dependencies:** —  
**Acceptance test:** `<70%` used after prune; alert wired.  
**Launch blocker:** Yes until headroom exists.

---

**Finding ID:** BM-006  
**Title:** Infrastructure VMs have no vzdump; VPS weekly offsite exists  
**Priority:** P1  
**Confidence:** High  
**Evidence status:** VERIFIED (revalidated; priority lowered from P0)  
**Affected systems:** VM100–105 vs VPS 1001/1002  
**Files and lines:** `/etc/pve/vzdump.cron` empty; `/usr/local/sbin/blipmade-offsite-agent` `mode_vps`; `blipmade-offsite-vps.timer`  
**Infrastructure evidence:** `/var/lib/vz/dump` still 0 files (dumps go to `/var/lib/blipmade-offsite/staging` then delete). Timer weekly. Journal 2026-11-02 14:53Z: vzdump VM 1002 OK, then `verified: vps/n7030e1/vm1002/...vma.zst.age` 459985802 bytes. `done/vm-1001` and `vm-1002` exist. PBS client 4.2.8 installed, **no datastore configured**. Game node has daily customer/database offsite timers (ran 2026-11-06). Mailcow: helper script only, no Blipmade offsite unit.  
**Description:** First pass overstated “no vzdump anywhere”. Customer VPS have a weekly encrypted offsite copy. Panel, platform, Wings, mail, observability qcow2 still have none. Restore of the VPS age file was not drilled (identity off-host).  
**Impact:** Destroying VM103/101/104 is still unrecoverable at hypervisor layer. Destroying 1002 is theoretically restorable UNVERIFIED.  
**Reproduction:** `ls /var/lib/vz/dump`; `journalctl -u blipmade-offsite-vps`; `ls /var/lib/blipmade-offsite/done`.  
**Root cause:** Offsite agent covers VPS pool only.  
**Recommendation:** Same agent (or PBS) for VM101/103/104. Drill restore of 1002 on a spare VMID.  
**Alternative approaches:** File-level DB dumps (already exist for VM103).  
**Estimated effort:** Medium  
**Regression risk:** Low  
**Dependencies:** BM-001, BM-021  
**Acceptance test:** Restore VM1002 from off-site age file; vzdump of VM103 exists off-host.  
**Launch blocker:** Yes for mail/games/control plane; No for “VPS backup job missing”.  

---

**Finding ID:** BM-007  
**Title:** Public `/api/health` discloses live Stripe and panel wiring  
**Priority:** P2  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** `api/src/routes/health.ts`  
**Files and lines:** `healthHandler` returns `stripe`, `pterodactyl`, `panelKeyBridge`, mail transport  
**Infrastructure evidence:** unauthenticated `https://blipmade.com/api/health` 200 with `stripe:live`  
**Description:** Attackers learn money is live and which backends exist. `/health/live` is the right public probe.  
**Impact:** Recon. Not RCE.  
**Reproduction:** curl as above.  
**Root cause:** Operator convenience on the public path.  
**Recommendation:** Public liveness only; detailed health on loopback or staff auth.  
**Alternative approaches:** Strip `stripe`/`pterodactyl` from public JSON.  
**Estimated effort:** Small  
**Regression risk:** Low  
**Dependencies:** —  
**Acceptance test:** Unauthenticated health has no payment/panel fields.  
**Launch blocker:** No  

---

**Finding ID:** BM-008  
**Title:** Panel VM has no `onboot`  
**Priority:** P1  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** VM100  
**Files and lines:** `qm config 100` has no `onboot`  
**Infrastructure evidence:** 2026-11-06T05:59Z  
**Description:** Host reboot starts 101–105 (`onboot: 1`) but not the panel. Game node without panel is a split brain.  
**Impact:** After power loss, provisioning and customer power APIs fail until someone starts VM100.  
**Reproduction:** `qm config 100 | grep onboot`  
**Root cause:** VM was a “debian13-test” leftover used as panel.  
**Recommendation:** `onboot: 1` (owner). Rename the VM.  
**Alternative approaches:** HA later.  
**Estimated effort:** Small  
**Regression risk:** Low  
**Dependencies:** —  
**Acceptance test:** `qm config 100` shows `onboot: 1`.  
**Launch blocker:** Yes  

---

**Finding ID:** BM-009  
**Title:** Customer VPS VMs have no `onboot`  
**Priority:** P1  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** VM 1001, 1002, future VPS  
**Files and lines:** `qm config 1001/1002`; `api/src/services/vps.ts` 293–304 `configureVm` sets cores/memory/ip/sshkeys/agent/tags, **not** `onboot`  
**Infrastructure evidence:** `onboot` count 0 for 1001/1002  
**Description:** Host reboot leaves VPS off.  
**Impact:** Paid VPS down until operator intervention.  
**Reproduction:** `qm config 1001 | grep onboot`  
**Root cause:** Template/provision omitted the flag.  
**Recommendation:** Set on existing VMs; set in provisioner.  
**Alternative approaches:** systemd in guest cannot help if the VM is not started.  
**Estimated effort:** Small  
**Regression risk:** Low  
**Dependencies:** provisioner review in 09  
**Acceptance test:** New VPS config contains `onboot: 1`; reboot drill on disposable VM.  
**Launch blocker:** Yes for VPS SKU  

---

**Finding ID:** BM-010  
**Title:** MariaDB on Wings node listens on `10.77.0.11:3306`  
**Priority:** P1  
**Confidence:** High (reachability); Low (data)  
**Evidence status:** VERIFIED (TCP open); contents UNVERIFIED  
**Affected systems:** VM101  
**Files and lines:** `ss` on VM101  
**Infrastructure evidence:** 2026-11-06T06:29Z from VM103: `mysql_tcp_open` to `10.77.0.11:3306`. Also `pve_tcp_open` to `10.77.0.1:8006`.  
**Description:** MariaDB on the game node is reachable from the platform VM. No login attempted. PVE UI is reachable from vmbr1 (auth still required).  
**Impact:** Lateral movement from panel/platform/mail VMs.  
**Reproduction:** `ss -lnt` on VM101.  
**Root cause:** Default bind or leftover stack.  
**Recommendation:** Bind 127.0.0.1 or firewall 3306 to none.  
**Alternative approaches:** If eggs need it, restrict to Docker bridge only.  
**Estimated effort:** Small  
**Regression risk:** Medium if something remote uses it  
**Dependencies:** —  
**Acceptance test:** `ss` shows 3306 on loopback or not at all; eggs still start.  
**Launch blocker:** Yes until purpose is known  

---

**Finding ID:** BM-011  
**Title:** VPS guests share L2 on vmbr2 without port isolation  
**Priority:** P1  
**Confidence:** Medium  
**Evidence status:** PARTIAL (code+operator note; not packet-tested)  
**Affected systems:** vmbr2, VM1001/1002  
**Files and lines:** `/usr/local/sbin/blipmade-network.sh` (vmbr2 create, DROP to 10.77.0.0/24); `~/.claude/projects/-root/memory/blipmade-network-ips.md` 2026-10-30  
**Infrastructure evidence:** script enabled as `blipmade-network.service`; no ebtables/port isolation in script tail  
**Description:** VPS cannot reach platform network (script). They can still reach each other on 10.78.0.0/24.  
**Impact:** Customer-to-customer scan/attack on the VPS LAN.  
**Reproduction:** Proposed: from two VPS ping each other. Not executed.  
**Root cause:** Bridge without isolated ports.  
**Recommendation:** `isolated` on taps / private VLAN / Open vSwitch.  
**Alternative approaches:** One bridge per customer (heavy).  
**Estimated effort:** Medium  
**Regression risk:** Medium  
**Dependencies:** —  
**Acceptance test:** VPS A cannot ping VPS B; both still reach internet via .119.  
**Launch blocker:** Yes for multi-tenant VPS  

---

**Finding ID:** BM-012  
**Title:** Quotes omit platform VAT when live payments are on  
**Priority:** P1  
**Confidence:** High for code; legal impact UNVERIFIED  
**Evidence status:** VERIFIED (code)  
**Affected systems:** `catalog.ts` quote, Stripe Tax unset  
**Files and lines:** `api/src/routes/catalog.ts` ~590–594 `flatRateCollected = !env.paymentsEnabled`  
**Infrastructure evidence:** `STRIPE_TAX_ENABLED=UNSET`; `PAYMENTS_ENABLED=true`  
**Description:** Comment says the card is charged the order sum and the settings flat tax is not collected when payments are on. Stripe Tax is not enabled. EU VAT may be missing.  
**Impact:** Under-collection / compliance. Example: 1000 minor units quoted with taxRate 19% shows 1000 live, 1190 when payments off.  
**Reproduction:** Read those lines; do not place a live order.  
**Root cause:** Tax deferred to Stripe Tax that was never turned on.  
**Recommendation:** Owner/legal: Stripe Tax or explicit no-VAT statement. Align quote and invoice.  
**Alternative approaches:** Keep payments off until then.  
**Estimated effort:** Medium  
**Regression risk:** High (money)  
**Dependencies:** BM-002, K-17  
**Acceptance test:** Test-mode quote+invoice include the intended tax.  
**Launch blocker:** Yes for paid EU sales  

---

**Finding ID:** BM-013  
**Title:** ZIP install extracts via Wings `decompressArchive`, not the inspect-time path filter  
**Priority:** P2  
**Confidence:** Medium  
**Evidence status:** PARTIAL  
**Affected systems:** `git-deploy.ts` `installArchive`; `import-inspect.ts` `zipLayoutProblem`  
**Files and lines:** `installArchive` uploads then `client.decompressArchive`; inspect refuses `..` only on the inspect path  
**Infrastructure evidence:** code only  
**Description:** Inspect parser is careful. Apply trusts Pterodactyl decompress inside the server filesystem. Zip-slip then is a Wings behaviour question.  
**Impact:** Write outside intended inbox **inside the container** if Wings is weak. Not host escape by itself.  
**Reproduction:** Proposed malicious zip on disposable server. Not executed.  
**Root cause:** Two zip implementations.  
**Recommendation:** Decompress only after `zipLayoutProblem`; or disable decompress and unpack allowlisted names.  
**Alternative approaches:** Build in a throwaway job.  
**Estimated effort:** Medium  
**Regression risk:** Medium  
**Dependencies:** BM-004  
**Acceptance test:** Zip with `../` entries is refused before Wings decompress.  
**Launch blocker:** No if installs stay in disposable containers; Yes if combined with host mounts (none seen).

---

**Finding ID:** BM-014  
**Title:** Production commit does not match the audit working tree  
**Priority:** P2  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** Deploy  
**Files and lines:** —  
**Infrastructure evidence:** prod `8b07cd2d` 05:59Z; `/root/work` `952b7492` plus dirty Deploy Studio files  
**Description:** Audit of git is not an audit of what Caddy serves.  
**Impact:** False conclusions if ignored.  
**Reproduction:** `git -C /opt/blipmade rev-parse HEAD` vs `/root/work`  
**Root cause:** Deploy during the audit; local branch dirty.  
**Recommendation:** Audit production SHA or freeze deploys during audit.  
**Alternative approaches:** —  
**Estimated effort:** Small  
**Regression risk:** n/a  
**Dependencies:** —  
**Acceptance test:** SHAs match when reporting UI bugs.  
**Launch blocker:** No

---

**Finding ID:** BM-015  
**Title:** Live payments plus 59 orderable SKUs, many unproven  
**Priority:** P0  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** Checkout, catalogue, Stripe  
**Files and lines:** `createCheckout` when `paymentsEnabled`; `GET /catalog/products` availability  
**Infrastructure evidence:** 2026-11-06T06:29Z 75 products, **59 `orderable`/`DEPLOYABLE`**, 16 `COMING_SOON`. Orderable includes `folding-at-home`, `dart`, `lua`, `golang`, `rust-runtime`, `wordpress`, `discord-bot`, four VPS, three email plans (€2.99–€11.99). `MAIL_SALES_ENABLED=true`. Public `/apps` copy: “49 things you can deploy right now”. No Stripe Dashboard query: **no proof money has already moved**.  
**Description:** Readiness gate marks many runtimes DEPLOYABLE. Combined with BM-002, a visitor who registers can open live Checkout for SKUs this audit did not prove on a node.  
**Impact:** Pay without a working service, or receive unpaid-looking SKUs that fail after charge.  
**Reproduction:** `curl https://blipmade.com/api/catalog/products` and health `stripe:live`. Do not pay.  
**Root cause:** `deployable`/gate weaker than a live install proof; payments flag on.  
**Recommendation:** `PAYMENTS_ENABLED=false` or shrink orderable to proven SKUs (Paper, one bot, one VPS).  
**Alternative approaches:** Stripe test mode keys.  
**Estimated effort:** Small (flag) / Large (prove SKUs)  
**Regression risk:** Low for turning off payments  
**Dependencies:** BM-002, BM-012, BM-018  
**Acceptance test:** Only named SKUs `orderable`; checkout `payments_unavailable` or test mode.  
**Launch blocker:** Yes

---

**Finding ID:** BM-016  
**Title:** VPS readiness gate does not check host capacity  
**Priority:** P1  
**Confidence:** High  
**Evidence status:** VERIFIED (code)  
**Affected systems:** `readiness-gate.ts`, VPS orders  
**Files and lines:** `evaluateGate` VPS branch only `providerReady` (Proxmox URL+token). `capacityReady` is server-only. `VPS_MAX_SLOTS` default 150.  
**Infrastructure evidence:** Host 251 GiB RAM, game node already 131 GiB assigned.  
**Description:** Checkout can accept VPS orders until slots run out in software, without asking whether RAM/disk remain.  
**Impact:** Over-commit, failed clones, noisy neighbor.  
**Reproduction:** Read `readiness-gate.ts` 137–141.  
**Root cause:** Gate incomplete for VPS.  
**Recommendation:** Check free RAM/disk on `local` and running VPS sum before `orderable`.  
**Alternative approaches:** Low `VPS_MAX_SLOTS`.  
**Estimated effort:** Medium  
**Regression risk:** Medium  
**Dependencies:** BM-009, BM-001  
**Acceptance test:** Order refused when host free RAM < plan.  
**Launch blocker:** Yes before selling VPS at default 150 slots

---

**Finding ID:** BM-017  
**Title:** GitHub OAuth has no PKCE; Google/Discord/Apple do  
**Priority:** P3  
**Confidence:** High  
**Evidence status:** VERIFIED (code)  
**Affected systems:** `oauth/flow.ts`  
**Files and lines:** GitHub branch sets scope only; no `code_challenge`. Callback still consumes `state`.  
**Infrastructure evidence:** Login page offers GitHub/Google/Discord.  
**Description:** Confidential-server GitHub apps often skip PKCE. State is present. Not a CSRF hole by itself.  
**Impact:** Weaker than other providers if the client_secret leaks.  
**Reproduction:** Read `beginOAuth` GitHub branch.  
**Root cause:** GitHub token endpoint historically without PKCE.  
**Recommendation:** Add S256 if GitHub app allows.  
**Alternative approaches:** Leave; protect client_secret.  
**Estimated effort:** Small  
**Regression risk:** Low  
**Dependencies:** BM-003 (refresh tokens sealed)  
**Acceptance test:** Authorize URL includes `code_challenge`.  
**Launch blocker:** No

---

**Finding ID:** BM-018  
**Title:** Hosted mail is on sale (`MAIL_SALES_ENABLED=true`)  
**Priority:** P1  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** Mailcow VM104, catalog EMAIL  
**Files and lines:** env flag; three products DEPLOYABLE with prices 299/599/1199 EUR cents  
**Infrastructure evidence:** Mailcow listening; **no** Blipmade offsite unit on VM104; docker.sock denied for audit SSH user.  
**Description:** K-19 said mail stays coming-soon. Production sells three plans. Isolation, quotas, deliverability not proven this pass.  
**Impact:** Paid mailboxes on unbacked Mailcow disk (RAID0).  
**Reproduction:** Catalog JSON; `.env` metadata `MAIL_SALES=true`.  
**Root cause:** Sales flag on before DR for mail.  
**Recommendation:** Turn `MAIL_SALES_ENABLED` off until backup+quota proof, or add offsite agent like VPS.  
**Alternative approaches:** Keep selling; accept data-loss ToS (weak).  
**Estimated effort:** Medium  
**Regression risk:** Medium  
**Dependencies:** BM-001, BM-012  
**Acceptance test:** Mail SKU `COMING_SOON` or Mailcow off-site restore drill.  
**Launch blocker:** Yes for mail SKU

---

**Finding ID:** BM-019  
**Title:** Public catalogue count does not match the API  
**Priority:** P2  
**Confidence:** Medium  
**Evidence status:** PARTIAL  
**Affected systems:** `/apps` prerender vs `/api/catalog/products`  
**Files and lines:** `web/src/site/Apps.tsx` “{available} things you can deploy”  
**Infrastructure evidence:** Browser 2026-11-06 `/apps` “49 things”. API 59 `orderable`. Likely prerender vs live, or VPS/mail filtered.  
**Impact:** Marketing number is wrong. Trust.  
**Reproduction:** Open `/apps`; curl catalog.  
**Root cause:** Build-time catalogue snapshot.  
**Recommendation:** Render the live count or the same filter as the API.  
**Alternative approaches:** Drop the number.  
**Estimated effort:** Small  
**Regression risk:** Low  
**Dependencies:** BM-015  
**Acceptance test:** Page count equals filtered API.  
**Launch blocker:** No

---

**Finding ID:** BM-020  
**Title:** Dual catalogue UI: Products and Catalogue families both in admin nav  
**Priority:** P2  
**Confidence:** High  
**Evidence status:** VERIFIED (routes)  
**Affected systems:** Admin nav, Deploy Studio vs FamilyDeploy vs Product  
**Files and lines:** `web/src/nav.ts` Catalog + Catalogue families; customer `/app/deploy`, `/app/deploy/families/:slug`, `/app/deploy/:slug`, `/app/vps/new`, `/app/email/checkout`  
**Infrastructure evidence:** 30+ admin nav entries. Staff lifecycle API does exist (invite/grant/remove).  
**Description:** Two catalogue sources (`Product` and `CatalogFamily`) and five customer buy paths. Operators cannot see one SKU truth. Dirty Deploy Studio in the worktree is **not** production.  
**Impact:** Wrong prices, hidden products, training cost.  
**Reproduction:** Compare nav.ts and schema models.  
**Root cause:** #20 overlay on legacy Product.  
**Recommendation:** Freeze one source; hide the other nav entry.  
**Alternative approaches:** Keep both with a written map (expensive).  
**Estimated effort:** Architectural  
**Regression risk:** High  
**Dependencies:** #20  
**Acceptance test:** One admin list is the storefront source.  
**Launch blocker:** No (process); Yes if prices diverge (UNVERIFIED)

---

**Finding ID:** BM-021  
**Title:** Mailcow has no Blipmade off-site backup job  
**Priority:** P1  
**Confidence:** High  
**Evidence status:** VERIFIED  
**Affected systems:** VM104  
**Files and lines:** `backup_and_restore.sh` in Mailcow tree; no `blipmade-offsite-*` unit on VM104  
**Infrastructure evidence:** timers on VM104: `dpkg-db-backup` only  
**Description:** Mail data dies with RAID0. VPS and game-node agents exist; mail was skipped.  
**Impact:** Paid mailbox loss.  
**Reproduction:** `ssh vm104 systemctl list-timers`  
**Root cause:** Agent never installed on mail VM.  
**Recommendation:** Encrypted Maildir/SQL off-site like VPS mode.  
**Alternative approaches:** Cold standby script already in tree — schedule it off-host.  
**Estimated effort:** Medium  
**Regression risk:** Low  
**Dependencies:** BM-001, BM-018  
**Acceptance test:** Off-site receipt for mail; restore drill.  
**Launch blocker:** Yes for mail SKU

---

**Finding ID:** BM-022  
**Title:** Guest claim 401 is expected without a session  
**Priority:** P4  
**Confidence:** High  
**Evidence status:** VERIFIED (not a defect)  
**Affected systems:** `support-guest.ts`, `ChatWidget.tsx`  
**Files and lines:** `POST /support/guest/claim` calls `requireAuth`; no guest cookie returns `{claimed:0}`. `ChatWidget` only mounts in authenticated customer shell. `GuestChatWidget` on public pages uses thread/config, not claim. Tests expect 401 without session.  
**Description:** Recorded so the next agent does not re-open it.  
**Impact:** None.  
**Reproduction:** Read those files.  
**Root cause:** n/a  
**Recommendation:** Do not “fix” 401 on anonymous claim.  
**Alternative approaches:** —  
**Estimated effort:** —  
**Regression risk:** —  
**Dependencies:** —  
**Acceptance test:** Authenticated claim without guest cookie returns 0.  
**Launch blocker:** No
