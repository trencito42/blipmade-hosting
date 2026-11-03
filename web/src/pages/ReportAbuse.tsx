import { useState } from 'react';
import { ApiError, post } from '../lib/api';
import { Link } from '../router';
import { Button } from '../ui';
import { Footer, Nav } from '../site/ui';
import { Select, TextArea, TextInput } from '../ui-app';

/** The public form to report abuse: spam, phishing, malware, an attack, a copyright claim. No account is needed. */
export default function ReportAbuse() {
  const [form, setForm] = useState({ name: '', email: '', category: 'phishing', target: '', details: '', evidenceUrl: '' });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMessage('');
    setErrors({});
    try {
      const result = await post<{ reference: string }>('/abuse/report', { ...form, evidenceUrl: form.evidenceUrl.trim() || undefined });
      setReference(result.reference);
    } catch (failure) {
      if (failure instanceof ApiError && failure.fields) setErrors(failure.fields);
      setMessage(failure instanceof Error ? failure.message : 'The report could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100svh] bg-bg">
      <Nav />
      <main className="mx-auto w-full max-w-[680px] px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="text-[clamp(34px,5vw,56px)] leading-[1] font-semibold tracking-[-0.045em] text-ink">Report abuse</h1>
        <p className="mt-4 text-[16.5px] leading-relaxed text-ink2">
          Something hosted with Blipmade is sending spam, phishing, malware, attacking you, or breaking your rights? Tell us where it is and what happened. We read every report, and we act on what we can confirm.
        </p>
        {reference ? (
          <div role="status" className="mt-8 rounded-[26px] p-6 text-paper" style={{ background: '#4ee595' }}>
            <p className="font-display text-[28px] leading-tight font-semibold tracking-[-0.035em]">Your report was received. Thank you.</p>
            <p className="mt-2 text-[14.5px] font-medium opacity-80">Reference <span className="font-mono font-bold">{reference}</span>. We may write to the address you gave if we need more.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {message && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[14.5px] text-bad">{message}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Your name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} error={errors.name} autoComplete="name" />
              <TextInput label="Your email address" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} error={errors.email} autoComplete="email" />
            </div>
            <Select label="What kind of abuse?" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              <option value="phishing">Phishing</option>
              <option value="spam">Spam</option>
              <option value="malware">Malware</option>
              <option value="ddos">An attack (DDoS, scanning)</option>
              <option value="copyright">Copyright</option>
              <option value="illegal">Illegal content</option>
              <option value="other">Something else</option>
            </Select>
            <TextInput label="Where is it? (address, hostname or IP)" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} error={errors.target} placeholder="https://example.blipmade.com/login" />
            <TextArea label="What happened?" value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} error={errors.details} rows={6} hint="Dates, times, what you saw. At least 20 characters." />
            <TextInput label="A link to the evidence (optional)" value={form.evidenceUrl} onChange={(event) => setForm({ ...form, evidenceUrl: event.target.value })} error={errors.evidenceUrl} placeholder="https://" />
            <div><Button onClick={() => void submit()} disabled={busy}>{busy ? 'Sending…' : 'Send the report'}</Button></div>
            <p className="text-[13px] text-ink3">Your address is used only to follow up on this report and is never shown to the customer. For a legal notice, write to support from your account instead.</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
