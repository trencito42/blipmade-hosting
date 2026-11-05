import { useEffect, useState } from 'react';
import { get } from '../../../lib/api';
import { TextInput } from '../../../ui-app';
import { validateMailDomainName } from '../../../lib/mail-domain';
import { Icon } from '../../../icons';

interface DomainConfigurationStepProps {
  mode: 'email' | 'subdomain';
  domain: string;
  onChangeDomain: (domain: string) => void;
  error?: string | null;
}

export function DomainConfigurationStep({
  mode,
  domain,
  onChangeDomain,
  error,
}: DomainConfigurationStepProps) {
  const [subdomainCheck, setSubdomainCheck] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

  const cleanDomain = domain.trim().toLowerCase();
  const mailProblem = mode === 'email' && cleanDomain ? validateMailDomainName(cleanDomain) : null;

  useEffect(() => {
    if (mode !== 'subdomain' || !cleanDomain || cleanDomain.length < 3) {
      setSubdomainCheck(null);
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    const timer = setTimeout(() => {
      get<{ available: boolean; reason: string | null }>('/domains/platform-subdomain', { name: cleanDomain }, controller.signal)
        .then((result) => setSubdomainCheck(result))
        .catch(() => setSubdomainCheck(null))
        .finally(() => setChecking(false));
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cleanDomain, mode]);

  if (mode === 'email') {
    return (
      <div className="grid gap-5">
        <div className="grid gap-2 rounded-2xl border border-line bg-card p-5">
          <TextInput
            label="Your email domain"
            value={domain}
            onChange={(e) => onChangeDomain(e.target.value)}
            placeholder="example.com"
          />
          {mailProblem ? (
            <p className="text-[12.5px] text-bad">{mailProblem}</p>
          ) : error ? (
            <p className="text-[12.5px] text-bad">{error}</p>
          ) : (
            <p className="text-[12.5px] text-ink3">
              You will manage mailboxes (e.g. hello@{cleanDomain || 'yourdomain.com'}) on this domain after setup.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-line/70 bg-s1/50 p-4.5 text-[13px] leading-relaxed text-ink2">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <Icon name="globe" size={15} />
            <span>Automatic Mailcow Provisioning</span>
          </div>
          <p className="mt-1">
            We will configure your mail domain on our high-reputation cluster, generate your DKIM signature key, and provide copy-paste DNS records (MX, SPF, DKIM) for your registrar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 rounded-2xl border border-line bg-card p-5">
        <div>
          <label className="text-[13px] font-medium text-ink">Free platform web & game address</label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="text"
              value={domain}
              onChange={(e) => onChangeDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="my-cool-server"
              className="flex-1 rounded-xl border border-line bg-s1 px-3.5 py-2.5 font-mono text-[14px] text-ink focus:border-acc focus:outline-none focus:ring-1 focus:ring-acc"
            />
            <span className="font-mono text-[14px] text-ink3">.blipmade.com</span>
          </div>
        </div>

        {checking ? (
          <p className="text-[12.5px] text-ink3">Checking availability…</p>
        ) : subdomainCheck ? (
          subdomainCheck.available ? (
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-good">
              <Icon name="check" size={12} />
              <span>{cleanDomain}.blipmade.com is available</span>
            </p>
          ) : (
            <p className="text-[12.5px] text-bad">
              {subdomainCheck.reason ?? 'This address is already taken.'}
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}

