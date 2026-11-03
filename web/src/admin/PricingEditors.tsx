import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { EmptyState, ErrorState, LoadingBlock } from '../ui-app';
import { PageEditorShell } from '../app/components/premium';
import { useAdminSession } from './Overview';
import { pricingGate } from './permissions';
import { PriceEditor, RateCard, type AdminPrice, type ResourceRates } from './Pricing';

const BACK_TO = '/admin/pricing';

function usePricing() {
  const session = useAdminSession();
  const gate = pricingGate(session.staff);
  const state = useAsync((signal) => get<{ rates: ResourceRates; prices: AdminPrice[] }>('/admin/pricing', undefined, signal), []);
  return { session, gate, state };
}

function Frame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <PageEditorShell eyebrow="Pricing" title={title} description={description} backTo={BACK_TO} backLabel="Back to pricing" actions={null}>
      {children}
    </PageEditorShell>
  );
}

/** The rate card of the platform on its own page. */
export function RatesEdit() {
  const { session, gate, state } = usePricing();
  const { navigate } = useRouter();
  return (
    <Frame title="Rate card" description="One card for every server. Running instances keep the price they were sold at.">
      {(session.loading || state.loading) && !state.data ? <LoadingBlock rows={3} label="Loading the rates" />
        : !gate.mayRead ? <ErrorState title="The prices are not available for your role" message='Your role does not hold "pricing.read".' />
        : state.error || !state.data ? <ErrorState title="The rates could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : <RateCard rates={state.data.rates} mayWrite={gate.mayWrite} onSaved={() => navigate(BACK_TO)} />}
    </Frame>
  );
}

/** The price of one product on its own page. */
export function PriceEdit() {
  const { id = '' } = useParams();
  const { session, gate, state } = usePricing();
  const { navigate } = useRouter();
  const price = state.data?.prices.find((entry) => entry.id === id);
  return (
    <Frame title={price ? `Price: ${price.product.name}` : 'Price'} description="Base price plus the rate for every extra gigabyte and vCPU. Amounts are whole cents.">
      {(session.loading || state.loading) && !state.data ? <LoadingBlock rows={3} label="Loading the price" />
        : !gate.mayRead ? <ErrorState title="The prices are not available for your role" message='Your role does not hold "pricing.read".' />
        : state.error ? <ErrorState title="The price could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !price ? <EmptyState title="Price not found." description="It was removed with its product." />
        : <PriceEditor price={price} mayWrite={gate.mayWrite} onSaved={() => navigate(BACK_TO)} />}
    </Frame>
  );
}
