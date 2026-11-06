#!/usr/bin/env bash
# The offsite backup agent. It runs where the files are: on the game node (customer backups and databases) and on
# the hypervisor (virtual private servers). It encrypts every copy with age BEFORE it leaves the machine, uploads it
# under a temporary name, reads it back and compares the hash, and only then moves it to its final name and reports
# "verified" to the platform. A file that was uploaded but not read back is never reported as verified.
#
# Configuration: /etc/blipmade/offsite.env (root, mode 600). See scripts/offsite.env.example. Nothing secret is
# accepted on the command line. The age IDENTITY (the private key) is never on the machines that make backups: only
# the public recipient is.
#
# Modes:  customers | databases | vps | infra | pve | platform | retention | destination | drill <remote path> <identity file>
# drill decrypts and tests the archive. It never reports a restore.
set -euo pipefail
umask 077

ENV_FILE="${OFFSITE_ENV_FILE:-/etc/blipmade/offsite.env}"
# shellcheck disable=SC1090
[ -r "$ENV_FILE" ] && . "$ENV_FILE"

: "${OFFSITE_TRANSPORT:=ssh}"            # ssh (Hetzner storage box) or local (tests only)
: "${OFFSITE_BASE:=blipmade}"
: "${OFFSITE_PORT:=23}"
: "${NODE_NAME:=$(hostname -s)}"
: "${STATE_DIR:=/var/lib/blipmade-offsite}"
: "${PTERO_BACKUP_DIR:=/var/lib/pterodactyl/backups}"
: "${CAPACITY_MAX_PERCENT:=85}"
: "${BWLIMIT_KBPS:=0}"
: "${RETENTION_CUSTOMER_DAYS:=30}"
: "${RETENTION_DB_DAILY:=7}"
: "${RETENTION_DB_WEEKLY:=4}"
: "${RETENTION_VPS_KEEP:=3}"
: "${DB_MIN_INTERVAL_HOURS:=20}"
: "${VPS_MIN_INTERVAL_HOURS:=160}"       # about weekly: vzdump makes full copies, so it is not run more often
: "${VPS_POOL:=vps}"
# Infra VMs on this hypervisor, not the 900G game node (file-level jobs cover Wings data).
: "${INFRA_VMIDS:=100 102 103 104 105}"
: "${INFRA_MIN_INTERVAL_HOURS:=160}"
: "${RETENTION_PVE_KEEP:=14}"
: "${STAGING_DIR:=$STATE_DIR/staging}"
: "${MARIADB_DEFAULTS_FILE:=/etc/blipmade/backup-mariadb.cnf}"

mkdir -p "$STATE_DIR/done" "$STAGING_DIR"
chmod 700 "$STATE_DIR" "$STAGING_DIR"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*"; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is not installed"; }
need age; need curl; need sha256sum

exec 9>"$STATE_DIR/agent.lock"
flock -n 9 || { log "another run is in progress, nothing to do"; exit 0; }

# ------------------------------------------------------------------ transport
SSH_OPTS=(-i "${OFFSITE_KEY:-/etc/blipmade/storagebox_key}" -p "$OFFSITE_PORT" -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="${OFFSITE_KNOWN_HOSTS:-/etc/blipmade/storagebox_known_hosts}"
  -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
rsh() { ssh "${SSH_OPTS[@]}" "$OFFSITE_HOST" "$@"; }
rsync_ssh() { rsync -e "ssh ${SSH_OPTS[*]}" --bwlimit="$BWLIMIT_KBPS" "$@"; }

# Bounded exponential backoff: 5, 15, 45 seconds, then it gives up and the failure is reported.
retry() {
  local n=0 delay=5
  until "$@"; do
    n=$((n + 1)); [ "$n" -ge 4 ] && return 1
    log "attempt $n failed: $*; waiting ${delay}s"; sleep "$delay"; delay=$((delay * 3))
  done
}

# Where a path under the base lives on a local test destination. Never empty: the :? stops the script instead.
lpath() { printf '%s/%s/%s' "${OFFSITE_LOCAL_DIR:?}" "${OFFSITE_BASE:?}" "${1:?}"; }

t_mkdir() {  # t_mkdir <dir under base>
  if [ "$OFFSITE_TRANSPORT" = local ]; then mkdir -p "$(lpath "$1")"; chmod 700 "$(lpath "$1")"
  else local d="$OFFSITE_BASE" part; rsh "mkdir $OFFSITE_BASE" >/dev/null 2>&1 || true
    for part in ${1//\// }; do d="$d/$part"; rsh "mkdir $d" >/dev/null 2>&1 || true; done; fi
}
t_put() {  # t_put <local file> <remote rel path>: uploads under a .part name and moves it once whole
  local src="$1" rel="$2"
  if [ "$OFFSITE_TRANSPORT" = local ]; then cp "$src" "$(lpath "$rel").part" && mv "$(lpath "$rel").part" "$(lpath "$rel")"
  else rsync_ssh --partial "$src" "$OFFSITE_HOST:$OFFSITE_BASE/$rel.part" && rsh "mv $OFFSITE_BASE/$rel.part $OFFSITE_BASE/$rel"; fi
}
t_fetch() {  # t_fetch <remote rel path> <local file>
  if [ "$OFFSITE_TRANSPORT" = local ]; then cp "$(lpath "$1")" "$2"; else rsync_ssh "$OFFSITE_HOST:$OFFSITE_BASE/$1" "$2"; fi
}
t_sha() {  # the hash of what is on the destination: the remote hash tool when it exists, else the file read back
  local out tmp
  if [ "$OFFSITE_TRANSPORT" = local ]; then sha256sum "$(lpath "$1")" | cut -d' ' -f1; return; fi
  if out="$(rsh "sha256sum $OFFSITE_BASE/$1" 2>/dev/null)" && [[ "$out" =~ ^[a-f0-9]{64} ]]; then printf '%s' "${out:0:64}"; return; fi
  tmp="$(mktemp -p "$STAGING_DIR")"; t_fetch "$1" "$tmp" && sha256sum "$tmp" | cut -d' ' -f1; rm -f -- "${tmp:?}"
}
t_ls() {  # t_ls <dir under base>: one file name per line
  if [ "$OFFSITE_TRANSPORT" = local ]; then ls -1 "$(lpath "${1:-.}")" 2>/dev/null || true
  else rsh "ls $OFFSITE_BASE/$1" 2>/dev/null | tr ' ' '\n' | grep -v '^$' || true; fi
}
t_rm() {
  if [ "$OFFSITE_TRANSPORT" = local ]; then rm -f -- "$(lpath "$1")"; else rsh "rm $OFFSITE_BASE/$1" >/dev/null; fi
}
t_df() {  # prints "<total bytes> <used bytes>" or nothing
  if [ "$OFFSITE_TRANSPORT" = local ]; then df -B1 --output=size,used "${OFFSITE_LOCAL_DIR:?}" | tail -1; return; fi
  rsh df 2>/dev/null | awk 'NR>1 && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ {print $2*1024, $3*1024; exit}'
}

# --------------------------------------------------------------------- report
json_safe() { printf '%s' "$1" | tr -d '\n\r\t' | sed 's/[\\"]/ /g' | cut -c1-400; }
post() {  # post <endpoint> <json>
  [ -n "${REPORT_URL:-}" ] && [ -n "${REPORT_TOKEN:-}" ] || return 0
  curl -fsS -m 25 -H "Authorization: Bearer $REPORT_TOKEN" -H 'content-type: application/json' -d "$2" "$REPORT_URL/$1" >/dev/null || log "the platform could not be told ($1)"
}
report() {  # report <kind> <remote rel> <source id> <state> <size> <sha> <taken iso> [error]
  local err; err="$(json_safe "${8:-}")"
  post report "$(printf '{"kind":"%s","remotePath":"%s","sourceId":"%s","node":"%s","sizeBytes":%s,"state":"%s"%s%s%s}' \
    "$1" "$2" "$3" "$NODE_NAME" "${5:-0}" "$4" "${6:+,\"sha256\":\"$6\"}" "${7:+,\"takenAt\":\"$7\"}" "${err:+,\"error\":\"$err\"}")"
}

# ------------------------------------------------------------------- capacity
capacity_ok() {  # refuses new uploads when the destination is nearly full
  local line total used pct
  line="$(t_df || true)"; read -r total used <<<"${line:-}"
  [ -n "${total:-}" ] && [ "$total" -gt 0 ] || { log "capacity unknown, continuing"; return 0; }
  pct=$((used * 100 / total))
  [ "$pct" -lt "$CAPACITY_MAX_PERCENT" ] && return 0
  log "the destination is ${pct}% full, new uploads are refused"; return 1
}

# ------------------------------------------------------- encrypt, upload, verify
# upload_verified <kind> <source id> <local file> <remote dir> <remote name> <taken iso>
upload_verified() {
  local kind="$1" source="$2" file="$3" dir="$4" name="$5" taken="$6" enc rel size sha got
  rel="$dir/$name"; enc="$STAGING_DIR/$name"
  capacity_ok || { report "$kind" "$rel" "$source" FAILED 0 "" "$taken" "destination is nearly full"; return 1; }
  age -r "$OFFSITE_AGE_RECIPIENT" -o "$enc" "$file" || { report "$kind" "$rel" "$source" FAILED 0 "" "$taken" "encryption failed"; rm -f -- "${enc:?}"; return 1; }
  size="$(stat -c %s "$enc")"; sha="$(sha256sum "$enc" | cut -d' ' -f1)"
  report "$kind" "$rel" "$source" OFFSITE_PENDING "$size" "$sha" "$taken"
  t_mkdir "$dir" || true
  if ! retry t_put "$enc" "$rel"; then report "$kind" "$rel" "$source" FAILED "$size" "$sha" "$taken" "upload failed after retries"; rm -f -- "${enc:?}"; return 1; fi
  got="$(retry t_sha "$rel" || true)"
  rm -f -- "${enc:?}"
  if [ "$got" != "$sha" ]; then
    t_rm "$rel" || true
    report "$kind" "$rel" "$source" FAILED "$size" "$sha" "$taken" "the copy read back from the destination did not match"
    return 1
  fi
  report "$kind" "$rel" "$source" OFFSITE_VERIFIED "$size" "$sha" "$taken"
  log "verified: $rel ($size bytes)"
}

iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }

# ------------------------------------------------------------ customer backups
mode_customers() {
  [ -d "$PTERO_BACKUP_DIR" ] || die "$PTERO_BACKUP_DIR does not exist"
  local f uuid mt now; now="$(date +%s)"
  for f in "$PTERO_BACKUP_DIR"/*.tar.gz; do
    [ -e "$f" ] || continue
    uuid="$(basename "$f" .tar.gz)"
    [[ "$uuid" =~ ^[0-9a-f-]{36}$ ]] || continue
    [ -e "$STATE_DIR/done/$uuid" ] && continue
    mt="$(stat -c %Y "$f")"
    [ $((now - mt)) -gt 600 ] || { log "$uuid is still being written, later"; continue; }   # an incomplete archive is never taken
    tar -tzf "$f" >/dev/null 2>&1 || { report CUSTOMER "customers/$NODE_NAME/$uuid.tar.gz.age" "$uuid" FAILED 0 "" "$(iso "$mt")" "the archive is not readable"; continue; }
    if upload_verified CUSTOMER "$uuid" "$f" "customers/$NODE_NAME" "$uuid.tar.gz.age" "$(iso "$mt")"; then : > "$STATE_DIR/done/$uuid"; fi
  done
}

# ------------------------------------------------------------------- databases
mode_databases() {
  need mariadb; need mariadb-dump; need gzip
  [ -r "$MARIADB_DEFAULTS_FILE" ] || die "$MARIADB_DEFAULTS_FILE is missing (the read-only backup user)"
  local db stamp tmp last now; now="$(date +%s)"
  while read -r db; do
    [[ "$db" =~ ^s[0-9]+_[A-Za-z0-9_]+$ ]] || continue          # customer databases only; never the platform's or the system's
    last="$(cat "$STATE_DIR/done/db-$db" 2>/dev/null || echo 0)"
    [ $((now - last)) -gt $((DB_MIN_INTERVAL_HOURS * 3600)) ] || continue
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"; tmp="$STAGING_DIR/$db.sql.gz"
    # A consistent logical dump: one transaction for InnoDB tables, with routines, events and triggers.
    if ! mariadb-dump --defaults-extra-file="$MARIADB_DEFAULTS_FILE" --single-transaction --quick --routines --events --triggers --hex-blob "$db" | gzip -c > "$tmp"; then
      report DATABASE "databases/$NODE_NAME/$db/$db-$stamp.sql.gz.age" "$db/$stamp" FAILED 0 "" "" "the dump failed"; rm -f -- "${tmp:?}"; continue
    fi
    gzip -t "$tmp" || { report DATABASE "databases/$NODE_NAME/$db/$db-$stamp.sql.gz.age" "$db/$stamp" FAILED 0 "" "" "the dump is not a valid archive"; rm -f -- "${tmp:?}"; continue; }
    if upload_verified DATABASE "$db/$stamp" "$tmp" "databases/$NODE_NAME/$db" "$db-$stamp.sql.gz.age" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"; then printf '%s' "$now" > "$STATE_DIR/done/db-$db"; fi
    rm -f -- "${tmp:?}"
  done < <(mariadb --defaults-extra-file="$MARIADB_DEFAULTS_FILE" -N -e 'SHOW DATABASES')
}

# ------------------------------------------------------------ virtual servers
mode_vps() {
  need vzdump; need pvesh
  local vmid last now stamp file name; now="$(date +%s)"
  local vms="${VPS_ONLY:-}"     # a space separated list of VM ids limits the run, for a test
  [ -n "$vms" ] || vms="$(pvesh get "/pools/$VPS_POOL" --output-format json 2>/dev/null | grep -o '"vmid":[0-9]*' | cut -d: -f2)"
  for vmid in $vms; do
    last="$(cat "$STATE_DIR/done/vm-$vmid" 2>/dev/null || echo 0)"
    # vzdump writes a full copy every time, so a VM is not copied again before the interval: no duplicate fulls.
    [ $((now - last)) -gt $((VPS_MIN_INTERVAL_HOURS * 3600)) ] || continue
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    # Native Proxmox backup. In snapshot mode with the guest agent the file systems are frozen for a moment, which makes
    # the disk crash-consistent. It does NOT make a running database consistent: that is what the database dumps are for.
    if ! vzdump "$vmid" --mode snapshot --compress zstd --dumpdir "$STAGING_DIR" --quiet 1 >"$STATE_DIR/vzdump-$vmid.log" 2>&1; then
      report VPS "vps/$NODE_NAME/vm$vmid/failed-$stamp" "vm$vmid" FAILED 0 "" "" "vzdump failed: $(tail -n 1 "$STATE_DIR/vzdump-$vmid.log")"; continue
    fi
    file="$(ls -1t "$STAGING_DIR"/vzdump-qemu-"$vmid"-*.vma.zst 2>/dev/null | sed -n 1p || true)"
    [ -n "$file" ] || { report VPS "vps/$NODE_NAME/vm$vmid/failed-$stamp" "vm$vmid" FAILED 0 "" "" "vzdump produced no file"; continue; }
    name="$(basename "$file").age"
    if upload_verified VPS "vm$vmid" "$file" "vps/$NODE_NAME/vm$vmid" "$name" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"; then printf '%s' "$now" > "$STATE_DIR/done/vm-$vmid"; fi
    find "${STAGING_DIR:?}" -maxdepth 1 -name "vzdump-qemu-$vmid-*" -type f -delete
  done
}

# -------------------------------------------------------------- infra VMs
# Same vzdump path as VPS, different remote prefix. Skips the game node unless listed.
mode_infra() {
  need vzdump
  local vmid last now stamp file name; now="$(date +%s)"
  local vms="${INFRA_ONLY:-$INFRA_VMIDS}"
  for vmid in $vms; do
    last="$(cat "$STATE_DIR/done/infra-$vmid" 2>/dev/null || echo 0)"
    [ $((now - last)) -gt $((INFRA_MIN_INTERVAL_HOURS * 3600)) ] || continue
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    if ! vzdump "$vmid" --mode snapshot --compress zstd --dumpdir "$STAGING_DIR" --quiet 1 >"$STATE_DIR/vzdump-infra-$vmid.log" 2>&1; then
      report INFRA "infra/$NODE_NAME/vm$vmid/failed-$stamp" "vm$vmid" FAILED 0 "" "" "vzdump failed: $(tail -n 1 "$STATE_DIR/vzdump-infra-$vmid.log")"; continue
    fi
    file="$(ls -1t "$STAGING_DIR"/vzdump-qemu-"$vmid"-*.vma.zst 2>/dev/null | sed -n 1p || true)"
    [ -n "$file" ] || { report INFRA "infra/$NODE_NAME/vm$vmid/failed-$stamp" "vm$vmid" FAILED 0 "" "" "vzdump produced no file"; continue; }
    name="$(basename "$file").age"
    if upload_verified INFRA "vm$vmid" "$file" "infra/$NODE_NAME/vm$vmid" "$name" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"; then printf '%s' "$now" > "$STATE_DIR/done/infra-$vmid"; fi
    find "${STAGING_DIR:?}" -maxdepth 1 -name "vzdump-qemu-$vmid-*" -type f -delete
  done
}

# ----------------------------------------------------------- Proxmox configs
# Tiny: VM definitions so a lost host can still be reconstructed. Not the VM disks.
mode_pve() {
  need tar
  local stamp tmp name now last; now="$(date +%s)"
  last="$(cat "$STATE_DIR/done/pve-config" 2>/dev/null || echo 0)"
  [ $((now - last)) -gt 72000 ] || { log "pve config was copied recently"; return 0; }
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  tmp="$STAGING_DIR/pve-config-$stamp.tar.gz"
  tar -C /etc/pve -h -czf "$tmp" nodes/n7030e1/qemu-server storage.cfg
  tar -tzf "$tmp" >/dev/null || { report PVE "pve/$NODE_NAME/failed-$stamp" "pve-config" FAILED 0 "" "" "the archive is not readable"; rm -f -- "${tmp:?}"; return 1; }
  name="$(basename "$tmp").age"
  if upload_verified PVE "pve-config" "$tmp" "pve/$NODE_NAME" "$name" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"; then printf '%s' "$now" > "$STATE_DIR/done/pve-config"; fi
  rm -f -- "${tmp:?}"
}

# ------------------------------------------------------------------ the platform
# The newest archive of scripts/backup.sh (database dump and configuration without secrets) goes to the box as well.
# The copy that backup-offsite.sh makes goes to another VM of the same machine, so it does not survive the loss of
# the machine; this one does.
mode_platform() {
  local dir="${PLATFORM_BACKUP_DIR:-/var/backups/blipmade}" f name mt now; now="$(date +%s)"
  f="$(ls -1t "$dir"/blipmade-scheduled-*.tar.gz 2>/dev/null | sed -n 1p || true)"
  [ -n "$f" ] || { log "no scheduled platform archive in $dir"; return 0; }
  name="$(basename "$f")"
  [ -e "$STATE_DIR/done/platform-$name" ] && { log "$name is already on the box"; return 0; }
  mt="$(stat -c %Y "$f")"; [ $((now - mt)) -gt 120 ] || { log "$name is still being written"; return 0; }
  tar -tzf "$f" >/dev/null 2>&1 || { report PLATFORM "platform/$NODE_NAME/$name.age" "$name" FAILED 0 "" "$(iso "$mt")" "the archive is not readable"; return 1; }
  if upload_verified PLATFORM "$name" "$f" "platform/$NODE_NAME" "$name.age" "$(iso "$mt")"; then : > "$STATE_DIR/done/platform-$name"; fi
}

# ------------------------------------------------------------------- retention
protected_list() {  # the newest verified copy of every source: never deleted
  curl -fsS -m 25 -H "Authorization: Bearer $REPORT_TOKEN" "$REPORT_URL/protected?kind=$1" | grep -o '"[^"]*"' | tr -d '"' | grep -v '^protected$' || true
}
mode_retention() {
  [ -n "${REPORT_URL:-}" ] && [ -n "${REPORT_TOKEN:-}" ] || die "retention needs REPORT_URL and REPORT_TOKEN: it never deletes without knowing which copies are protected"
  local keep f db day dow kept_days kept_weeks vm n mark
  # customer backups: by age, never the protected ones
  keep="$(protected_list CUSTOMER)" || die "could not read the protected list"
  while read -r f; do
    [ -n "$f" ] || continue
    grep -qx "customers/$NODE_NAME/$f" <<<"$keep" && continue
    mark="$STATE_DIR/done/${f%.tar.gz.age}"
    [ -e "$mark" ] || continue
    [ "$(( $(date +%s) - $(stat -c %Y "$mark") ))" -gt $((RETENTION_CUSTOMER_DAYS * 86400)) ] || continue
    t_rm "customers/$NODE_NAME/$f" && find "${STATE_DIR:?}/done" -maxdepth 1 -name "${f%.tar.gz.age}" -type f -delete && log "removed old $f"
  done < <(t_ls "customers/$NODE_NAME")
  # database dumps: the last N days and the last N Sundays
  keep="$(protected_list DATABASE)" || die "could not read the protected list"
  while read -r db; do
    [ -n "$db" ] || continue
    kept_days=0; kept_weeks=0
    while read -r f; do
      [ -n "$f" ] || continue
      day="${f#"$db-"}"; day="${day:0:8}"; dow="$(date -u -d "$day" +%u 2>/dev/null || echo 0)"
      grep -qx "databases/$NODE_NAME/$db/$f" <<<"$keep" && continue
      if [ "$kept_days" -lt "$RETENTION_DB_DAILY" ]; then kept_days=$((kept_days + 1)); continue; fi
      if [ "$dow" = 7 ] && [ "$kept_weeks" -lt "$RETENTION_DB_WEEKLY" ]; then kept_weeks=$((kept_weeks + 1)); continue; fi
      t_rm "databases/$NODE_NAME/$db/$f" && log "removed old dump $f"
    done < <(t_ls "databases/$NODE_NAME/$db" | sort -r)
  done < <(t_ls "databases/$NODE_NAME")
  # the platform: the newest 14 archives
  keep="$(protected_list PLATFORM)" || die "could not read the protected list"
  n=0
  while read -r f; do
    [ -n "$f" ] || continue
    n=$((n + 1)); [ "$n" -le "${RETENTION_PLATFORM_KEEP:-14}" ] && continue
    grep -qx "platform/$NODE_NAME/$f" <<<"$keep" && continue
    t_rm "platform/$NODE_NAME/$f" && log "removed old platform copy $f"
  done < <(t_ls "platform/$NODE_NAME" | sort -r)
  # virtual servers: the newest few of each VM
  keep="$(protected_list VPS)" || die "could not read the protected list"
  while read -r vm; do
    [ -n "$vm" ] || continue; n=0
    while read -r f; do
      [ -n "$f" ] || continue
      n=$((n + 1)); [ "$n" -le "$RETENTION_VPS_KEEP" ] && continue
      grep -qx "vps/$NODE_NAME/$vm/$f" <<<"$keep" && continue
      t_rm "vps/$NODE_NAME/$vm/$f" && log "removed old VM copy $f"
    done < <(t_ls "vps/$NODE_NAME/$vm" | sort -r)
  done < <(t_ls "vps/$NODE_NAME")
  keep="$(protected_list INFRA)" || die "could not read the protected list"
  while read -r vm; do
    [ -n "$vm" ] || continue; n=0
    while read -r f; do
      [ -n "$f" ] || continue
      n=$((n + 1)); [ "$n" -le "$RETENTION_VPS_KEEP" ] && continue
      grep -qx "infra/$NODE_NAME/$vm/$f" <<<"$keep" && continue
      t_rm "infra/$NODE_NAME/$vm/$f" && log "removed old infra copy $f"
    done < <(t_ls "infra/$NODE_NAME/$vm" | sort -r)
  done < <(t_ls "infra/$NODE_NAME")
  keep="$(protected_list PVE)" || die "could not read the protected list"
  n=0
  while read -r f; do
    [ -n "$f" ] || continue
    n=$((n + 1)); [ "$n" -le "${RETENTION_PVE_KEEP:-14}" ] && continue
    grep -qx "pve/$NODE_NAME/$f" <<<"$keep" && continue
    t_rm "pve/$NODE_NAME/$f" && log "removed old pve copy $f"
  done < <(t_ls "pve/$NODE_NAME" | sort -r)
}

# ----------------------------------------------------------------- destination
t_count() {  # number of files under the base; listing only, never a download
  # Storage Box SSH is a restricted shell: find/echo are not there. rsync --list-only is.
  if [ "$OFFSITE_TRANSPORT" = local ]; then find "${OFFSITE_LOCAL_DIR:?}" -type f 2>/dev/null | wc -l
  else rsync_ssh -r --list-only "$OFFSITE_HOST:$OFFSITE_BASE/" 2>/dev/null | awk 'NF && $1 ~ /^-/ { n++ } END { print n+0 }'; fi
}

mode_destination() {
  local line total used files
  if line="$(t_df 2>/dev/null)" && [ -n "$line" ]; then
    read -r total used <<<"$line"
    files="$(t_count 2>/dev/null | tr -dc '0-9' || true)"
    files="${files:-0}"
    post destination "$(printf '{"reachable":true,"totalBytes":%s,"usedBytes":%s,"fileCount":%s,"node":"%s"}' "$total" "$used" "$files" "$NODE_NAME")"
    log "destination reachable: $used of $total bytes used, $files files"
  else
    post destination "{\"reachable\":false,\"error\":\"the destination could not be reached\",\"node\":\"$NODE_NAME\"}"
    die "the destination could not be reached"
  fi
}

# ----------------------------------------------------------------------- drill
# Fetch, decrypt, test the archive. Report decrypt-verified. Never restore-verified.
# Isolated restore is a separate operator procedure. drill <remote rel path under base> <identity file>
mode_drill() {
  local rel="$1" ident="$2" tmp="" out="" head_text
  cleanup_drill() { rm -f -- ${tmp:+"$tmp"} ${out:+"$out"}; }
  trap cleanup_drill EXIT
  [ -r "$ident" ] || die "identity file not readable"
  tmp="$(mktemp -p "$STAGING_DIR")"; out="$(mktemp -p "$STAGING_DIR")"
  t_fetch "$rel" "$tmp" || die "could not fetch $rel"
  age -d -i "$ident" -o "$out" "$tmp" || die "decryption failed: wrong identity or damaged copy"
  case "$rel" in
    customers/*) tar -tzf "$out" >/dev/null || die "the decrypted archive is not readable" ;;
    databases/*) gzip -t "$out" || die "the decrypted dump is not a valid archive"
      head_text="$(head -c 4096 < <(zcat "$out" 2>/dev/null) || true)"
      grep -q 'MariaDB dump\|MySQL dump' <<<"$head_text" || die "the decrypted dump is not a database dump" ;;
    vps/*|infra/*) zstd -t "$out" >/dev/null 2>&1 || die "the decrypted VM copy is not a valid archive" ;;
    pve/*|platform/*) tar -tzf "$out" >/dev/null || die "the decrypted archive is not readable" ;;
    *) die "unknown archive kind for $rel" ;;
  esac
  rm -f -- "${tmp:?}" "${out:?}"
  tmp=""; out=""
  post decrypt-verified "$(printf '{"remotePath":"%s","note":"decrypt and archive test on %s; not a restore"}' "$rel" "$(hostname -s)")"
  log "drill passed: $rel decrypts and the archive tests; this is not a restore"
}

case "${1:-}" in
  customers) mode_customers ;;
  databases) mode_databases ;;
  vps) mode_vps ;;
  infra) mode_infra ;;
  pve) mode_pve ;;
  platform) mode_platform ;;
  retention) mode_retention ;;
  destination) mode_destination ;;
  drill) shift; mode_drill "${1:?remote path}" "${2:?identity file}" ;;
  *) echo "usage: $0 customers|databases|vps|infra|pve|platform|retention|destination|drill <remote path> <identity>" >&2; exit 2 ;;
esac
