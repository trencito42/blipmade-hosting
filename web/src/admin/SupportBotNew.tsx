import { useState } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { PrimaryButton, SoftButton, TextInput } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, useAdminSession } from './Overview';

const BACK_TO = '/admin/support/bots';

/** A new bot: a name, and a start from the template or from an empty draft. */
export default function SupportBotNew() {
  const { navigate } = useRouter();
  const mayEdit = can(useAdminSession().staff, 'settings.write');
  const [name, setName] = useState('');
  const [made, setMade] = useState(false);
  const dirty = !made && name.trim() !== '';
  useUnsavedChangesGuard(dirty, 'Discard this bot?');
  const create = useAction(async (template: boolean) => {
    const res = await post<{ bot: { id: string } }>('/admin/support/bots', { name: name.trim(), template });
    setMade(true);
    navigate(`/admin/support/bots/${encodeURIComponent(res.bot.id)}/edit`, { replace: true });
  });
  const ok = mayEdit && name.trim().length >= 2 && !create.pending;
  const discard = () => {
    if (!dirty || window.confirm('Discard this bot?')) navigate(BACK_TO);
  };
  return (
    <PageEditorShell
      eyebrow="Support bots"
      title="New bot"
      description="Start from the template (a menu with technical, billing, account, plans and a person) or from an empty bot. Both are drafts that you edit."
      backTo={BACK_TO}
      backLabel="Back to bots"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton>
          <SoftButton type="button" onClick={() => void create.run(false)} disabled={!ok}>Start empty</SoftButton>
          <PrimaryButton type="button" onClick={() => void create.run(true)} disabled={!ok}>{create.pending ? 'Making…' : 'From the template'}</PrimaryButton>
        </>
      }
    >
      <div className="grid gap-3">
        {!mayEdit && <p className="text-[13px] text-ink3">Your role does not hold &quot;settings.write&quot;.</p>}
        <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="off" />
        {create.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{create.error}</p>}
      </div>
    </PageEditorShell>
  );
}
