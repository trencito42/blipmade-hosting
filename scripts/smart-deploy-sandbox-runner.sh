#!/usr/bin/env bash
set -euo pipefail

# Reference executor for Smart Deploy. The source is mounted read-only into a
# new root filesystem; only /workspace and the dedicated output directory are
# writable. A fresh network namespace has no interfaces or routes.

if [[ "${1:-}" == '__inside' ]]; then
  BLIP_BUILD_COMMAND=$(cat "$BLIP_CONTROL")
  mount --make-rprivate /
  mount -t tmpfs -o size=64m,nosuid,nodev tmpfs "$BLIP_ROOTFS"
  mkdir -p "$BLIP_ROOTFS"/{usr,source,workspace,output,proc,dev,tmp}
  mount -o bind,ro /usr "$BLIP_ROOTFS/usr"
  mount -o bind,ro "$BLIP_SOURCE" "$BLIP_ROOTFS/source"
  mount -t tmpfs -o "size=${BLIP_DISK_MB}m,nosuid,nodev" tmpfs "$BLIP_ROOTFS/workspace"
  mount -t tmpfs -o size=64m,nosuid,nodev tmpfs "$BLIP_ROOTFS/tmp"
  mount -t proc -o nosuid,nodev,noexec proc "$BLIP_ROOTFS/proc"
  ln -s usr/bin "$BLIP_ROOTFS/bin"
  ln -s usr/lib "$BLIP_ROOTFS/lib"
  if [[ -d /usr/lib64 ]]; then ln -s usr/lib64 "$BLIP_ROOTFS/lib64"; fi
  for dev in null zero random urandom; do
    touch "$BLIP_ROOTFS/dev/$dev"
    mount -o bind,ro "/dev/$dev" "$BLIP_ROOTFS/dev/$dev"
  done
  cp -a "$BLIP_ROOTFS/source/." "$BLIP_ROOTFS/workspace/"
  printf '%s\n' "$BLIP_BUILD_COMMAND" > "$BLIP_ROOTFS/workspace/.blipmade-build-command"
  cat > "$BLIP_ROOTFS/workspace/.blipmade-entrypoint" <<'ENTRYPOINT'
#!/bin/bash
set -euo pipefail
cd /workspace
ulimit -f 20480
ulimit -n 256
ulimit -u 64
/bin/bash -euo pipefail -c "$(cat .blipmade-build-command)"
rm -f .blipmade-build-command .blipmade-entrypoint
ENTRYPOINT
  chmod 500 "$BLIP_ROOTFS/workspace/.blipmade-entrypoint"
  chroot "$BLIP_ROOTFS" /usr/bin/env -i \
    PATH=/usr/local/bin:/usr/bin:/bin HOME=/workspace TMPDIR=/tmp CI=true \
    /bin/bash /workspace/.blipmade-entrypoint > "$BLIP_OUTPUT/build.log" 2>&1
  [[ -d "$BLIP_ROOTFS/output" && ! -L "$BLIP_ROOTFS/output" ]]
  mount -o bind,rw,nosuid,nodev "$BLIP_OUTPUT" "$BLIP_ROOTFS/output"
  chroot "$BLIP_ROOTFS" /usr/bin/tar --exclude=.git --exclude=.npm \
    --exclude=node_modules/.cache -C /workspace -czf /output/artifact.tar.gz .
  exit
fi

usage() {
  echo "usage: $0 --source ABS_DIR --output ABS_DIR --runtime RUNTIME --build COMMAND [--timeout SEC] [--memory-mb MB] [--disk-mb MB]" >&2
  exit 64
}

source_dir=''
output_dir=''
runtime=''
build_command=''
timeout_sec=600
memory_mb=1024
disk_mb=2048
unit_name="blipmade-smart-deploy-$$"

while (($#)); do
  case "$1" in
    --source) source_dir=${2:-}; shift 2 ;;
    --output) output_dir=${2:-}; shift 2 ;;
    --runtime) runtime=${2:-}; shift 2 ;;
    --build) build_command=${2:-}; shift 2 ;;
    --timeout) timeout_sec=${2:-}; shift 2 ;;
    --memory-mb) memory_mb=${2:-}; shift 2 ;;
    --disk-mb) disk_mb=${2:-}; shift 2 ;;
    --unit) unit_name=${2:-}; shift 2 ;;
    *) usage ;;
  esac
done

[[ "$source_dir" = /* && -d "$source_dir" ]] || usage
[[ "$output_dir" = /* && -d "$output_dir" ]] || usage
[[ -n "$runtime" && -n "$build_command" ]] || usage
[[ "$timeout_sec" =~ ^[1-9][0-9]*$ && "$timeout_sec" -le 3600 ]] || usage
[[ "$memory_mb" =~ ^[1-9][0-9]*$ && "$memory_mb" -le 8192 ]] || usage
[[ "$disk_mb" =~ ^[1-9][0-9]*$ && "$disk_mb" -le 8192 ]] || usage
[[ "$unit_name" =~ ^[A-Za-z0-9_-]{1,80}$ ]] || usage

case "$runtime" in
  node|nodejs) runtime_bin=/usr/bin/node ;;
  python|python3) runtime_bin=/usr/bin/python3 ;;
  php) runtime_bin=/usr/bin/php ;;
  go|golang) runtime_bin=/usr/bin/go ;;
  rust) runtime_bin=/usr/bin/cargo ;;
  *) echo "unsupported runtime: $runtime" >&2; exit 65 ;;
esac
[[ -x "$runtime_bin" ]] || { echo "runtime is not installed on this disposable builder: $runtime" >&2; exit 69; }

for required in unshare mount chroot timeout systemd-run tar; do
  command -v "$required" >/dev/null || { echo "required isolation tool is missing: $required" >&2; exit 69; }
done

runner_tmp=$(mktemp -d /tmp/blipmade-smart-deploy.XXXXXX)
case "$runner_tmp" in /tmp/blipmade-smart-deploy.*) ;; *) exit 70 ;; esac
mkdir -p "$runner_tmp/rootfs"
runner_path=$(realpath -- "$0")
printf '%s\n' "$build_command" > "$runner_tmp/build-command"

cleanup() {
  case "$runner_tmp" in
    /tmp/blipmade-smart-deploy.*) rm -rf -- "$runner_tmp" ;;
  esac
}
trap cleanup EXIT INT TERM

# The output directory must be empty so a build cannot exploit a pre-existing
# symlink. It is dedicated to this one execution.
if find "$output_dir" -mindepth 1 -print -quit | grep -q .; then
  echo "output directory must be empty" >&2
  exit 65
fi

export BLIP_SOURCE="$source_dir"
export BLIP_OUTPUT="$output_dir"
export BLIP_ROOTFS="$runner_tmp/rootfs"
export BLIP_BUILD_COMMAND="$build_command"
export BLIP_DISK_MB="$disk_mb"

# systemd owns the resource ceiling; timeout is an independent hard stop.
# Build output itself is capped in build.log by RLIMIT_FSIZE.
set +e
timeout --signal=TERM --kill-after=10 "${timeout_sec}s" \
  systemd-run --user --unit="$unit_name" --wait --collect --quiet --pipe \
    -p "MemoryMax=${memory_mb}M" -p CPUQuota=100% -p TasksMax=64 \
    --setenv="BLIP_SOURCE=$source_dir" --setenv="BLIP_OUTPUT=$output_dir" \
    --setenv="BLIP_ROOTFS=$runner_tmp/rootfs" --setenv="BLIP_DISK_MB=$disk_mb" \
    --setenv="BLIP_CONTROL=$runner_tmp/build-command" \
    unshare --user --map-root-user --mount --pid --net --ipc --uts --fork --mount-proc \
    "$runner_path" __inside
runner_status=$?
set -e

if [[ "$runner_status" -eq 124 || "$runner_status" -eq 137 ]]; then
  echo "sandbox timed out" >&2
  exit 124
fi
if [[ "$runner_status" -ne 0 ]]; then
  echo "sandbox build failed with exit code $runner_status" >&2
  exit "$runner_status"
fi

[[ -f "$output_dir/artifact.tar.gz" && -f "$output_dir/build.log" ]] || {
  echo "sandbox did not produce the required log and artifact" >&2
  exit 70
}
sha256sum "$output_dir/artifact.tar.gz" > "$output_dir/artifact.sha256"
printf 'sandbox build succeeded\n'
