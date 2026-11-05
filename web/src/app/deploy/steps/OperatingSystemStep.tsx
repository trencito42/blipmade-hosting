import { Icon } from '../../../icons';

export interface VpsOsOption {
  id: string;
  name: string;
  version: string;
  family: 'debian' | 'ubuntu' | 'almalinux' | 'alpine' | 'custom';
  description: string;
}

const OS_OPTIONS: VpsOsOption[] = [
  { id: 'debian-12', name: 'Debian', version: '12 (Bookworm)', family: 'debian', description: 'Rock-solid stability, minimal overhead, perfect for servers and production workloads.' },
  { id: 'ubuntu-24-04', name: 'Ubuntu', version: '24.04 LTS (Noble)', family: 'ubuntu', description: 'Modern packages, long-term support, broad hardware and container ecosystem.' },
  { id: 'ubuntu-22-04', name: 'Ubuntu', version: '22.04 LTS (Jammy)', family: 'ubuntu', description: 'Battle-tested LTS release with universal software compatibility.' },
  { id: 'almalinux-9', name: 'AlmaLinux', version: '9', family: 'almalinux', description: '1:1 binary compatible with RHEL. Enterprise Linux for demanding services.' },
  { id: 'alpine-3-20', name: 'Alpine Linux', version: '3.20', family: 'alpine', description: 'Ultra-lightweight, security-oriented, extremely fast boot and low footprint.' },
  { id: 'custom-iso', name: 'Custom ISO', version: 'Installer', family: 'custom', description: 'Boot your own installer ISO via the Proxmox virtual CD-ROM drive.' },
];

interface OperatingSystemStepProps {
  selectedOs: string;
  onSelectOs: (osId: string) => void;
}

export function OperatingSystemStep({ selectedOs, onSelectOs }: OperatingSystemStepProps) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {OS_OPTIONS.map((os) => {
        const selected = os.id === selectedOs;
        return (
          <button
            key={os.id}
            type="button"
            onClick={() => onSelectOs(os.id)}
            aria-pressed={selected}
            className={`grid content-between rounded-[20px] border p-4.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
              selected
                ? 'border-acc bg-acc/10 ring-2 ring-acc shadow-md shadow-acc/5'
                : 'border-line bg-card hover:border-ink/40 hover:bg-card/90'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-display text-[16.5px] font-bold text-ink">{os.name}</span>
                {selected && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-acc text-on-acc">
                    <Icon name="check" size={10} />
                  </span>
                )}
              </div>
              <p className="font-mono text-[12px] text-ink2">{os.version}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink3">{os.description}</p>
            </div>
            <div className="mt-3 pt-3 border-t border-line/40 text-[11px] font-semibold uppercase tracking-wider text-ink3">
              {os.family === 'custom' ? 'Manual install' : 'Cloud-init fast deploy'}
            </div>
          </button>
        );
      })}
    </div>
  );
}

