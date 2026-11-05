import { useEffect, useState } from 'react';
import { get, type Order } from '../../../lib/api';
import { Link } from '../../../router';
import { LoadingBlock, PrimaryButton } from '../../../ui-app';
import { Icon } from '../../../icons';

interface ProvisioningStepProps {
  orderId: string;
}

export function ProvisioningStep({ orderId }: ProvisioningStepProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const answer = await get<{ order: Order }>(`/orders/${encodeURIComponent(orderId)}`);
        if (!cancelled) {
          setOrder(answer.order);
          setLoading(false);
          // If the order is paid, fulfilled, or cancelled, stop polling
          const finished = ['PAID', 'COMPLETED', 'FULFILLED', 'CANCELLED'].includes(answer.order.status);
          if (!finished) {
            setTimeout(poll, 2500);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error polling order status.');
          setLoading(false);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading && !order) {
    return <LoadingBlock rows={4} label="Initializing service provisioning…" />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-bad/30 bg-bad/10 p-5 text-bad">
        <p className="font-semibold">Unable to fetch provisioning state</p>
        <p className="mt-1 text-[13px]">{error}</p>
      </div>
    );
  }

  const items = order?.items ?? [];
  const allFulfilled = order?.status === 'PAID' || order?.status === 'COMPLETED' || order?.status === 'FULFILLED';
  const anyFailed = order?.status === 'CANCELLED' || order?.status === 'FAILED';

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-line bg-card p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-acc/15 text-acc">
          {allFulfilled ? (
            <Icon name="check" size={28} />
          ) : anyFailed ? (
            <Icon name="close" size={28} className="text-bad" />
          ) : (
            <Icon name="restart" size={28} className="animate-spin" />
          )}
        </div>

        <h3 className="mt-4 font-display text-[22px] font-bold tracking-tight text-ink">
          {allFulfilled
            ? 'Service successfully deployed!'
            : anyFailed
              ? 'Provisioning issue detected'
              : 'Provisioning your service…'}
        </h3>

        <p className="mt-1 text-[14px] text-ink3">
          Order #{order?.number ?? orderId} · {order?.status}
        </p>
      </div>

      {/* Item fulfillment status rows */}
      <div className="grid gap-3">
        {items.map((item) => {
          const isFulfilled = allFulfilled;
          const isFailed = anyFailed;
          const isPending = !isFulfilled && !isFailed;

          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-line bg-card p-4"
            >
              <div>
                <p className="font-semibold text-ink">{item.name}</p>
                <p className="font-mono text-[12px] text-ink3">{item.productSlug}</p>
              </div>

              <div className="flex items-center gap-2">
                {isFulfilled && (
                  <span className="flex items-center gap-1.5 rounded-full bg-good/15 px-3 py-1 text-[12.5px] font-semibold text-good">
                    <Icon name="check" size={12} />
                    <span>Active</span>
                  </span>
                )}
                {isFailed && (
                  <span className="rounded-full bg-bad/15 px-3 py-1 text-[12.5px] font-semibold text-bad">
                    Failed
                  </span>
                )}
                {isPending && (
                  <span className="flex items-center gap-1.5 rounded-full bg-s1 px-3 py-1 text-[12.5px] font-medium text-ink2">
                    <Icon name="restart" size={12} className="animate-spin" />
                    <span>Building…</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Next steps buttons */}
      {allFulfilled && (
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            to="/app/instances"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-acc px-6 font-semibold text-on-acc shadow transition-transform hover:scale-[1.02]"
          >
            Open in dashboard
          </Link>
          <Link
            to="/app/deploy"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-s1 px-6 font-semibold text-ink hover:bg-ink/10"
          >
            Deploy another service
          </Link>
        </div>
      )}
    </div>
  );
}
