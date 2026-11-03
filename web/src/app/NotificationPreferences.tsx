import { PageEditorShell } from './components/premium';
import { NotificationsPanel } from './Settings';

/** The preferences of the notifications. Every switch saves at once, so the page has no save button. */
export default function NotificationPreferences() {
  return (
    <PageEditorShell
      eyebrow="Settings"
      title="Notification preferences"
      description="The groups of the messages, and where they reach you."
      backTo="/app/settings?tab=notifications"
      backLabel="Back to settings"
      actions={null}
    >
      <NotificationsPanel bare />
    </PageEditorShell>
  );
}
