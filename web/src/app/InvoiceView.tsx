import { get, type Invoice, type InvoiceCompany } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
import { ErrorState, LoadingBlock, Money, PrimaryButton, SoftButton } from '../ui-app';

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

/**
 * One invoice, laid out as a page that prints: the company that issues it, the customer, what
 * it is for and the amounts. It is for the customer who lost the message with the invoice, so
 * it holds everything the platform knows. A detail the operator did not fill in is left out,
 * never invented.
 */
export default function InvoiceView() {
  const { id = '' } = useParams();
  const state = useAsync<{ invoices: Invoice[]; company: InvoiceCompany }>(
    (signal) => get<{ invoices: Invoice[]; company: InvoiceCompany }>('/billing/invoices', { limit: 200 }, signal),
    [],
  );
  if (state.loading && !state.data) return <LoadingBlock rows={4} label="Loading the invoice" />;
  const invoice = state.data?.invoices.find((entry) => entry.id === id);
  if (state.error || !invoice || !state.data) {
    return <ErrorState title="The invoice could not be found" message={state.error?.message ?? 'It is not on this account.'} onRetry={state.reload} />;
  }
  const company = state.data.company;
  const address = invoice.billingAddress;
  const lines = invoice.lines ?? [];

  return (
    <div className="mx-auto grid max-w-[860px] gap-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2" data-print-hide="">
        <Link to="/app/billing" className="text-[13.5px] text-ink3 hover:text-ink">← Back to billing</Link>
        <div className="flex gap-2">
          {invoice.pdfUrl && (
            <a href={invoice.pdfUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-[14px] font-semibold text-ink hover:bg-s3">PDF</a>
          )}
          <PrimaryButton onClick={() => window.print()}>Print</PrimaryButton>
        </div>
      </div>

      <article className="rounded-2xl bg-white p-6 text-[14px] leading-relaxed text-neutral-900 sm:p-10 print:rounded-none print:p-0" aria-label={`Invoice ${invoice.number}`}>
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-300 pb-6">
          <div>
            <p className="text-[26px] font-bold tracking-[-0.03em]">Invoice</p>
            <p className="mt-1 font-mono text-[15px]">{invoice.number}</p>
          </div>
          <div className="text-right text-[13px]">
            <p>Date: {day(invoice.createdAt)}</p>
            <p>Status: <strong className="capitalize">{invoice.status}</strong></p>
            {invoice.periodStart && invoice.periodEnd && <p>Period: {day(invoice.periodStart)} – {day(invoice.periodEnd)}</p>}
          </div>
        </header>

        <section className="grid gap-6 border-b border-neutral-300 py-6 sm:grid-cols-2">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500">From</p>
            {company.name || company.address || company.taxId || company.registration ? (
              <div className="mt-1">
                {company.name && <p className="font-semibold">{company.name}</p>}
                {company.address && <p className="whitespace-pre-line">{company.address}</p>}
                {company.registration && <p>Registration: {company.registration}</p>}
                {company.taxId && <p>Tax ID: {company.taxId}</p>}
                {company.supportEmail && <p>{company.supportEmail}</p>}
              </div>
            ) : (
              <p className="mt-1 text-neutral-500">The issuer details are not set on this platform.</p>
            )}
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Billed to</p>
            {address ? (
              <div className="mt-1">
                {address.companyName && <p className="font-semibold">{address.companyName}</p>}
                <p>{address.fullName}</p>
                <p>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</p>
                <p>{address.postalCode} {address.city}{address.region ? `, ${address.region}` : ''}, {address.country}</p>
                {address.taxId && <p>Tax ID: {address.taxId}</p>}
              </div>
            ) : (
              <p className="mt-1 text-neutral-500">No billing address was saved on this invoice.</p>
            )}
          </div>
        </section>

        <section className="py-6">
          <table className="w-full border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-neutral-300 text-[12px] uppercase tracking-[0.06em] text-neutral-500">
                <th className="py-2 pr-3 font-semibold">Description</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                <th className="px-3 py-2 text-right font-semibold">Unit</th>
                <th className="py-2 pl-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.length > 0 ? (
                lines.map((line, index) => (
                  <tr key={index} className="border-b border-neutral-200">
                    <td className="py-2 pr-3">{line.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums"><Money amount={line.unitAmount} currency={invoice.currency} /></td>
                    <td className="py-2 pl-3 text-right tabular-nums"><Money amount={line.total} currency={invoice.currency} /></td>
                  </tr>
                ))
              ) : (
                <tr className="border-b border-neutral-200">
                  <td className="py-2 pr-3" colSpan={3}>Hosting services</td>
                  <td className="py-2 pl-3 text-right tabular-nums"><Money amount={invoice.amount} currency={invoice.currency} /></td>
                </tr>
              )}
            </tbody>
          </table>

          <dl className="mt-4 ml-auto grid max-w-[280px] gap-1 text-[13.5px]">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums"><Money amount={invoice.amount} currency={invoice.currency} /></dd></div>
            <div className="flex justify-between"><dt>Tax</dt><dd className="tabular-nums"><Money amount={invoice.tax} currency={invoice.currency} /></dd></div>
            <div className="flex justify-between border-t border-neutral-300 pt-2 text-[16px] font-bold"><dt>Total</dt><dd className="tabular-nums"><Money amount={invoice.total} currency={invoice.currency} /></dd></div>
          </dl>
          {company.taxNote && invoice.tax === 0 && <p className="mt-4 text-[12.5px] text-neutral-500">{company.taxNote}</p>}
        </section>
      </article>
      <SoftButton onClick={() => window.print()} className="sm:hidden" data-print-hide="">Print</SoftButton>
    </div>
  );
}
