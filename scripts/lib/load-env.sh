#!/usr/bin/env bash
# Loads the environment file of the host without changing the values that are
# already in the environment.
#
# Sourcing the file with `. ./.env` overwrites the environment, so a drill
# that is pointed at another database by an environment variable would still
# land on the database of the file. This helper keeps the value of the
# environment when there is one, and takes the value of the file only when
# the environment says nothing about that name.
#
# Usage:
#
#     source "$ROOT/scripts/lib/load-env.sh"
#     load_env_file "$ROOT/.env"
load_env_file() {
  local file="${1:-}"
  [[ -f "$file" ]] || return 0

  local line name value
  while IFS= read -r line || [[ -n "$line" ]]; do
    # The comments and the empty lines carry nothing.
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    # A line that is not a name and a value is left alone, rather than run.
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue

    name="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"

    # The quotes of the value are not part of it.
    if [[ "$value" == \"*\" && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    fi

    # The environment wins over the file.
    if [[ -z "${!name:-}" ]]; then
      export "$name=$value"
    fi
  done < "$file"
}
