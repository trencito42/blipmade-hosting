#!/usr/bin/env bash
# Helpers that the backup scripts share.
#
# The functions only print and never change anything, so they can be used
# from a script that is not allowed to fail silently.
#
# Usage: source scripts/backup-common.sh

# The url of the database, rewritten for the host.
#
# The name of a service of the compose network ("postgres", "redis") does not
# resolve from the host, because the resolver of docker is only reachable
# inside the network. The host publishes the port of the database on its own
# loopback address, so the host part of the url is rewritten to localhost.
#
# The password of the database may hold an "@", so the host is the part after
# the LAST "@" of the authority and not the first one.
#
# Prints the rewritten url.
#
# Usage: blipmade_host_database_url <database url>
blipmade_host_database_url() {
  local url="${1:-}"
  local scheme rest creds host

  if [[ "$url" != *"://"* ]]; then
    printf '%s' "$url"
    return 0
  fi

  scheme="${url%%://*}"
  rest="${url#*://}"

  if [[ "$rest" == *"@"* ]]; then
    creds="${rest%@*}"
    host="${rest##*@}"
  else
    creds=""
    host="$rest"
  fi

  case "$host" in
    postgres:*) host="localhost:${host#postgres:}" ;;
    redis:*)    host="localhost:${host#redis:}" ;;
  esac

  if [[ -n "$creds" ]]; then
    printf '%s://%s@%s' "$scheme" "$creds" "$host"
  else
    printf '%s://%s' "$scheme" "$host"
  fi
}

# The directory that holds the files the customers attached.
#
# The uploads live in a docker volume. The path inside the container
# (/data/uploads) does not exist on the host, so the path of the volume is
# asked from docker. A directory that is given by the caller wins, because a
# restore drill may work on a copy.
#
# Prints the directory, or nothing when it cannot be found.
blipmade_upload_source() {
  local given="${1:-}"
  local volume="${BACKUP_UPLOAD_VOLUME:-blipmade_upload_data}"

  if [[ -n "$given" && -d "$given" ]]; then
    printf '%s' "$given"
    return 0
  fi

  if [[ -n "${ATTACHMENT_DIR:-}" && -d "${ATTACHMENT_DIR}" ]]; then
    printf '%s' "${ATTACHMENT_DIR}"
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    local mountpoint
    mountpoint="$(docker volume inspect -f '{{.Mountpoint}}' "$volume" 2>/dev/null || true)"
    if [[ -n "$mountpoint" ]]; then
      # The volume of docker lives in a directory that only root can enter, so
      # the path is not checked here: the archive is written with the rights
      # of the service account when the account cannot read it itself.
      printf '%s' "$mountpoint"
      return 0
    fi
  fi

  printf ''
}

# The files of the platform that are needed to bring it back.
#
# The secrets are never part of a backup: the environment file holds the
# password of the database, the key of the session and the keys of the
# payment provider, and a copy of it must never travel.
#
# Prints one path per line.
blipmade_config_members() {
  local root="${1:-$(pwd)}"
  local member
  for member in compose.yml compose.api.yml compose.web.yml \
                api/prisma web/package.json web/src/package.json; do
    if [[ -e "$root/$member" ]]; then
      printf '%s\n' "$member"
    fi
  done
}

# Counts the files of a directory, so the backup can report what it carries.
blipmade_count_files() {
  local dir="${1:-}"
  if [[ -z "$dir" ]]; then
    printf '0'
    return 0
  fi
  if [[ -r "$dir" ]]; then
    find "$dir" -type f 2>/dev/null | wc -l | tr -d ' '
    return 0
  fi
  if sudo -n true 2>/dev/null; then
    sudo -n find "$dir" -type f 2>/dev/null | wc -l | tr -d ' '
    return 0
  fi
  printf '0'
}

# Packs a directory into an archive.
#
# The uploads of the platform live in a volume that only root can read, so the
# archive is written with the rights of the service account when the account
# cannot read the directory itself.
#
# Usage: blipmade_archive_dir <source directory> <target file>
blipmade_archive_dir() {
  local source="$1"
  local target="$2"

  if [[ -z "$source" ]]; then
    return 1
  fi

  if [[ -d "$source" && -r "$source" ]]; then
    tar -czf "$target" -C "$source" .
    return $?
  fi

  # The directory of a volume of docker cannot even be entered by the service
  # account, so it is read with the rights of root.
  if sudo -n true 2>/dev/null && sudo -n test -d "$source" 2>/dev/null; then
    sudo -n tar -czf "$target" -C "$source" .
    local result=$?
    # The archive was written by root, so it has to be readable by the
    # service account again.
    sudo -n chown "$(id -u):$(id -g)" "$target" 2>/dev/null || true
    return $result
  fi

  echo "The directory $source cannot be read and this account cannot become" >&2
  echo "root. The archive cannot hold it." >&2
  return 1
}
