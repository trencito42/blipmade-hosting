/**
 * The email hosting of the dashboard.
 *
 * The page itself lives in `app/mail/`: the overview of the mail and the
 * page of a domain. This file keeps the names the rest of the platform
 * imports, so the storefront of hosted mail and the checkout of a server
 * keep working the way they did.
 */

import type { ReactNode } from 'react';
import type { DnsCheckResult, DnsRecordView, MailAliasView, MailDomainView, MailboxView } from '../lib/api';
import { AliasTable } from './mail/AliasTable';
import { MailDnsPanel } from './mail/MailDnsPanel';
import { MailboxTable } from './mail/MailboxTable';
import MailOverview from './mail/MailOverview';
import { OneTimePasswordBox } from './mail/OneTimePasswordBox';
import type { OneTimePassword } from './mail/shared';

/** The check of the name of a domain lives in a module of its own, so the
 * public storefront does not carry the whole dashboard with it. It is
 * re-exported here because the dashboard and the checkout of a server both
 * use it. */
export { validateMailDomainName } from '../lib/mail-domain';

/** The helpers of the mail area. */
export {
  mailAliasAddress,
  mailPlanOptionLabel,
  onSaleMailPlans,
  runMailDelete,
  validateMailAlias,
  validateMailLocalPart,
  type MailDeleteRequest,
  type OneTimePassword,
} from './mail/shared';

/** The parts of the mail area that other pages of the platform read. */
export { OneTimePasswordBox } from './mail/OneTimePasswordBox';
export { MailDeleteDialog } from './mail/MailDeleteDialog';
export { MailDnsPanel as MailDnsRecords } from './mail/MailDnsPanel';
export {
  MailOwnershipProof,
  MailServiceCancelDialog,
  MailServiceCard,
  runMailServiceCancel,
  type MailServiceCardProps,
} from './mail/MailServiceCard';

/**
 * Everything the customer manages inside one domain: the mailboxes, the
 * aliases and the DNS records.
 *
 * The password the server made is given to this section on its own, so it
 * stays on the screen even when the list of the mailboxes is loaded again.
 */
export function MailDomainSection({
  domain,
  mailboxes,
  aliases,
  records,
  verified,
  dnsResults,
  onRecheckDns,
  checkingDns,
  oneTimePassword,
  onDismissPassword,
  onDeleteMailbox,
  onDeleteAlias,
  children,
}: {
  domain: MailDomainView;
  mailboxes: MailboxView[];
  aliases: MailAliasView[];
  records: DnsRecordView[];
  verified: boolean;
  dnsResults?: DnsCheckResult[];
  onRecheckDns?: () => void;
  checkingDns?: boolean;
  oneTimePassword: OneTimePassword | null;
  onDismissPassword?: () => void;
  onDeleteMailbox?: (mailbox: MailboxView) => void;
  onDeleteAlias?: (alias: MailAliasView) => void;
  /** The forms of the mailbox and of the alias. */
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-6">
      {oneTimePassword && (
        <OneTimePasswordBox
          address={oneTimePassword.address}
          password={oneTimePassword.password}
          onDismiss={onDismissPassword}
        />
      )}

      {children}

      <MailboxTable
        domain={domain}
        mailboxes={mailboxes}
        onDelete={onDeleteMailbox}
        searchable={false}
      />

      <AliasTable domain={domain} aliases={aliases} onDelete={onDeleteAlias} searchable={false} />

      <MailDnsPanel
        records={records}
        verified={verified}
        results={dnsResults}
        onRecheck={onRecheckDns}
        checking={checkingDns}
      />
    </div>
  );
}

/**
 * The overview of the email hosting.
 *
 * The route is wired in routes.tsx, at `/app/mail`. The page of a domain is
 * at `/app/mail/domains/:id`.
 */
export default MailOverview;
