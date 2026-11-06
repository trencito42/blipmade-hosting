# 23 — Unverified and blocked

| Item | Why | How to verify locally |
|---|---|---|
| Stripe Dashboard charges/refunds/tax | No live Stripe API | Owner Dashboard |
| Money already moved | Same | Dashboard + `Payment` rows with staff |
| Off-site object listing / decrypt | Avoided backup SSH; age key off-host | `ssh blipmade-offsite ls`; restore drill |
| VPS 1002 qmrestore | Not executed | Spare VMID |
| PVE configs off-host | Not in VM103 dump proof | Copy `/etc/pve` |
| Panel MariaDB dump | Not found on VM103 | Dump on VM100 |
| Internet Wings 8080 / panel 443 / PVE 8006 | No hairpin DNAT; 8006 open on vmbr1 | Curl from phone/VPS |
| Mailcow docker health / IMAP / DKIM | docker.sock denied | `sudo docker ps`; mail-tester |
| Two-account IDOR | No test users | Staging pair |
| Authenticated /app /admin click-through | No authorized session | Owner login; do not export cookies |
| Game client join | No client | Staging Paper |
| Cloudflare zone contents | No token use | Staging zone |
| GitHub Actions on `8b07cd2d` | `gh` missing | GitHub UI |
| `apt` pending CVEs | Not listed | `apt-get -s upgrade` |
| WAL/PITR | Not seen | `postgresql.conf` in container |
| Issue #28 body | `gh` missing | `gh issue view 28` |
| Caddy live JSON | admin 2019 localhost | Careful `caddy adapt` |
| Dirty Deploy Studio vs prod UI | SHA drift BM-014 | Deploy or ignore dirty files |
| Host postgres/redis purpose | Present on hypervisor loopback | Operator |

**Closed this pass:** live egg 16 placeholder (verified); VPS weekly off-site (verified job, not restore); MariaDB 3306 from VM103 (TCP open); PVE 8006 from vmbr1 (TCP open); guest claim 401 expected; H5 empty named volume.
