import { useState } from 'react';
import { passkeyFailure, passkeysSupported, registerPasskey } from '../lib/passkeys';
import { useRouter } from '../router';
import { ErrorState, PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from './components/premium';

const BACK_TO = '/app/settings?tab=security';

/** A new passkey. The browser asks the device; the page says what happened in words, and never claims a passkey that was not made. */
export default function PasskeyNew() {
  const { navigate } = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const supported = passkeysSupported();
  const dirty = name.trim() !== '';
  useUnsavedChangesGuard(dirty && !adding, 'Discard this passkey?');

  const add = async () => {
    setFailure(null);
    setAdding(true);
    try {
      await registerPasskey(name.trim() || undefined);
      toast.push('The passkey was added.', 'ok');
      navigate(BACK_TO, { replace: true });
    } catch (error) {
      setFailure(passkeyFailure(error));
    } finally {
      setAdding(false);
    }
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this passkey?')) navigate(BACK_TO);
  };

  return (
    <PageEditorShell
      eyebrow="Security"
      title="Add a passkey"
      description="Sign in with your fingerprint, face or device PIN, without typing a password. A passkey stays on your device."
      backTo={BACK_TO}
      backLabel="Back to security"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={adding}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void add()} disabled={adding || !supported}>
            {adding ? 'Waiting for the device…' : 'Add a passkey'}
          </PrimaryButton>
        </>
      }
    >
      {!supported ? (
        <ErrorState title="This browser does not support passkeys" message="Try a recent version of Chrome, Edge, Safari or Firefox." />
      ) : (
        <form noValidate onSubmit={(event) => { event.preventDefault(); void add(); }} className="grid gap-4">
          <TextInput label="Name of the new passkey (optional)" value={name} onChange={(event) => setName(event.target.value)} placeholder="My laptop" autoComplete="off" hint="A name helps you tell your devices apart in the list." />
          {failure && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{failure}</p>}
        </form>
      )}
    </PageEditorShell>
  );
}
