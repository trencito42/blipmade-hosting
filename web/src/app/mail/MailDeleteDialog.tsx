/**
 * The confirmation of a delete in the mail area.
 *
 * Nothing is deleted without it, and it says plainly that the action cannot
 * be undone.
 */

import { ConfirmDialog } from '../../ui-app';
import type { MailDeleteRequest } from './shared';

export function MailDeleteDialog({
  request,
  busy,
  onCancel,
  onConfirm,
}: {
  request: MailDeleteRequest | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!request) return null;

  if (request.kind === 'domain') {
    return (
      <ConfirmDialog
        open
        title="Delete this email domain?"
        description={`${request.domain.name} stops receiving mail as soon as it is deleted, together with its ${request.domain.mailboxes} mailboxes and its ${request.domain.aliases} aliases. This cannot be undone.`}
        confirmLabel="Delete domain"
        requireText={request.domain.name}
        busy={busy}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  }

  if (request.kind === 'mailbox') {
    return (
      <ConfirmDialog
        open
        title="Delete this mailbox?"
        description={`${request.mailbox.address} stops receiving mail as soon as it is deleted. The mail it holds is deleted with it. This cannot be undone.`}
        confirmLabel="Delete mailbox"
        busy={busy}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <ConfirmDialog
      open
      title="Delete this alias?"
      description={`${request.alias.alias} stops forwarding mail to ${request.alias.target} as soon as it is deleted. This cannot be undone.`}
      confirmLabel="Delete alias"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
