import { useEffect, useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import { getStartup, updateStartup } from '../../lib/instance-api';
import { EmptyState, LoadingBlock, Panel, PrimaryButton, Select, SoftButton, TextInput, useToast } from '../../ui-app';
import { ApiErrorState, type TabProps } from './common';

/**
 * The startup of the instance: the image, the command and the variables of the app.
 *
 * Only what the app is meant to be configured with is here. The variables the app declares can be changed when the
 * app allows it, the image is picked from the ones the app offers, and the command is shown but not changed. The
 * panel drops a variable it does not know, so a new variable could not be saved: a customer's own variables go in a
 * `.env` file in the files of the server, which the app reads itself.
 */
export default function StartupTab({ instance }: TabProps) {
  const { push } = useToast();
  const startup = useAsync((signal) => getStartup(instance.id, signal), [instance.id]);
  const [image, setImage] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const reset = () => {
    const current = startup.data;
    if (!current) return;
    setImage(current.image ?? '');
    setValues(Object.fromEntries(current.variables.map((variable) => [variable.key, variable.value])));
  };
  useEffect(reset, [startup.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const current = startup.data;
    if (!current) return;
    setBusy(true);
    try {
      // Only what changed is sent, and only from the variables that can be changed.
      const environment: Record<string, string> = {};
      for (const variable of current.variables) {
        if (variable.editable && values[variable.key] !== undefined && values[variable.key] !== variable.value) environment[variable.key] = values[variable.key];
      }
      await updateStartup(instance.id, { ...(image && image !== current.image ? { image } : {}), environment });
      push('The startup was updated. The server uses it the next time it starts.', 'ok');
      startup.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The startup was not updated.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (startup.loading) {
    return (
      <Panel title="Startup">
        <LoadingBlock rows={3} label="Loading the startup" />
      </Panel>
    );
  }
  if (startup.error || !startup.data) {
    return (
      <Panel title="Startup">
        <ApiErrorState error={startup.error} onRetry={startup.reload} title="We could not load the startup" />
      </Panel>
    );
  }
  const data = startup.data;
  const images = data.images ?? [];
  const known = images.some((entry) => entry.image === data.image);
  return (
    <div className="grid gap-3">
      <Panel title="Image and command" description="The image the container runs and the command it starts with.">
        <div className="grid gap-3">
          {images.length > 1 ? (
            <Select label="Image" value={image} onChange={(event) => setImage(event.target.value)}>
              {!known && <option value={data.image}>{data.image}</option>}
              {images.map((entry) => (
                <option key={entry.image} value={entry.image}>{entry.label}</option>
              ))}
            </Select>
          ) : (
            <TextInput label="Image" value={data.image} readOnly className="font-mono" />
          )}
          <TextInput label="Startup command" value={data.command} readOnly className="font-mono" hint="Set by the app. It cannot be changed from here." />
        </div>
      </Panel>

      <Panel title="Variables" description="The settings this app reads when it starts. A change is used the next time the server starts.">
        {data.variables.length === 0 ? (
          <EmptyState title="No settings." description="This app has no variable to set." />
        ) : (
          <div className="grid gap-3">
            {data.variables.map((variable) => (
              <TextInput
                key={variable.key}
                label={variable.name}
                hint={[variable.key, variable.description, variable.editable ? '' : 'Set by Blipmade, cannot be changed.'].filter(Boolean).join(' · ')}
                value={values[variable.key] ?? ''}
                onChange={(event) => setValues({ ...values, [variable.key]: event.target.value })}
                readOnly={!variable.editable}
                className="font-mono"
              />
            ))}
          </div>
        )}
        <p className="mt-3 rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">
          Your own variables (API keys, tokens) go in a <span className="font-mono">.env</span> file in the Files tab. Your app reads that file itself, and it is not touched when the server starts.
        </p>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save the startup'}
        </PrimaryButton>
        <SoftButton onClick={reset} disabled={busy}>
          Discard the changes
        </SoftButton>
      </div>
    </div>
  );
}
