#!/bin/sh
# Probe: can the Application API issue a per-user Client API key?
# Every step prints the status and the body, so the answer is in the output.
set -e
URL="$PTERODACTYL_URL"
AUTH="Authorization: Bearer $PTERODACTYL_APP_KEY"
ACCEPT="Accept: Application/vnd.pterodactyl.v1+json"
JSON="Content-Type: application/json"

echo "== 1. create a disposable panel user =="
CREATE=$(wget -qO- --method=POST \
  --header="$AUTH" --header="$ACCEPT" --header="$JSON" \
  --body-data='{"email":"blipmade-probe@example.test","username":"bm_probe_user","first_name":"Blipmade","last_name":"Probe","password":"Pr0be-Passw0rd-x9","root_admin":false,"external_id":"blipmade_acc_probe"}' \
  "$URL/api/application/users" || true)
echo "$CREATE" | head -c 600
echo
USER_ID=$(echo "$CREATE" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
echo "user id: $USER_ID"

echo
echo "== 2. mint a CLIENT token for that user =="
MINT=$(wget -qO- --method=POST \
  --header="$AUTH" --header="$ACCEPT" --header="$JSON" \
  --body-data='{"type":"client","use_ip_subnet":false,"allowed_ips":[],"memo":"blipmade-console"}' \
  "$URL/api/application/users/$USER_ID/token" || true)
echo "$MINT" | head -c 600
echo

TOKEN=$(echo "$MINT" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)
echo "token prefix: $(echo "$TOKEN" | cut -c1-12) length: ${#TOKEN}"

echo
echo "== 3. use the client token on the CLIENT api =="
echo "-- /api/client/account --"
wget -qO- --header="Authorization: Bearer $TOKEN" --header="$ACCEPT" "$URL/api/client/account" 2>&1 | head -c 500
echo
echo "-- /api/client/servers --"
wget -qO- --header="Authorization: Bearer $TOKEN" --header="$ACCEPT" "$URL/api/client/servers" 2>&1 | head -c 300
echo

echo
echo "== 4. list the tokens of that user (application api) =="
wget -qO- --header="$AUTH" --header="$ACCEPT" "$URL/api/application/users/$USER_ID/tokens" 2>&1 | head -c 500
echo
