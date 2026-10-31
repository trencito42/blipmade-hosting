import { useEffect, useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import { getEnvFiles, getStartup, saveEnvFile, updateStartup, type EnvFile } from '../../lib/instance-api';
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
      </Panel>

      <EnvFiles instanceId={instance.id} />

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

/**
 * The `.env` and `.env.local` files of the server, as lists of variables. They are the files in the Files tab: what
 * is saved here is what the app reads. Comments and blank lines in the file are kept.
 */
function EnvFiles({ instanceId }: { instanceId: string }) {
  const files = useAsync((signal) => getEnvFiles(instanceId, signal), [instanceId]);
  return (
    <Panel title="Environment files" description="Your own variables (keys, tokens, settings) from the .env and .env.local files of the server. Changes are written to the file and the app reads them the next time it starts.">
      {files.loading && !files.data ? (
        <LoadingBlock rows={2} label="Reading the files" />
      ) : files.error || !files.data ? (
        <ApiErrorState error={files.error} onRetry={files.reload} title="We could not read the files" />
      ) : (
        <div className="grid gap-5">
          {files.data.files.map((file) => (
            <EnvFileEditor key={file.name} instanceId={instanceId} file={file} onSaved={files.reload} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function EnvFileEditor({ instanceId, file, onSaved }: { instanceId: string; file: EnvFile; onSaved: () => void }) {
  const { push } = useToast();
  const [rows, setRows] = useState(file.entries);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRows(file.entries), [file]);
  const save = async () => {
    setBusy(true);
    try {
      await saveEnvFile(instanceId, file.name, rows.filter((row) => row.key.trim() !== '').map((row) => ({ key: row.key.trim(), value: row.value })));
      push(`${file.name} was saved.`, 'ok');
      onSaved();
    } catch (error) {
      push(error instanceof Error ? error.message : `${file.name} was not saved.`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[14px] font-semibold text-ink">{file.name} {!file.exists && <span className="ml-1 font-sans text-[12.5px] font-normal text-ink3">(not there yet, it is made when you save)</span>}</p>
        <SoftButton onClick={() => setRows([...rows, { key: '', value: '' }])}>Add a variable</SoftButton>
      </div>
      {rows.length === 0 ? (
        <p className="text-[13.5px] text-ink3">No variables.</p>
      ) : (
        rows.map((row, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <TextInput label="Name" value={row.key} placeholder="API_KEY" className="font-mono" onChange={(event) => setRows(rows.map((entry, position) => (position === index ? { ...entry, key: event.target.value } : entry)))} />
            <TextInput label="Value" value={row.value} className="font-mono" onChange={(event) => setRows(rows.map((entry, position) => (position === index ? { ...entry, value: event.target.value } : entry)))} />
            <SoftButton className="self-end" onClick={() => setRows(rows.filter((_, position) => position !== index))}>Remove</SoftButton>
          </div>
        ))
      )}
      <div className="flex gap-2">
        <PrimaryButton onClick={save} disabled={busy}>{busy ? 'Saving…' : `Save ${file.name}`}</PrimaryButton>
        <SoftButton onClick={() => setRows(file.entries)} disabled={busy}>Discard</SoftButton>
      </div>
    </div>
  );
}
