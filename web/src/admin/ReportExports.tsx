import { useState } from 'react';
import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, LoadingBlock, PrimaryButton, Select, SoftButton } from '../ui-app';
import { PageEditorShell } from '../app/components/premium';

interface Report {
  generatedAt: string;
  months: string[];
  mrr: Record<string, number>;
  revenue: { currency: string; series: number[] }[];
  signups: number[];
  cancellations: number[];
  byProduct: { name: string; currency: string; total: number; orders: number }[];
  topCustomers: { email: string; currency: string; total: number }[];
}

const SETS = [
  { key: 'income', label: 'Income by month', hint: 'Paid invoices, one column per currency.' },
  { key: 'customers', label: 'New customers and cancellations by month', hint: 'Accounts made and subscriptions ended.' },
  { key: 'products', label: 'What sells', hint: 'Income and orders by product.' },
  { key: 'top', label: 'Top customers', hint: 'Contains e-mail addresses. Keep the file private.' },
] as const;
type SetKey = (typeof SETS)[number]['key'];

/** A spreadsheet must not run a cell as a formula: a cell that starts with one of these characters is written as text. */
export function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The rows of one data set, as the report holds them. Amounts are written in major units with two decimals, never added across currencies. */
export function reportRows(report: Report, key: SetKey): (string | number)[][] {
  const money = (cents: number) => (cents / 100).toFixed(2);
  if (key === 'income') return [['Month', ...report.revenue.map((entry) => entry.currency)], ...report.months.map((month, i) => [month, ...report.revenue.map((entry) => money(entry.series[i] ?? 0))])];
  if (key === 'customers') return [['Month', 'New customers', 'Cancellations'], ...report.months.map((month, i) => [month, report.signups[i] ?? 0, report.cancellations[i] ?? 0])];
  if (key === 'products') return [['Product', 'Currency', 'Income', 'Orders'], ...report.byProduct.map((row) => [row.name, row.currency, money(row.total), row.orders])];
  return [['E-mail', 'Currency', 'Paid'], ...report.topCustomers.map((row) => [row.email, row.currency, money(row.total)])];
}

export function reportCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Pick a period and a data set, read the report from the server and save it as a CSV file. */
export default function ReportExports() {
  const [months, setMonths] = useState('12');
  const [key, setKey] = useState<SetKey>('income');
  const state = useAsync<Report>((signal) => get<Report>('/admin/reports', { months: Number(months) }, signal), [months]);
  const chosen = SETS.find((entry) => entry.key === key)!;
  const download = () => {
    if (!state.data) return;
    const blob = new Blob([reportCsv(reportRows(state.data, key))], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `blipmade-${key}-${months}-months.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <PageEditorShell eyebrow="Reports" title="Export a report" description="The figures come from the invoices, subscriptions, orders and accounts of the platform. Currencies are never added together." backTo="/admin/reports" backLabel="Back to reports"
      actions={<><SoftButton type="button" onClick={state.reload} disabled={state.loading}>Refresh</SoftButton><PrimaryButton type="button" onClick={download} disabled={!state.data || state.loading}>Download CSV</PrimaryButton></>}>
      <div className="grid max-w-xl gap-4">
        <Select label="Period" value={months} onChange={(event) => setMonths(event.target.value)}>
          {['3', '6', '12', '24'].map((value) => <option key={value} value={value}>Last {value} months</option>)}
        </Select>
        <Select label="Data" value={key} onChange={(event) => setKey(event.target.value as SetKey)} hint={chosen.hint}>
          {SETS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
        </Select>
        {state.loading && !state.data ? <LoadingBlock rows={2} label="Reading the report" />
          : state.error || !state.data ? <ErrorState title="The report could not be loaded" message={state.error?.message ?? 'Try again.'} onRetry={state.reload} />
          : (
            <div className="overflow-x-auto rounded-2xl bg-s2 p-3" aria-label="Preview of the file">
              <table className="w-full text-left text-[12.5px]">
                <tbody>
                  {reportRows(state.data, key).slice(0, 8).map((row, index) => (
                    <tr key={index} className={index === 0 ? 'font-semibold text-ink' : 'text-ink2'}>{row.map((cell, column) => <td key={column} className="py-1 pr-4">{String(cell)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-ink3">The first rows of the file. Calculated {new Date(state.data.generatedAt).toLocaleString()}.</p>
            </div>
          )}
      </div>
    </PageEditorShell>
  );
}
