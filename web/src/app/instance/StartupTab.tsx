import { useAsync } from '../../lib/useAsync';
import { getEnvFiles, getStartup } from '../../lib/instance-api';
import { ButtonLink, EmptyState, LoadingBlock, Panel, TextInput } from '../../ui-app';
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
  const startup = useAsync((signal) => getStartup(instance.id, signal), [instance.id]);

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
  return (
    <div className="grid gap-3">
      <Panel title="Image and command" description="The image the container runs and the command it starts with." action={<ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/startup/edit`}>Edit startup</ButtonLink>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Image" value={data.image} readOnly className="font-mono" />
          <TextInput label="Startup command" value={data.command} readOnly className="font-mono" hint="Set by the app. It cannot be changed from here." />
        </div>
      </Panel>

      <Panel title="Variables" description="The settings this app reads when it starts. A change is used the next time the server starts.">
        {data.variables.length === 0 ? (
          <EmptyState title="No settings." description="This app has no variable to set." />
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            {data.variables.map((variable) => (
              <div key={variable.key} className="rounded-xl bg-s2 p-3"><dt className="text-[12px] font-semibold uppercase tracking-wide text-ink3">{variable.name}</dt><dd className="mt-1 truncate font-mono text-[13px] text-ink">{SENSITIVE.test(variable.key) ? '••••••••' : variable.value || '—'}</dd></div>
            ))}
          </dl>
        )}
      </Panel>

      <EnvFiles instanceId={instance.id} />

    </div>
  );
}

const SENSITIVE = /(SECRET|TOKEN|PASS|PWD|KEY|PRIVATE|CREDENTIAL|AUTH|DSN|SALT|SIGNING|COOKIE|SESSION|DATABASE_URL|_URI$|_URL$)/i;

/**
 * The environment files of the server (`.env`, `.env.local`, `.env.production`...), found in its main folder and
 * shown as lists of variables. Only the files that are there are shown. What is saved here is what the app reads.
 * Values that look like secrets are masked until the reader asks to see them. Comments and blank lines in a file are kept.
 */
function EnvFiles({ instanceId }: { instanceId: string }) {
  const files = useAsync((signal) => getEnvFiles(instanceId, signal), [instanceId]);
  return (
    <Panel title="Environment files" description="The .env files this server has, read from its files. A change is written to the file and the app reads it the next time it starts.">
      {files.loading && !files.data ? (
        <LoadingBlock rows={2} label="Looking for environment files" />
      ) : files.error || !files.data ? (
        <ApiErrorState error={files.error} onRetry={files.reload} title="We could not read the files" />
      ) : files.data.files.length === 0 ? (
        <div className="grid justify-items-start gap-3">
          <p className="text-[14px] text-ink2">This server has no .env file in its main folder.</p>
          <ButtonLink to={`/app/instances/${encodeURIComponent(instanceId)}/env-files/${encodeURIComponent('.env')}/edit`} variant="soft">Create .env file</ButtonLink>
        </div>
      ) : (
        <div className="grid gap-5">
          {files.data.files.map((file) => <div key={file.name} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-s2 p-4"><div><p className="font-mono text-[14px] font-semibold text-ink">{file.name}</p><p className="mt-1 text-[12.5px] text-ink3">{file.entries.length} {file.entries.length === 1 ? 'variable' : 'variables'}</p></div><ButtonLink to={`/app/instances/${encodeURIComponent(instanceId)}/env-files/${encodeURIComponent(file.name)}/edit`} variant="soft">Edit file</ButtonLink></div>)}
        </div>
      )}
    </Panel>
  );
}
