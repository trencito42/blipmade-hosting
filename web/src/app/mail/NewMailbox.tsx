import { useMemo, useState } from 'react';
import { createMailbox, get, listMailboxes, type MailDomainView, type MailboxView } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';
import { OneTimePasswordBox } from './OneTimePasswordBox';
import { validateMailLocalPart } from './shared';

export default function NewMailbox() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const [localPart, setLocalPart] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<MailboxView | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const domainState = useAsync(
    async (signal) => (await get<{ domain: MailDomainView }>(`/mail/domains/${encodeURIComponent(id)}`, undefined, signal)).domain,
    [id],
  );
  const mailboxesState = useAsync(
    async (signal) => (await listMailboxes(id, signal)).mailboxes,
    [id],
  );
  const domain = domainState.data;
  const backTo = id ? `/app/mail/domains/${encodeURIComponent(id)}` : '/app/mail';
  const generatedSecret = created?.password;
  const dirty = !acknowledged && (Boolean(localPart || password) || Boolean(generatedSecret));
  useUnsavedChangesGuard(
    dirty,
    generatedSecret
      ? 'This generated password cannot be shown again. Leave before confirming that you stored it?'
      : 'Discard this mailbox draft?',
  );

  const existingLocalParts = useMemo(
    () => new Set((mailboxesState.data ?? []).map((mailbox) => mailbox.address.split('@')[0]?.toLowerCase())),
    [mailboxesState.data],
  );

  const create = useAction(async () => {
    const body: { localPart: string; password?: string } = { localPart: localPart.trim().toLowerCase() };
    if (password) body.password = password;
    return (await createMailbox(id, body)).mailbox;
  });

  const validateName = () => {
    const part = localPart.trim().toLowerCase();
    const problem = validateMailLocalPart(part);
    if (problem) return problem;
    if (existingLocalParts.has(part)) return 'A mailbox with this address already exists.';
    return undefined;
  };
  const nameError = touched ? validateName() : undefined;
  const passwordError = touched && password && password.length < 10 ? 'The password needs at least 10 characters.' : undefined;
  const full = domain ? domain.mailboxes >= domain.maxMailboxes : false;

  const submit = async () => {
    setTouched(true);
    if (validateName() || (password && password.length < 10) || full) return;
    const mailbox = await create.run();
    if (!mailbox) return;
    setCreated(mailbox);
    setLocalPart('');
    setPassword('');
    toast.push(mailbox.password ? 'Mailbox created. Store the generated password now.' : 'Mailbox created.');
  };

  const finish = () => {
    setAcknowledged(true);
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm(generatedSecret
      ? 'This generated password cannot be shown again. Leave before confirming that you stored it?'
      : 'Discard this mailbox draft?')) navigate(backTo);
  };

  const loading = domainState.loading || mailboxesState.loading;
  const failure = domainState.error ?? mailboxesState.error;
  const addressPreview = domain ? `${localPart.trim().toLowerCase() || 'name'}@${domain.name}` : 'name@example.com';

  return (
    <PageEditorShell
      eyebrow="Email mailbox"
      title={created ? 'Mailbox created' : 'Create a mailbox'}
      description={created
        ? `${created.address} is ready. ${generatedSecret ? 'Its generated password is visible only on this page, right now.' : 'The password you supplied is never returned by the API.'}`
        : 'Create one receiving address on this domain. Supply a password or leave it empty for a server-generated secret shown once.'}
      backTo={backTo}
      backLabel={domain ? `Back to ${domain.name}` : 'Back to email'}
      dirty={dirty}
      aside={
        <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
          <h2 className="text-[16px] font-semibold text-ink">Mailbox scope</h2>
          <p className="mt-2 break-all font-mono text-[14px] text-ink">{addressPreview}</p>
          {domain && (
            <div className="mt-4 rounded-xl bg-s2 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink3">Plan quota</p>
              <p className="mt-1 text-[13px] text-ink">{domain.mailboxes} of {domain.maxMailboxes} mailboxes used</p>
            </div>
          )}
          <p className="mt-4 text-[12.5px] leading-relaxed text-ink3">Passwords are never placed in URLs or browser storage. A generated password is returned by the server only once.</p>
        </aside>
      }
      actions={created ? (
        <PrimaryButton type="button" onClick={finish}>{generatedSecret ? 'I have stored the password' : 'Return to the domain'}</PrimaryButton>
      ) : (
        <>
          <SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending || loading || full}>
            {create.pending ? 'Creating mailbox…' : 'Create mailbox'}
          </PrimaryButton>
        </>
      )}
    >
      {loading ? <LoadingBlock rows={3} label="Loading mailbox limits" /> : failure ? (
        <ErrorState title="Could not load this email domain" message={failure.message} onRetry={() => { domainState.reload(); mailboxesState.reload(); }} />
      ) : !domain ? (
        <ErrorState title="This email domain was not found" message="The mailbox cannot be created without an owned email domain." />
      ) : created ? (
        generatedSecret ? (
          <OneTimePasswordBox address={created.address} password={generatedSecret} />
        ) : (
          <div role="status" className="rounded-2xl bg-acc-bg p-5">
            <p className="text-[15px] font-semibold text-ink">{created.address}</p>
            <p className="mt-1 text-[13.5px] text-ink2">The mailbox was created with the password you supplied.</p>
          </div>
        )
      ) : (
        <div className="grid gap-5">
          {full && (
            <p role="alert" className="rounded-2xl bg-warn/10 px-4 py-3 text-[13.5px] font-medium text-warn">
              This domain already uses all {domain.maxMailboxes} mailbox slots. Remove one or change the email plan first.
            </p>
          )}
          <TextInput
            label="Name"
            value={localPart}
            onChange={(event) => setLocalPart(event.target.value)}
            placeholder="contact"
            error={nameError ?? create.fieldErrors.localPart ?? create.fieldErrors.name ?? create.fieldErrors.address}
            hint={`The part before @. The complete address will be ${addressPreview}.`}
            autoComplete="off"
            spellCheck={false}
            disabled={full}
          />
          <TextInput
            label="Password (optional)"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Leave empty for a generated password"
            error={passwordError ?? create.fieldErrors.password}
            hint="At least 10 characters when supplied. Leave empty and the server generates a password shown once."
            autoComplete="new-password"
            disabled={full}
          />
          {create.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{create.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}
