"""Phase 16, part three — the selects that have to carry the new fields."""

import io
import os

ROOT = os.environ.get("PHASE16_ROOT", "/home/debian/wt-phase16/api")

# --- admin.ts: the customer must carry its id, so the guard can tell whose account it is ---
path = os.path.join(ROOT, "src/routes/admin.ts")
s = io.open(path, encoding="utf-8").read()
old = "const customer = await prisma.user.findUnique({ where: { id }, select: { role: true } });"
new = "const customer = await prisma.user.findUnique({ where: { id }, select: { role: true, id: true } });"
if s.count(old) != 1:
    raise SystemExit(f"admin.ts: expected one match, found {s.count(old)}")
s = s.replace(old, new)
io.open(path, "w", encoding="utf-8").write(s)
print("admin.ts: the customer select carries the id")

# --- webhooks.ts: the order must carry its state, so a REFUNDED order keeps it ---
path = os.path.join(ROOT, "src/routes/webhooks.ts")
s = io.open(path, encoding="utf-8").read()
old = """  order: {
    id: string;
    userId: string;
    total: number;
    currency: string;
    stripePaymentIntentId: string | null;
    promotionId: string | null;
    promotionRedeemedAt: Date | null;
  },"""
new = """  order: {
    id: string;
    userId: string;
    total: number;
    currency: string;
    status: string;
    stripePaymentIntentId: string | null;
    promotionId: string | null;
    promotionRedeemedAt: Date | null;
  },"""
if s.count(old) != 1:
    raise SystemExit(f"webhooks.ts: expected one match, found {s.count(old)}")
s = s.replace(old, new)
io.open(path, "w", encoding="utf-8").write(s)
print("webhooks.ts: the order type carries its state")
