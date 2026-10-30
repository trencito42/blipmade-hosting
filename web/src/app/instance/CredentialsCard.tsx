import { useState } from 'react';
import { getInstanceCredentials, type InstanceCredential } from '../../lib/instance-api';
import { Panel, SoftButton, useToast } from '../../ui-app';
import { ApiErrorState } from './common';

/**
 * The password of the service.
 *
 * Some services come with a password that the platform made for the
 * instance, such as the password of a database. The value is only in the
 * answer of the server, so it is asked for when the customer wants it, and
 * every ask is written to the log.
 */
export default function CredentialsCard({ instanceId }: { instanceId: string }) {
  const { push } = useToast();
  const [credentials, setCredentials] = useState<InstanceCredential[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const show = async () => {
    setLoading(true);
    setError(null);
    try {
      const answer = await getInstanceCredentials(instanceId);
      setCredentials(answer.credentials);
    } catch (failure) {
      setError(failure);
    } finally {
      setLoading(false);
    }
  };

  // A copy takes the value and nothing else, so it can be pasted straight into a
  // field. With more than one value every value has its own button.
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      push('Copied.', 'ok');
    } catch {
      push('The copy did not work. Select the text and copy it by hand.', 'error');
    }
  };
  const readable = (credentials ?? []).filter((credential) => credential.value);

  return (
    <Panel
      title="Service credentials"
      description="The password of this service was made for this instance. Copy it before you change it."
      action={
        credentials === null ? (
          <SoftButton onClick={show} disabled={loading}>
            {loading ? 'Reading' : 'Show the credentials'}
          </SoftButton>
        ) : (
          readable.length === 1 ? (
            <SoftButton onClick={() => void copy(readable[0].value as string)}>Copy</SoftButton>
          ) : null
        )
      }
    >
      {error ? (
        <ApiErrorState error={error} onRetry={show} title="We could not read the credentials" />
      ) : credentials === null ? (
        <p className="text-[13.5px] text-ink2">
          The password is not shown until you ask for it, and every ask is written to the log.
        </p>
      ) : credentials.length === 0 ? (
        <p className="text-[13.5px] text-ink2">This service has no password made by the platform.</p>
      ) : (
        <div className="grid gap-2">
          {credentials.map((credential) => (
            <div key={credential.name} className="grid gap-1">
              <span className="flex items-center justify-between gap-2 text-[13px] font-bold text-ink">
                {credential.label}
                {credential.value && readable.length > 1 ? (
                  <SoftButton onClick={() => void copy(credential.value as string)}>Copy</SoftButton>
                ) : null}
              </span>
              <pre className="overflow-x-auto rounded-2xl bg-s2 p-3.5 font-mono text-[13px] text-ink">
                {credential.value ?? 'This value can no longer be read.'}
              </pre>
            </div>
          ))}
          <p className="text-[12.5px] text-ink3">
            Change the password inside the service when you want another one. The one above stays in
            the log of the console.
          </p>
        </div>
      )}
    </Panel>
  );
}
