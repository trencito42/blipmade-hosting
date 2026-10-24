"""Phase 16, part two — the call sites of the account guard."""

import io
import os

ROOT = os.environ.get("PHASE16_ROOT", "/home/debian/wt-phase16/api")
path = os.path.join(ROOT, "src/routes/admin.ts")

s = io.open(path, encoding="utf-8").read()

s = s.replace(
    "assertMayActOnAccount(actor, customer.role);",
    "assertMayActOnAccount(actor, customer.role, customer.id);",
)
s = s.replace(
    "assertMayActOnAccount(actor, order.user.role);",
    "assertMayActOnAccount(actor, order.user.role, order.userId);",
)
s = s.replace(
    "assertMayActOnAccount(actor, instance.user.role);",
    "assertMayActOnAccount(actor, instance.user.role, instance.userId);",
)

io.open(path, "w", encoding="utf-8").write(s)
print("admin.ts: the call sites of the guard now name the account")
