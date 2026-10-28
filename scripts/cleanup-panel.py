#!/usr/bin/env python3
"""Audit the Pterodactyl panel and remove the verification artifacts.

Safety rules
------------
1. The default is a dry run: the plan is printed and nothing is changed.
2. A delete needs three independent signals:
   ``CLEANUP_DRY_RUN=0`` in the environment, ``--execute`` on the command
   line and a ``--confirm`` token that either repeats the number of verified
   targets (``CLEANUP-PANEL-<count>``) or states that the targets were
   audited (``yes-i-audited-the-targets``).
3. Only the ids recorded in ALLOWED_SERVERS / ALLOWED_USERS can ever be
   deleted. A target must still report the exact id, uuid and name that the
   allowlist records; anything else is reported and kept.
4. The protected server is refused before the allowlist is consulted.
5. A DELETE is only ever sent to a URL that was built from an allowlisted id.
   There is no wildcard delete in this script.

The panel address and the API key come from the environment
(``PTERODACTYL_URL`` and ``PTERODACTYL_APP_KEY``). Nothing is hard-coded and
no credential is ever printed.

Usage:
    scripts/cleanup-panel.py                    # dry run: prints the plan
    scripts/cleanup-panel.py --list             # read-only listing of the panel
    CLEANUP_DRY_RUN=0 scripts/cleanup-panel.py --execute \\
        --confirm CLEANUP-PANEL-<count>         # the only way to delete
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

# --- objects that have to survive every run -------------------------------
PROTECTED_SERVER_ID = 16
PROTECTED_SERVER_UUID = "60eabad4-1e0c-4c4f-9e04-bd593d2bc5ed"
PROTECTED_SERVER_NAME = "Blipmade runtime template (node.js generic)"
# The two accounts of the people who run the platform. The accounts of the
# first round (the addresses of the old administrators) are not protected any
# more: the fresh start leaves only these two.
PROTECTED_USER_IDS = {3, 4}

# --- the explicit allowlist ----------------------------------------------
# A target is deleted only when the panel still reports the exact id, uuid
# and name that are recorded here. Read the live values with
# ``scripts/cleanup-panel.py --list``, audit them and paste the triple in.
# An entry whose uuid is missing can never be deleted: it is kept.
#
#   ALLOWED_SERVERS = {
#       7: {"uuid": "<uuid>", "name": "<name>"},
#   }
#   ALLOWED_USERS = {
#       11: {"email": "<email>", "username": "<username>"},
#   }
ALLOWED_SERVERS = {
    # The servers of the customers of the first round. They belong to the
    # orders BM-00007, BM-00008, BM-00010 and BM-00012, and the panel holds
    # the same id, uuid and name for each of them.
    17: {"uuid": "6a2eacf8-46ea-4133-97a2-35dfb2ed6e07", "name": "2"},
    18: {"uuid": "ba96f30a-9894-4b09-9173-e0e5717fe4f2", "name": "1"},
    19: {"uuid": "c6d7070a-dfb7-4410-9218-05712edd4a3d", "name": "Discord Bot"},
    21: {"uuid": "47884b45-9cd2-4852-afeb-3a9610d73f17", "name": "Discord Bot"},
    # The containers of the verification runs of the 28th of October 2026. The
    # name of every one of them says "Verify", the way the rows of the test
    # carry the mark "verify" in the database of the platform.
    25: {"uuid": "b82beee6-b126-45a6-96d5-5471164caa4d", "name": "Verify postgresql"},
    26: {"uuid": "7c62238b-0cfe-42b8-99fc-4351507c5361", "name": "Verify code-server"},
    27: {"uuid": "ae32543d-1ef6-4229-bea5-8ef7378c02f3", "name": "Verify uptime-kuma"},
    28: {"uuid": "a29a839b-fa58-4f0e-80ed-889f7975c3e8", "name": "Verify discord-bot"},
    29: {"uuid": "0635ea39-9da7-481b-aafa-3e94b20ae9f3", "name": "Verify discord-bot"},
}
ALLOWED_USERS = {
    # The four accounts that the verification runs created on the panel. The
    # address of every one of them ends in ".invalid", a domain name that is
    # reserved and can never be registered, and the name of the account
    # follows the pattern of the accounts the platform creates
    # ("bm-<id of the platform account>"). The document
    # audit/post-remediation/_raw/PRODUCTION-POLLUTION-INCIDENT.md lists
    # them as the accounts of the incident, and none of them owns a server:
    # the panel reports zero servers.
    19: {"email": "qa-headless-one-e4xeztm7@panel.blipmade.invalid", "username": "bm-01e4xeztm7"},
    # The accounts of the verification runs of the 28th of October 2026. The
    # address of every one of them ends in ".invalid" and the name follows the
    # pattern of the accounts the platform creates.
    29: {"email": "verify-20261028123109-28123109@panel.blipmade.invalid", "username": "bm-1028123109"},
    30: {"email": "verify-20261028123658-28123658@panel.blipmade.invalid", "username": "bm-1028123658"},
    31: {"email": "verify-20261028123802-28123802@panel.blipmade.invalid", "username": "bm-1028123802"},
    32: {"email": "verify-20261028124210-28124210@panel.blipmade.invalid", "username": "bm-1028124210"},
    33: {"email": "verify-20261028130723-28130723@panel.blipmade.invalid", "username": "bm-1028130723"},
    20: {"email": "qa-headless-two-eefha38m@panel.blipmade.invalid", "username": "bm-01eefha38m"},
    23: {"email": "browser-customer-qhrka12o@panel.blipmade.invalid", "username": "bm-3cqhrka12o"},
    24: {"email": "browser-customer-jm9c7zmu@panel.blipmade.invalid", "username": "bm-d8jm9c7zmu"},
    # The accounts the platform created for the customers of the first round.
    # They are the accounts of the servers above, and the addresses follow the
    # same pattern as the ones of the verification runs.
    25: {"email": "stefan-ay37ey0l@panel.blipmade.invalid", "username": "bm-01ay37ey0l"},
    26: {"email": "steph-1mx42ney@panel.blipmade.invalid", "username": "bm-011mx42ney"},
    27: {"email": "nissqbv-fcql2sz0@panel.blipmade.invalid", "username": "bm-01fcql2sz0"},
    28: {"email": "browser-customer-czrgy3iu@panel.blipmade.invalid", "username": "bm-i5czrgy3iu"},
    # The administrator account of the first round, stefan10xdd@gmail.com,
    # was deleted on the 27th of October 2026, together with the Application
    # API key that the account had made: the keys of a user go with the user.
    #
    # The account of stefan@xodo.ro is NOT in this list, on purpose. It owns
    # the runtime template of the panel and the Application API key that the
    # platform uses, so it has to stay. A cleanup that takes it away leaves
    # the panel without an administrator and without a key, which is what
    # happened on the 27th of October 2026.
    2: {"email": "stefan10xdd@gmail.com", "username": "adm1"},
}

BASE = ""
KEY = ""


class PanelUnreachable(Exception):
    """The panel could not be read, so nothing was attempted."""


def api(method: str, path: str, body=None):
    """Send one request to the panel.

    The key is only ever sent as a request header and is never printed.
    """
    url = f"{BASE}/api/application{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            try:
                return resp.status, (json.loads(raw) if raw else None)
            except json.JSONDecodeError:
                return resp.status, raw[:400]
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw[:400]
    except urllib.error.URLError as exc:
        raise PanelUnreachable(f"{exc.reason}") from exc
    except Exception as exc:  # noqa: BLE001
        raise PanelUnreachable(f"{type(exc).__name__}: {exc}") from exc


def describe_failure(status, payload) -> str:
    """Turn an unsuccessful response into a message an operator can act on."""
    if status in (401, 403):
        return "the panel rejected the API key (HTTP %s) - check PTERODACTYL_APP_KEY" % status
    detail = payload if isinstance(payload, str) else json.dumps(payload)[:200]
    return f"HTTP {status}: {detail}"


def server_verdict(server: dict):
    """Decide what happens to one live server.

    Returns (verdict, reason) where the verdict is one of
    ``verified`` (may be deleted), ``refused`` (protected) or ``kept``.
    """
    sid = server.get("id")
    uuid = server.get("uuid")
    name = server.get("name")
    if sid == PROTECTED_SERVER_ID:
        return "refused", "protected server (id %s)" % PROTECTED_SERVER_ID
    if uuid == PROTECTED_SERVER_UUID:
        return "refused", "protected server (uuid %s)" % PROTECTED_SERVER_UUID
    if name == PROTECTED_SERVER_NAME:
        return "refused", "protected server (name %r)" % name

    entry = ALLOWED_SERVERS.get(sid)
    if entry is None:
        return "kept", "not in the allowlist"
    if not entry.get("uuid"):
        return "kept", "allowlist entry has no uuid recorded"
    if entry.get("uuid") != uuid:
        return "kept", "uuid differs from the allowlist"
    if entry.get("name") != name:
        return "kept", "name differs from the allowlist"
    return "verified", "id, uuid and name match the allowlist"


def user_verdict(user: dict):
    """Decide what happens to one live user."""
    uid = user.get("id")
    if uid in PROTECTED_USER_IDS:
        return "kept", "protected administrator"
    entry = ALLOWED_USERS.get(uid)
    if entry is None:
        return "kept", "not in the allowlist"
    if entry.get("email") != user.get("email"):
        return "kept", "email differs from the allowlist"
    expected_user = entry.get("username")
    if expected_user and expected_user != user.get("username"):
        return "kept", "username differs from the allowlist"
    return "verified", "id and email match the allowlist"


def delete_server(server_id: int):
    """Delete one server.

    The id is checked against the allowlist again here, so no DELETE can
    ever leave this function for a target that was not allowlisted.
    """
    if server_id == PROTECTED_SERVER_ID:
        raise RuntimeError("refusing to delete the protected server")
    if server_id not in ALLOWED_SERVERS:
        raise RuntimeError(f"refusing to delete server {server_id}: not in the allowlist")
    return api("DELETE", f"/servers/{server_id}")


def delete_user(user_id: int):
    """Delete one user, with the same guards as delete_server()."""
    if user_id in PROTECTED_USER_IDS:
        raise RuntimeError("refusing to delete a protected administrator")
    if user_id not in ALLOWED_USERS:
        raise RuntimeError(f"refusing to delete user {user_id}: not in the allowlist")
    return api("DELETE", f"/users/{user_id}")


def collect():
    """Read the panel and return the live servers and users."""
    status, data = api("GET", "/servers?per_page=100")
    if status != 200:
        raise PanelUnreachable(describe_failure(status, data))
    servers = [entry["attributes"] for entry in (data or {}).get("data", [])]

    status, data = api("GET", "/users?per_page=100")
    if status != 200:
        raise PanelUnreachable(describe_failure(status, data))
    users = [entry["attributes"] for entry in (data or {}).get("data", [])]
    return servers, users


def print_static_plan(mode: str) -> None:
    """Print everything that is known without touching the panel."""
    print("=== cleanup-panel.py ===")
    print(f"mode            : {mode}")
    print(f"panel           : {BASE or '(not set - PTERODACTYL_URL)'}")
    print("api key         : read from PTERODACTYL_APP_KEY, never printed")

    print("\n=== protected objects (never deleted) ===")
    print(f"  server id {PROTECTED_SERVER_ID} uuid {PROTECTED_SERVER_UUID} name {PROTECTED_SERVER_NAME!r}")
    print(f"  user ids {sorted(PROTECTED_USER_IDS)}")

    print("\n=== allowlist ===")
    if ALLOWED_SERVERS:
        for sid, entry in sorted(ALLOWED_SERVERS.items()):
            print(f"  server id {sid}: uuid={entry.get('uuid') or '(not recorded)'} "
                  f"name={entry.get('name') or '(not recorded)'}")
    else:
        print("  servers: empty - no server can be deleted until the table is filled in")
    if ALLOWED_USERS:
        for uid, entry in sorted(ALLOWED_USERS.items()):
            print(f"  user id {uid}: email={entry.get('email') or '(not recorded)'} "
                  f"username={entry.get('username') or '(not recorded)'}")
    else:
        print("  users  : empty - no user can be deleted until the table is filled in")


def print_live_panel(servers, users) -> None:
    print("\n=== live panel ===")
    print("servers:")
    for server in servers:
        verdict, reason = server_verdict(server)
        print(f"  id={server.get('id'):>3} uuid={server.get('uuid')} "
              f"name={server.get('name')!r} -> {verdict} ({reason})")
    print("users:")
    for user in users:
        verdict, reason = user_verdict(user)
        print(f"  id={user.get('id'):>3} email={user.get('email')} "
              f"username={user.get('username')!r} -> {verdict} ({reason})")


def main(argv=None) -> int:
    global BASE, KEY

    parser = argparse.ArgumentParser(
        description="Audit the Pterodactyl panel and remove the verification artifacts.")
    parser.add_argument("--list", action="store_true",
                        help="print the live panel and the allowlist, change nothing")
    parser.add_argument("--execute", action="store_true",
                        help="actually delete the verified targets (needs CLEANUP_DRY_RUN=0 and --confirm)")
    parser.add_argument("--confirm", metavar="TOKEN",
                        help="CLEANUP-PANEL-<count> or yes-i-audited-the-targets")
    args = parser.parse_args(argv)

    if args.list and args.execute:
        print("error: --list and --execute cannot be combined.", file=sys.stderr)
        return 2

    dry_run_env = os.environ.get("CLEANUP_DRY_RUN")
    if dry_run_env is None:
        dry_run = True
    elif dry_run_env == "1":
        dry_run = True
    elif dry_run_env == "0":
        dry_run = False
    else:
        print(f"warning: CLEANUP_DRY_RUN={dry_run_env!r} is not 0 or 1; "
              "the safe default (dry run) is used.", file=sys.stderr)
        dry_run = True

    mode = "DRY RUN - nothing is deleted"
    if args.list:
        mode = "LIST - read only, nothing is deleted"
    elif args.execute and not dry_run:
        mode = "EXECUTE - the verified targets will be deleted"
    elif args.execute:
        mode = "DRY RUN - --execute needs CLEANUP_DRY_RUN=0, nothing is deleted"

    # The refusal happens before anything is read, so a mistaken --execute
    # cannot reach the panel at all.
    if args.execute and not args.confirm:
        print("=== cleanup-panel.py ===")
        print("refusing to run: --execute needs an explicit confirmation.")
        print("Use --confirm CLEANUP-PANEL-<count> once the plan has been read,")
        print("or --confirm yes-i-audited-the-targets.")
        print("Nothing was read and nothing was changed.")
        return 2

    BASE = os.environ.get("PTERODACTYL_URL", "").strip().rstrip("/")
    KEY = os.environ.get("PTERODACTYL_APP_KEY", "").strip()
    missing = [name for name, value in
               (("PTERODACTYL_URL", BASE), ("PTERODACTYL_APP_KEY", KEY)) if not value]
    if missing:
        print_static_plan(mode)
        print(f"\nerror: not set in the environment: {', '.join(missing)}.")
        print("Both come from the environment; the script has no built-in values.")
        print("Nothing was read and nothing was changed.")
        return 1

    print_static_plan(mode)

    try:
        servers, users = collect()
    except PanelUnreachable as exc:
        print(f"\nerror: the panel could not be read: {exc}")
        print("Nothing was changed.")
        return 1

    print_live_panel(servers, users)

    verified_servers = [s for s in servers if server_verdict(s)[0] == "verified"]
    verified_users = [u for u in users if user_verdict(u)[0] == "verified"]
    refused = [s for s in servers if server_verdict(s)[0] == "refused"]

    print("\n=== what would change ===")
    if not verified_servers and not verified_users:
        print("  (nothing - no live target matches the allowlist exactly)")
    for server in verified_servers:
        print(f"  DELETE {BASE}/api/application/servers/{server.get('id')} "
              f"uuid={server.get('uuid')} name={server.get('name')!r}")
    for user in verified_users:
        print(f"  DELETE {BASE}/api/application/users/{user.get('id')} email={user.get('email')}")

    if args.list:
        print("\n=== result ===")
        print("nothing was deleted (--list is read only)")
        return 0

    if dry_run:
        print("\n=== result ===")
        print("nothing was deleted (dry run)")
        print("To delete, re-run with CLEANUP_DRY_RUN=0, --execute and --confirm.")
        return 0

    count = len(verified_servers) + len(verified_users)
    expected = f"CLEANUP-PANEL-{count}"
    if args.confirm not in (expected, "yes-i-audited-the-targets"):
        print("\nerror: the confirmation does not match the plan.")
        print(f"expected one of: {expected!r} or 'yes-i-audited-the-targets'")
        print("Nothing was deleted.")
        return 2

    if count == 0:
        print("\n=== result ===")
        print("nothing was deleted (no verified target)")
        return 0

    print("\n=== deleting ===")
    for server in verified_servers:
        try:
            status, body = delete_server(server["id"])
            print(f"  delete server {server['id']} -> {status} {str(body)[:160]}")
        except RuntimeError as exc:
            print(f"  delete server {server['id']} -> refused: {exc}")
    for user in verified_users:
        try:
            status, body = delete_user(user["id"])
            print(f"  delete user {user['id']} -> {status} {str(body)[:160]}")
        except RuntimeError as exc:
            print(f"  delete user {user['id']} -> refused: {exc}")

    status, body = 0, None
    try:
        status, body = api("GET", f"/servers/{PROTECTED_SERVER_ID}")
    except PanelUnreachable as exc:
        print(f"\n=== protected server ===\n  WARNING: the panel could not be read: {exc}")
        return 1
    print("\n=== protected server ===")
    if status == 200:
        attrs = (body or {}).get("attributes", {})
        print(f"  server {PROTECTED_SERVER_ID}: name={attrs.get('name')!r} uuid={attrs.get('uuid')}")
    else:
        print(f"  WARNING: the protected server could not be read: {describe_failure(status, body)}")
        return 1
    if refused:
        print(f"  refused targets: {[s.get('id') for s in refused]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
