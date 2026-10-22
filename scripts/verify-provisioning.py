#!/usr/bin/env python3
"""End-to-end verification of the Blipmade platform against the live stack.

Creates a product, a customer and an order, marks the order paid through the
local test gateway, then waits for the worker to provision a real Pterodactyl
server and checks that the instance becomes active.

Nothing is created unless --execute is given: the default run prints the
plan. Every credential comes from the environment and is never printed.

Environment:
    BM_BASE_URL        base url of the platform (default http://127.0.0.1:3100)
    BM_ADMIN_EMAIL     the administrator account that creates the product
    BM_ADMIN_PASSWORD  its password
    BM_INTERNAL_TOKEN  the token the local test gateway checks

Usage:
    scripts/verify-provisioning.py            # plan only, nothing is created
    scripts/verify-provisioning.py --execute
"""
import argparse
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

BASE = ""
INTERNAL_TOKEN = ""
ADMIN_EMAIL = ""
ADMIN_PASSWORD = ""


def require_env(name: str, purpose: str) -> str:
    """Read a credential from the environment or stop with a clear message."""
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"error: {name} is not set ({purpose}).")
        print("The script has no built-in credentials; nothing was created.")
        raise SystemExit(1)
    return value


class Client:
    def __init__(self):
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ""

    def request(self, method, path, payload=None, headers=None):
        url = BASE + path
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        if method not in ("GET", "HEAD") and self.csrf:
            req.add_header("X-CSRF-Token", self.csrf)
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        try:
            with self.opener.open(req, timeout=30) as res:
                for cookie in self.jar:
                    if cookie.name == "bm_csrf":
                        self.csrf = cookie.value
                body = res.read().decode()
                return res.status, (json.loads(body) if body else None)
        except urllib.error.HTTPError as err:
            body = err.read().decode()
            try:
                parsed = json.loads(body)
            except Exception:
                parsed = body
            return err.code, parsed

    def get(self, path, headers=None):
        return self.request("GET", path, headers=headers)

    def post(self, path, payload=None, headers=None):
        return self.request("POST", path, payload, headers)

    def put(self, path, payload=None, headers=None):
        return self.request("PUT", path, payload, headers)

    def patch(self, path, payload=None, headers=None):
        return self.request("PATCH", path, payload, headers)


def fail(step, detail):
    print(f"FAIL  {step}: {detail}")
    sys.exit(1)


def ok(step, detail=""):
    print(f"OK    {step}{(' - ' + detail) if detail else ''}")


def print_plan(stamp: int, execute: bool) -> None:
    print("=== verify-provisioning.py ===")
    print(f"mode            : {'EXECUTE - the rows below are created' if execute else 'DRY RUN - nothing is created'}")
    print(f"base url        : {BASE}")
    print("administrator   : read from BM_ADMIN_EMAIL, the password is never printed")
    print("internal token  : read from BM_INTERNAL_TOKEN, never printed")
    print()
    print("=== what would change ===")
    print(f"  create the product    nginx-verify-{stamp} ('Nginx verification')")
    print(f"  register the customer verify-{stamp}@blipmade.test")
    print("                         (a random password is generated per run and never printed)")
    print("  quote and order the product, then mark the order paid")
    print("                         through the local test gateway")
    print("  wait up to 5 minutes for the worker to provision a Pterodactyl server")
    print()


def main(argv=None) -> int:
    global BASE, INTERNAL_TOKEN, ADMIN_EMAIL, ADMIN_PASSWORD

    parser = argparse.ArgumentParser(
        description="Verify the provisioning flow end to end (creates real rows).")
    parser.add_argument("--execute", action="store_true",
                        help="actually create the product, the customer and the order")
    args = parser.parse_args(argv)

    BASE = os.environ.get("BM_BASE_URL", "").strip().rstrip("/") or "http://127.0.0.1:3100"
    INTERNAL_TOKEN = require_env("BM_INTERNAL_TOKEN", "the local test gateway checks it")
    ADMIN_EMAIL = require_env("BM_ADMIN_EMAIL", "the account that creates the product")
    ADMIN_PASSWORD = require_env("BM_ADMIN_PASSWORD", "the account that creates the product")

    stamp = int(time.time())
    print_plan(stamp, args.execute)

    if not args.execute:
        print("=== result ===")
        print("nothing was created (dry run)")
        print("To run the verification, re-run with --execute.")
        return 0

    # The throwaway customer gets a password that only exists in this run.
    # It is never printed and never stored in this repository.
    customer_password = secrets.token_urlsafe(18)

    admin = Client()
    admin.get("/api/health")
    status, session = admin.post("/api/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if status != 200:
        fail("administrator login", f"{status} {session}")
    ok("signed the administrator in", ADMIN_EMAIL)

    # 1. A product that maps onto a real egg, so the panel can build it.
    startup = (
        "node -e \"require('http').createServer((req,res)=>{res.end('blipmade verification')}).listen(3000)\""
    )
    status, created = admin.post(
        "/api/admin/products",
        {
            "slug": f"nginx-verify-{stamp}",
            "name": "Nginx verification",
            "category": "WEB_CMS",
            "description": "A product used to verify the provisioning flow end to end.",
            "icon": "globe",
            "eggId": 15,
            "dockerImage": "ghcr.io/ptero-eggs/yolks:nodejs_25",
            "startupCommand": startup,
            "minRam": 512,
            "minCpu": 1,
            "minDisk": 1,
            "defaultRam": 512,
            "defaultCpu": 1,
            "defaultDisk": 2,
            "maxRam": 2048,
            "maxCpu": 2,
            "maxDisk": 20,
            "visible": True,
            "deployable": True,
            "baseAmount": 99,
        },
    )
    if status != 201:
        fail("create product", f"{status} {created}")
    product = created["product"]
    ok("created product", product["slug"])

    # 2. A customer.
    customer = Client()
    customer.get("/api/health")
    status, registered = customer.post(
        "/api/auth/register",
        {"email": f"verify-{stamp}@blipmade.test", "password": customer_password, "name": "Verification"},
    )
    if status != 201:
        fail("register customer", f"{status} {registered}")
    ok("registered customer", f"verify-{stamp}@blipmade.test")

    # 3. The catalog shows it with a server-side price.
    status, catalog = customer.get("/api/catalog/products")
    listed = [p for p in catalog["products"] if p["slug"] == product["slug"]]
    if not listed:
        fail("catalog", "the product is not listed")
    ok("catalog lists the product", f"from {listed[0]['price']['amount']} {listed[0]['price']['currency']}")

    # 4. A quote priced by the server.
    status, quote = customer.post(
        "/api/catalog/quote",
        {"items": [{"productSlug": product["slug"], "ram": 512, "cpu": 1, "disk": 2}]},
    )
    if status != 200 or quote["total"] <= 0:
        fail("quote", f"{status} {quote}")
    ok("server priced the quote", f"{quote['total']} {quote['currency']}")

    # 5. An order.
    status, order_response = customer.post(
        "/api/orders",
        {"items": [{"productSlug": product["slug"], "ram": 512, "cpu": 1, "disk": 2}]},
    )
    if status != 201:
        fail("create order", f"{status} {order_response}")
    order = order_response["order"]
    ok("created order", order["number"])

    # 6. Payment through the test gateway, which needs the internal token.
    status, webhook = customer.post(
        "/api/webhooks/stripe/test",
        {
            "id": f"evt_verify_{stamp}",
            "type": "checkout.session.completed",
            "orderId": order["id"],
            "subscriptionId": f"sub_verify_{stamp}",
            "paymentIntentId": f"pi_verify_{stamp}",
            "amount": order["total"],
        },
        headers={"X-Internal-Token": INTERNAL_TOKEN},
    )
    if status != 200:
        fail("pay order", f"{status} {webhook}")
    ok("order marked paid through the test gateway")

    # 7. The same event again must not create a second instance.
    customer.post(
        "/api/webhooks/stripe/test",
        {"id": f"evt_verify_{stamp}", "type": "checkout.session.completed", "orderId": order["id"]},
        headers={"X-Internal-Token": INTERNAL_TOKEN},
    )
    status, instances = customer.get("/api/instances")
    if len(instances["instances"]) != 1:
        fail("idempotency", f"expected 1 instance, found {len(instances['instances'])}")
    ok("a redelivered event created no second instance")

    instance = instances["instances"][0]
    instance_id = instance["id"]

    # 8. Wait for the worker.
    final = None
    for _ in range(60):
        status, detail = customer.get(f"/api/instances/{instance_id}")
        if status == 200:
            final = detail["instance"]
            if final["status"] in ("online", "failed", "suspended"):
                break
        time.sleep(5)

    if final is None:
        fail("provisioning", "the instance never appeared")
    if final["status"] != "online":
        fail("provisioning", f"instance status is {final['status']}")
    ok("instance is online", instance_id)

    # 9. The panel agrees.
    status, services = admin.get("/api/admin/services")
    service = [s for s in services["services"] if s["id"] == instance_id]
    if not service or not service[0]["pterodactylServerId"]:
        fail("panel", "the instance has no Pterodactyl server")
    ok("the Pterodactyl server exists", f"server id {service[0]['pterodactylServerId']}")

    print()
    print("PROVISIONING VERIFIED")
    print(json.dumps({"order": order["number"], "instance": instance_id, "status": final["status"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
