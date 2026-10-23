import { useEffect, useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import { getStartup, updateStartup } from '../../lib/instance-api';
import {
  EmptyState,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  TextInput,
  useToast,
} from '../../ui-app';
import { ApiErrorState, type TabProps } from './common';

/**
 * The startup of the instance: the image, the command and the environment.
 *
 * The environment is edited as a list of pairs. A value that is not shown is
 * not changed: the whole environment is sent to the panel, so the pairs that
 * are here are the ones the server has.
 */

interface Pair {
  key: string;
  value: string;
}

export default function StartupTab({ instance }: TabProps) {
  const { push } = useToast();
  const startup = useAsync((signal) => getStartup(instance.id, signal), [instance.id]);
  const [image, setImage] = useState('');
  const [command, setCommand] = useState('');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const current = startup.data;
    if (!current) return;
    setImage(current.image ?? '');
    setCommand(current.command ?? '');
    setPairs(Object.entries(current.environment ?? {}).map(([key, value]) => ({ key, value })));
  }, [startup.data]);

  const save = async () => {
    setBusy(true);
    try {
      const environment: Record<string, string> = {};
      for (const pair of pairs) {
        const key = pair.key.trim();
        if (!key) continue;
        environment[key] = pair.value;
      }
      await updateStartup(instance.id, { image: image.trim(), command, environment });
      push('The startup was updated. The server uses it the next time it starts.', 'ok');
      startup.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The startup was not updated.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      {startup.loading ? (
        <Panel title="Startup">
          <LoadingBlock rows={3} label="Loading the startup" />
        </Panel>
      ) : startup.error ? (
        <Panel title="Startup">
          <ApiErrorState error={startup.error} onRetry={startup.reload} title="We could not load the startup" />
        </Panel>
      ) : (
        <>
          <Panel
            title="Image and command"
            description="The image the container runs and the command it starts with. Both are read back from the panel."
          >
            <div className="grid gap-3">
              <TextInput
                label="Docker image"
                value={image}
                onChange={(event) => setImage(event.target.value)}
                placeholder="ghcr.io/ptero-eggs/yolks:nodejs_25"
                autoComplete="off"
              />
              <TextInput
                label="Startup command"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="npm run start"
                hint="The command the container runs when it starts."
                autoComplete="off"
              />
            </div>
          </Panel>

          <Panel
            title="Environment"
            description="The variables the container gets. A variable that is removed here is gone from the server."
            action={
              <SoftButton onClick={() => setPairs([...pairs, { key: '', value: '' }])}>Add a variable</SoftButton>
            }
          >
            {pairs.length === 0 ? (
              <EmptyState title="No variables." description="The container starts without any environment variable." />
            ) : (
              <div className="grid gap-2.5">
                {pairs.map((pair, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                    <TextInput
                      label="Name"
                      value={pair.key}
                      onChange={(event) => {
                        const next = [...pairs];
                        next[index] = { ...pair, key: event.target.value };
                        setPairs(next);
                      }}
                      placeholder="PORT"
                      className="font-mono"
                    />
                    <TextInput
                      label="Value"
                      value={pair.value}
                      onChange={(event) => {
                        const next = [...pairs];
                        next[index] = { ...pair, value: event.target.value };
                        setPairs(next);
                      }}
                      placeholder="3000"
                      className="font-mono"
                    />
                    <SoftButton
                      onClick={() => setPairs(pairs.filter((_, position) => position !== index))}
                      className="self-end"
                    >
                      Remove
                    </SoftButton>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save the startup'}
            </PrimaryButton>
            <SoftButton
              onClick={() => {
                const current = startup.data;
                if (!current) return;
                setImage(current.image ?? '');
                setCommand(current.command ?? '');
                setPairs(Object.entries(current.environment ?? {}).map(([key, value]) => ({ key, value })));
              }}
              disabled={busy}
            >
              Discard the changes
            </SoftButton>
          </div>
        </>
      )}
    </div>
  );
}
