/**
 * The certificates of the addresses the platform serves.
 *
 * A certificate that expires in three days is an outage that is written in
 * the calendar of the machine, and the only thing that can stop it is a
 * renewal that somebody has to look at. The check reads the certificate of
 * every address the platform serves and says how many days are left.
 *
 * The addresses the platform watches.
 *
 * The addresses come from the configuration of the operator, so the check
 * follows what the platform actually serves instead of a list that is written
 * twice. An address that is not written down is left out, and so is an
 * address that cannot be read: the check of the health endpoint is the one
 * that says that the configuration is broken.
 */

export interface CertificateTarget {
  label: string;
  host: string;
  port: number;
  ca?: string;
}

/** A name and the address that carries the certificate. */
export type CertificateSource = readonly [label: string, url: string];

/**
 * The addresses to read a certificate from.
 *
 * An address without a port is read on 443, because that is the port of the
 * addresses the platform serves. The verification of the certificate is never
 * turned off: the certificate is read with the authorities the machine trusts.
 */
export function certificateTargets(sources: readonly CertificateSource[]): CertificateTarget[] {
  const targets: CertificateTarget[] = [];
  for (const [label, url] of sources) {
    if (!url) continue;
    try {
      const parsed = new URL(url);
      targets.push({
        label,
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 443,
      });
    } catch {
      // An address that cannot be parsed is reported by the check of the
      // health endpoint, not here.
    }
  }
  return targets;
}
