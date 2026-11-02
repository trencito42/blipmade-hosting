/**
 * The dialog of a new mailbox.
 *
 * The form is small and it is in a dialog, so the page of the domain keeps
 * its shape. When the server makes the password, the dialog stays open and
 * shows it: the password is seen only once, so it cannot be taken away
 * before the customer had the chance to store it.
 */

import { useEffect, useState } from 'react';
import { createMailbox, type MailDomainView, type MailboxView } from '../../lib/api';
import { useAction } from '../../lib/useAsync';
import { PrimaryButton, SoftButton, TextInput, useToast } from '../../ui-app';
import { MailDialog } from './MailDialog';
import { OneTimePasswordBox } from './OneTimePasswordBox';
import { validateMailLocalPart } from './shared';

export function MailboxCreateDialog({
  open,
  domain,
  onClose,
  onCreated,
}: {
  open: boolean;
  domain: MailDomainView;
  /** The customer closed the dialog. */
  onClose: () => void;
  /** The mailbox was created. */
  onCreated: (mailbox: MailboxView) => void;
}) {
  const { push } = useToast();
  const [localPart, setLocalPart] = useState('');
  const [password, setPassword] = useState('');
  const [localPartError, setLocalPartError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  /** The password the server made, shown until the customer stores it. */
  const [oneTime, setOneTime] = useState<{ address: string; password: string } | null>(null);

  const create = useAction(async (part: string, secret: string) => {
    const body: { localPart: string; password?: string } = { localPart: part };
    if (secret) body.password = secret;
    const { mailbox } = await createMailbox(domain.id, body);
    return mailbox;
  });

  const submit = async () => {
    const part = localPart.trim().toLowerCase();
    const problem = validateMailLocalPart(part);
    if (problem) {
      setLocalPartError(problem);
      return;
    }
    setLocalPartError(null);
    if (password && password.length < 10) {
      setPasswordError('The password needs at least 10 characters.');
      return;
    }
    setPasswordError(null);
    const mailbox = await create.run(part, password);
    if (!mailbox) return;
    setLocalPart('');
    setPassword('');
    onCreated(mailbox);
    if (mailbox.password) {
      // The server made the password and this is the only time it is seen.
      setOneTime({ address: mailbox.address, password: mailbox.password });
      push('Mailbox created. Its password is shown once, below.');
      return;
    }
    push('Mailbox created.');
    onClose();
  };

  const fieldError = create.fieldErrors.localPart ?? create.fieldErrors.name ?? create.fieldErrors.address;

  // The name the customer typed is not lost without a warning: the browser
  // asks before the page is left with something in the fields.
  useEffect(() => {
    if (!open || (!localPart.trim() && !password)) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    addEventListener('beforeunload', onBeforeUnload);
    return () => removeEventListener('beforeunload', onBeforeUnload);
  }, [open, localPart, password]);

  return (
    <MailDialog
      open={open}
      title="Create a mailbox"
      description={
        oneTime ? undefined : (
          <>
            The address is the name you type and the domain of the page. Leave the password empty and the server
            makes one you see once.
          </>
        )
      }
      onClose={onClose}
      // While the password is on the screen, the dialog does not close: the
      // customer has to say that they stored it.
      closeBlocked={Boolean(oneTime)}
      footer={
        oneTime ? null : (
          <>
            <SoftButton onClick={onClose} disabled={create.pending} className="w-full sm:w-auto">
              Cancel
            </SoftButton>
            <PrimaryButton onClick={() => void submit()} disabled={create.pending} className="w-full sm:w-auto">
              {create.pending ? 'Creating…' : 'Create mailbox'}
            </PrimaryButton>
          </>
        )
      }
    >
      {oneTime ? (
        <div className="mt-4">
          <OneTimePasswordBox
            address={oneTime.address}
            password={oneTime.password}
            onDismiss={() => {
              setOneTime(null);
              onClose();
            }}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <TextInput
            label="Name"
            value={localPart}
            onChange={(event) => {
              setLocalPart(event.target.value);
              if (localPartError) setLocalPartError(null);
            }}
            placeholder="contact"
            error={localPartError ?? fieldError}
            hint={`The name before the @. The address will be ${localPart.trim() ? `${localPart.trim().toLowerCase()}@` : ''}${domain.name}.`}
            autoComplete="off"
            spellCheck={false}
          />
          <TextInput
            label="Password (optional)"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (passwordError) setPasswordError(null);
            }}
            placeholder="Leave it empty"
            error={passwordError ?? create.fieldErrors.password}
            hint="Leave it empty and the server makes a password you see once."
            autoComplete="new-password"
          />
          {create.error && (
            <p role="alert" className="text-[13.5px] font-medium text-bad">
              {create.error}
            </p>
          )}
        </div>
      )}
    </MailDialog>
  );
}
