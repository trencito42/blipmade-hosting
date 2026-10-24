"""Phase 16 — the follow-up fixes the independent retest asked for.

Applied to the worktree /home/debian/wt-phase16:
  * RT-P3-05 — markOrderPaid stays idempotent when it is called again without
    a sum on an order that is already paid.
  * RT-P3-04 — the webhook path no longer erases the REFUNDED state.
  * RT-P3-06 — a person may act on their own account.
"""

import io
import os

ROOT = os.environ.get("PHASE16_ROOT", "/home/debian/wt-phase16/api")


def read(path):
    return io.open(path, encoding="utf-8").read()


def write(path, text):
    io.open(path, "w", encoding="utf-8").write(text)


def replace_once(text, old, new, label):
    if text.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {text.count(old)}")
    return text.replace(old, new)


# ---------------------------------------------------------------- RT-P3-05 ---
path = os.path.join(ROOT, "src/services/stripe.ts")
s = read(path)
old = """  if (typeof params.amount !== 'number' || !Number.isFinite(params.amount)) {
    throw conflict(`Order ${order.number} cannot be paid: the payment carries no amount.`);
  }
  if (params.amount !== order.total) {
    throw conflict(
      `Order ${order.number} cannot be paid: the payment of ${params.amount} is not the ${order.total} that was quoted.`,
    );
  }
"""
new = """  //
  // The check is on the path that changes the state. An order that is already
  // paid stays paid whatever the caller repeats, so a replay of an event
  // without a sum does not turn a paid order into an error.
  if (!alreadyPaid) {
    if (typeof params.amount !== 'number' || !Number.isFinite(params.amount)) {
      throw conflict(`Order ${order.number} cannot be paid: the payment carries no amount.`);
    }
    if (params.amount !== order.total) {
      throw conflict(
        `Order ${order.number} cannot be paid: the payment of ${params.amount} is not the ${order.total} that was quoted.`,
      );
    }
  }
"""
s = replace_once(s, old, new, "stripe.ts / RT-P3-05")
write(path, s)
print("stripe.ts: RT-P3-05 applied")

# ---------------------------------------------------------------- RT-P3-04 ---
path = os.path.join(ROOT, "src/routes/webhooks.ts")
s = read(path)
old = """  await releaseCancelledOrderPromotion(order);
  await prisma.order.update({
    where: { id: order.id },
    data: { status: refunded ? 'REFUNDED' : 'CANCELLED' },
  });
"""
new = """  await releaseCancelledOrderPromotion(order);
  await prisma.order.update({
    where: { id: order.id },
    // A refunded order keeps the trace of the refund. A payment that arrives
    // late for an order that was already refunded must not erase it, because
    // the state that says the money was returned is what the guard of the
    // dead orders reads.
    data: { status: refunded || order.status === 'REFUNDED' ? 'REFUNDED' : 'CANCELLED' },
  });
"""
s = replace_once(s, old, new, "webhooks.ts / RT-P3-04")
write(path, s)
print("webhooks.ts: RT-P3-04 applied")

# ---------------------------------------------------------------- RT-P3-06 ---
path = os.path.join(ROOT, "src/plugins/auth.ts")
s = read(path)
old = """/**
 * The rule that the accounts of the platform are only acted on by an
 * administrator.
 *
 * The account that administers the platform may only be suspended, be given
 * a new panel key or have its services touched by another administrator, and
 * the same goes for the account of a member of the staff: a member of the
 * staff that could suspend another member of the staff could lock the
 * platform out of its own administration. The rule lives in the server and
 * not in the interface.
 *
 * The rule is about one account that the request names, so it is checked on
 * the routes that write to the account of a customer. A sweep over the whole
 * platform is not about one account and is not covered by it.
 */
export function assertMayActOnAccount(actor: AuthUser, targetRole: string): void {
  if (actor.role === 'ADMIN') return;
  if (targetRole === 'ADMIN') {
    throw forbidden('Only an administrator can act on the account of an administrator.');
  }
  if (targetRole === 'STAFF') {
    throw forbidden('Only an administrator can act on the account of a member of the staff.');
  }
}"""
new = """/**
 * The rule that the accounts of the platform are only acted on by an
 * administrator.
 *
 * The account that administers the platform may only be suspended, be given
 * a new panel key or have its services touched by another administrator, and
 * the same goes for the account of a member of the staff: a member of the
 * staff that could suspend another member of the staff could lock the
 * platform out of its own administration. The rule lives in the server and
 * not in the interface.
 *
 * The rule is about one account that the request names, so it is checked on
 * the routes that write to the account of a customer. A sweep over the whole
 * platform is not about one account and is not covered by it.
 *
 * A person may act on their own account. The rule protects the platform from
 * a member of the staff that acts on the account of another member of the
 * staff; it does not stop a person from refunding their own order or from
 * changing their own address.
 */
export function assertMayActOnAccount(
  actor: AuthUser,
  targetRole: string,
  targetUserId?: string | null,
): void {
  if (actor.role === 'ADMIN') return;
  // The account of the caller is their own: they may act on it.
  if (targetUserId && targetUserId === actor.id) return;
  if (targetRole === 'ADMIN') {
    throw forbidden('Only an administrator can act on the account of an administrator.');
  }
  if (targetRole === 'STAFF') {
    throw forbidden('Only an administrator can act on the account of a member of the staff.');
  }
}"""
s = replace_once(s, old, new, "plugins/auth.ts / RT-P3-06")
write(path, s)
print("plugins/auth.ts: RT-P3-06 applied")

# The call sites pass the account that is named by the request.
path = os.path.join(ROOT, "src/routes/admin.ts")
s = read(path)
s = replace_once(
    s,
    "assertMayActOnAccount(actor, customer.role);",
    "assertMayActOnAccount(actor, customer.role, customer.id);",
    "admin.ts / customer guard",
)
s = replace_once(
    s,
    "assertMayActOnAccount(actor, order.user.role);",
    "assertMayActOnAccount(actor, order.user.role, order.userId);",
    "admin.ts / refund guard",
)
s = replace_once(
    s,
    "assertMayActOnAccount(actor, instance.user.role);",
    "assertMayActOnAccount(actor, instance.user.role, instance.userId);",
    "admin.ts / instance guard",
)
write(path, s)
print("admin.ts: the call sites of the guard now name the account")
