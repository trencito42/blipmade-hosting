/**
 * The dialog of a new alias.
 *
 * An alias is another address that reaches one of the mailboxes of the
 * domain, so the mailbox it goes to is chosen from the list of the domain
 * and never typed by hand.
 */

import { useEffect, useMemo, useState } from 'react';
import { createMailAlias, type MailAliasView, type MailDomainView, type MailboxView } from '../../lib/api';
import { useAction } from '../../lib/useAsync';
import { PrimaryButton, Select, SoftButton, TextInput, useToast } from '../../ui-app';
import { MailDialog } from './MailDialog';
import { mailAliasAddress, validateMailAlias } from './shared';

export function AliasCreateDialog({
  open,
  domain,
  mailboxes,
  onClose,
  onCreated,
}: {
  open: boolean;
  domain: MailDomainView;
  /** The mailboxes of the domain: the alias goes to one of them. */
  mailboxes: MailboxView[];
  /** The customer closed the dialog. */
  onClose: () => void;
  /** The alias was created. */
  onCreated: (alias: MailAliasView) => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useAction(async (alias: string, to: string) => {
    const { alias: created } = await createMailAlias(domain.id, { alias, target: to });
    return created;
  });

  // The first mailbox is the target of the alias, so the customer does not
  // have to choose one every time. A target that is gone is replaced.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setTarget((current) =>
      current && mailboxes.some((mailbox) => mailbox.address === current) ? current : (mailboxes[0]?.address ?? ''),
    );
  }, [open, mailboxes]);

  const address = useMemo(() => mailAliasAddress(name, domain.name), [name, domain.name]);

  const submit = async () => {
    const problem = validateMailAlias(name, domain.name);
    if (problem) {
      setError(problem);
      return;
    }
    if (!target) {
      setError('Choose the mailbox that receives the mail.');
      return;
    }
    if (!address) {
      setError('Enter the address that should receive the mail.');
      return;
    }
    setError(null);
    const created = await create.run(address, target);
    if (!created) return;
    setName('');
    onCreated(created);
    push('Alias created.');
    onClose();
  };

  const fieldError = create.fieldErrors.alias ?? create.fieldErrors.name ?? create.fieldErrors.address;

  // The name the customer typed is not lost without a warning: the browser
  // asks before the page is left with something in the fields.
  useEffect(() => {
    if (!open || !name.trim()) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    addEventListener('beforeunload', onBeforeUnload);
    return () => removeEventListener('beforeunload', onBeforeUnload);
  }, [open, name]);

  return (
    <MailDialog
      open={open}
      title="Create an alias"
      description="The alias is another address of the domain. It forwards the mail it receives to one of your mailboxes."
      onClose={onClose}
      footer={
        <>
          <SoftButton onClick={onClose} disabled={create.pending} className="w-full sm:w-auto">
            Cancel
          </SoftButton>
          <PrimaryButton onClick={() => void submit()} disabled={create.pending} className="w-full sm:w-auto">
            {create.pending ? 'Creating…' : 'Create alias'}
          </PrimaryButton>
        </>
      }
    >
      <div className="mt-4 grid gap-3">
        <TextInput
          label="Alias"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          placeholder="info"
          error={error ?? fieldError}
          hint={address ? `The alias will be ${address}.` : 'The name before the @. The domain is added for you.'}
          autoComplete="off"
          spellCheck={false}
        />
        <Select
          label="Goes to"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          error={create.fieldErrors.target ?? create.fieldErrors.goto}
          hint="The mailbox that receives the mail."
        >
          {mailboxes.length ? (
            mailboxes.map((mailbox) => (
              <option key={mailbox.id} value={mailbox.address}>
                {mailbox.address}
              </option>
            ))
          ) : (
            <option value="">No mailbox yet</option>
          )}
        </Select>
        {mailboxes.length === 0 && (
          <p className="text-[13px] text-ink3">Create a mailbox first: an alias needs one to go to.</p>
        )}
        {create.error && (
          <p role="alert" className="text-[13.5px] font-medium text-bad">
            {create.error}
          </p>
        )}
      </div>
    </MailDialog>
  );
}
