import { useCallback, useMemo, useState } from 'react';
import {
  createMailAlias,
  get,
  listMailAliases,
  listMailboxes,
  type MailDomainView,
} from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { Link, useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../../ui-app';
import { AsyncCombobox, PageEditorShell, useUnsavedChangesGuard, type ComboboxOption } from '../components/premium';
import { mailAliasAddress, validateMailAlias } from './shared';

export default function NewAlias() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [targetLabel, setTargetLabel] = useState('');
  const [touched, setTouched] = useState(false);

  const domainState = useAsync(
    async (signal) => (await get<{ domain: MailDomainView }>(`/mail/domains/${encodeURIComponent(id)}`, undefined, signal)).domain,
    [id],
  );
  const mailboxesState = useAsync(async (signal) => (await listMailboxes(id, signal)).mailboxes, [id]);
  const aliasesState = useAsync(async (signal) => (await listMailAliases(id, signal)).aliases, [id]);
  const domain = domainState.data;
  const mailboxes = useMemo(() => mailboxesState.data ?? [], [mailboxesState.data]);
  const activeMailboxes = useMemo(() => mailboxes.filter((mailbox) => mailbox.status === 'active'), [mailboxes]);
  const selectedTarget = target || (activeMailboxes.length === 1 ? activeMailboxes[0]!.address : '');
  const selectedTargetLabel = targetLabel || (activeMailboxes.length === 1 ? activeMailboxes[0]!.address : '');
  const address = domain ? mailAliasAddress(name, domain.name) : null;
  const backTo = id ? `/app/mail/domains/${encodeURIComponent(id)}` : '/app/mail';
  const dirty = Boolean(name || target);
  useUnsavedChangesGuard(dirty, 'Discard this alias draft?');

  const existing = useMemo(
    () => new Set((aliasesState.data ?? []).map((alias) => alias.alias.toLowerCase())),
    [aliasesState.data],
  );
  const loadMailboxes = useCallback(async (query: string): Promise<ComboboxOption[]> => {
    const normalized = query.toLocaleLowerCase();
    return mailboxes
      .filter((mailbox) => !normalized || mailbox.address.toLocaleLowerCase().includes(normalized))
      .map((mailbox) => ({
        value: mailbox.address,
        label: mailbox.address,
        group: 'Mailboxes',
        description: mailbox.status === 'active' ? 'Receives mail' : 'Disabled',
        disabled: mailbox.status !== 'active',
        disabledReason: mailbox.status !== 'active' ? 'This mailbox is disabled.' : undefined,
      }));
  }, [mailboxes]);

  const create = useAction(async () => {
    if (!address) throw new Error('The alias address is not valid.');
    return (await createMailAlias(id, { alias: address, target: selectedTarget })).alias;
  });
  const validateName = () => {
    if (!domain) return undefined;
    const problem = validateMailAlias(name, domain.name);
    if (problem) return problem;
    if (address && existing.has(address.toLowerCase())) return 'This alias already exists.';
    return undefined;
  };
  const nameError = touched ? validateName() : undefined;
  const targetError = touched && !selectedTarget ? 'Choose the mailbox that receives the mail.' : undefined;
  const full = domain ? domain.aliases >= domain.maxAliases : false;

  const submit = async () => {
    setTouched(true);
    if (validateName() || !selectedTarget || full) return;
    const alias = await create.run();
    if (!alias) return;
    toast.push(`${alias.alias} now forwards to ${alias.target}.`);
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this alias draft?')) navigate(backTo);
  };

  const loading = domainState.loading || mailboxesState.loading || aliasesState.loading;
  const failure = domainState.error ?? mailboxesState.error ?? aliasesState.error;

  return (
    <PageEditorShell
      eyebrow="Email alias"
      title="Create an alias"
      description="Add another address on this domain and route it to one active mailbox owned by the same domain."
      backTo={backTo}
      backLabel={domain ? `Back to ${domain.name}` : 'Back to email'}
      dirty={dirty}
      aside={
        <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
          <h2 className="text-[16px] font-semibold text-ink">Routing preview</h2>
          <p className="mt-3 break-all font-mono text-[13px] text-ink">{address ?? `alias@${domain?.name ?? 'example.com'}`}</p>
          <p className="my-2 text-[12px] text-ink3">forwards to</p>
          <p className="break-all font-mono text-[13px] text-ink">{selectedTargetLabel || 'a mailbox you choose'}</p>
          {domain && <p className="mt-4 text-[12.5px] text-ink3">{domain.aliases} of {domain.maxAliases} alias slots used.</p>}
        </aside>
      }
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending || loading || full || activeMailboxes.length === 0}>
            {create.pending ? 'Creating alias…' : 'Create alias'}
          </PrimaryButton>
        </>
      }
    >
      {loading ? <LoadingBlock rows={3} label="Loading domain mailboxes" /> : failure ? (
        <ErrorState title="Could not load alias options" message={failure.message} onRetry={() => { domainState.reload(); mailboxesState.reload(); aliasesState.reload(); }} />
      ) : !domain ? (
        <ErrorState title="This email domain was not found" message="An alias needs an owned email domain." />
      ) : (
        <div className="grid gap-5">
          {full && <p role="alert" className="rounded-2xl bg-warn/10 px-4 py-3 text-[13.5px] font-medium text-warn">This domain already uses all {domain.maxAliases} alias slots.</p>}
          {activeMailboxes.length === 0 && (
            <p role="alert" className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">
              Create a mailbox first: an alias needs a destination. <Link to={`/app/mail/domains/${encodeURIComponent(id)}/mailboxes/new`} className="font-semibold text-acc underline">Create mailbox</Link>
            </p>
          )}
          <TextInput
            label="Alias"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="info"
            error={nameError ?? create.fieldErrors.alias ?? create.fieldErrors.name ?? create.fieldErrors.address}
            hint={address ? `The complete alias will be ${address}.` : 'Enter the part before @; the domain is added for you.'}
            autoComplete="off"
            spellCheck={false}
            disabled={full}
          />
          <AsyncCombobox
            label="Goes to"
            value={selectedTarget}
            selectedLabel={selectedTargetLabel}
            onChange={(value, option) => { setTarget(value); setTargetLabel(option?.label ?? ''); }}
            loadOptions={loadMailboxes}
            placeholder="Search mailboxes…"
            hint="Only an active mailbox of this domain can receive the alias."
            error={targetError ?? create.fieldErrors.target ?? create.fieldErrors.goto}
            disabled={full || activeMailboxes.length === 0}
            allowClear={activeMailboxes.length !== 1}
          />
          {create.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{create.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}
