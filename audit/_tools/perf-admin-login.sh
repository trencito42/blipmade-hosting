#!/usr/bin/env bash
# Seteaza parola administratorului din baza de masuratoare, ca retestul fluxurilor
# sa se poata autentifica.
#
#   bash perf-admin-login.sh <nume_baza> [parola]
#
# Refuzul e primul: scriptul nu atinge nicio baza al carei nume nu e exact cel
# cerut, si nu atinge nicio baza care nu e de test. Baza vie nu poate fi atinsa.
set -euo pipefail

DB="${1:?numele bazei de test}"
PASSWORD="${2:-Perf-Admin-Measurement-9}"

case "$DB" in
  blipmade_perf_test|blipmade_phase14_test|blipmade_phase16_test|blipmade_base_test|rt1415b_test)
    echo "baza de test: $DB"
    ;;
  *)
    echo "REFUZ: baza \"$DB\" nu e o baza de test permisa" >&2
    exit 9
    ;;
esac

VM=debian@10.77.0.13
KEY=/root/.ssh/blipmade_vm103

ssh -i "$KEY" "$VM" "bash -s -- '$DB' '$PASSWORD'" <<'SH'
set -euo pipefail
DB="$1"
PASSWORD="$2"

# 1. hashul, cu exact formatul pe care il verifica API-ul: scrypt$N$r$p$salt$hash
HASH="$(cd /opt/blipmade/api && node --input-type=module -e "
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCb);
const N = 16384, R = 8, P = 1, KEYLEN = 64, MAXMEM = 128 * N * R * 2;
const salt = randomBytes(16);
const hash = await scrypt(process.argv[1].normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
process.stdout.write(['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('\$'));
" "$PASSWORD")"

# 2. scrierea, doar in baza ceruta
docker exec blipmade-postgres-1 psql -U blipmade -d "$DB" -X -tAc \
  "update \"User\" set \"passwordHash\" = '$HASH' where email = 'perf-admin@blipmade.test';" \
  | sed 's/^/    randari: /'

# 3. verificarea: autentificarea reala pe stiva de masuratoare
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3106/api/auth/login \
  -H 'content-type: application/json' \
  -d "{\"email\":\"perf-admin@blipmade.test\",\"password\":\"$PASSWORD\"}")"
echo "    login pe stiva de masuratoare: HTTP $CODE"
SH
