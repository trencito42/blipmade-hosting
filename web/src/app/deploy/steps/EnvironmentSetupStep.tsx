import { TextArea, TextInput } from '../../../ui-app';

interface EnvironmentSetupStepProps {
  kind: 'vps' | 'server' | 'app';
  sshKey?: string;
  onChangeSshKey?: (key: string) => void;
  serviceName: string;
  onChangeServiceName: (name: string) => void;
  variables?: Record<string, string>;
  onChangeVariable?: (key: string, value: string) => void;
  variableSpecs?: Record<string, { label: string; description?: string; required?: boolean; defaultValue?: string }>;
  error?: string | null;
}

export function EnvironmentSetupStep({
  kind,
  sshKey = '',
  onChangeSshKey,
  serviceName,
  onChangeServiceName,
  variables,
  onChangeVariable,
  variableSpecs,
  error,
}: EnvironmentSetupStepProps) {
  const safeSpecs = (variableSpecs && typeof variableSpecs === 'object') ? variableSpecs : {};
  const safeVars = (variables && typeof variables === 'object') ? variables : {};
  const hasVars = Object.keys(safeSpecs).length > 0;

  return (
    <div className="grid gap-6">
      {/* Service Name */}
      <div className="grid gap-3 rounded-2xl border border-line bg-card p-5">
        <TextInput
          label="Service label / Friendly name"
          value={serviceName}
          onChange={(e) => onChangeServiceName(e.target.value)}
          placeholder="e.g. Production Web or Survival SMP"
        />
        <p className="text-[12px] text-ink3">A display label to identify this service in your customer dashboard.</p>
      </div>

      {/* SSH Key for VPS */}
      {kind === 'vps' && onChangeSshKey && (
        <div className="grid gap-3 rounded-2xl border border-line bg-card p-5">
          <div>
            <label className="text-[13px] font-medium text-ink">SSH Public Key (Required for Root Access)</label>
            <p className="mt-1 text-[12.5px] text-ink3">
              Paste your public SSH key (starts with ssh-ed25519 or ssh-rsa). We disable insecure password authentication by default.
            </p>
          </div>
          <TextArea
            label="SSH Public Key (Required for Root Access)"
            rows={4}
            value={sshKey}
            onChange={(e) => onChangeSshKey(e.target.value)}
            placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... user@machine"
            className="font-mono text-[12px]"
          />
          {error && <p className="text-[12.5px] text-bad">{error}</p>}
        </div>
      )}

      {/* Customer variables for games and apps */}
      {hasVars && onChangeVariable && (
        <div className="grid gap-4 rounded-2xl border border-line bg-card p-5">
          <h4 className="font-semibold text-ink">Application Configuration & Environment</h4>
          <div className="grid gap-4">
            {Object.entries(safeSpecs).map(([key, spec]) => (
              <div key={key} className="grid gap-1.5">
                <TextInput
                  label={`${spec.label}${spec.required ? ' *' : ''}`}
                  value={safeVars[key] ?? spec.defaultValue ?? ''}
                  onChange={(e) => onChangeVariable(key, e.target.value)}
                  placeholder={spec.defaultValue ?? ''}
                />
                {spec.description && <p className="text-[12px] text-ink3">{spec.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
