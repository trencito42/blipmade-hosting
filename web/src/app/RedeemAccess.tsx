import { useState } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from './components/premium';

const BACK_TO = '/app/instances';

export default function RedeemAccess() {
  const { navigate } = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const dirty = code.trim() !== '';
  useUnsavedChangesGuard(dirty, 'Discard this code?');
  const redeem = useAction(async () => post<{ name: string; role: string }>('/access/redeem', { code: code.trim() }));
  const submit = async () => {
    if (code.trim().length < 8) return;
    const result = await redeem.run();
    if (!result) return;
    toast.push(`You now have access to ${result.name} as a ${result.role}.`, 'ok');
    navigate(BACK_TO, { replace: true });
  };
  return (
    <PageEditorShell
      eyebrow="Apps & databases"
      title="Use an access code"
      description="A code from the owner of an app opens it for this account."
      backTo={BACK_TO}
      backLabel="Back to apps"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={() => navigate(BACK_TO)} disabled={redeem.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={redeem.pending || code.trim().length < 8}>{redeem.pending ? 'Checking…' : 'Use code'}</PrimaryButton>
        </>
      }
    >
      <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-4">
        <TextInput label="Access code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="ABCD-EFGH-JKLM" autoComplete="off" spellCheck={false} className="font-mono" error={redeem.error ?? undefined} />
      </form>
    </PageEditorShell>
  );
}
