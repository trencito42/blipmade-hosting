import { useState } from 'react';
import { ApiError, get } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams } from '../router';
import { EmptyState, ErrorState, LoadingBlock, useToast } from '../ui-app';
import { PageEditorShell } from '../app/components/premium';
import { can, useAdminSession } from './Overview';
import {
  NotificationTemplatePreviewPanel, NotificationTestSendPanel, notificationPayload, runNotificationTemplatePreview,
  runNotificationTemplateValidate, runNotificationTestSend,
  type NotificationPreview, type NotificationTemplate, type NotificationTestSendResult,
} from './EmailNotifications';

const BACK_TO = '/admin/notifications';

function useTemplates() {
  return useAsync((signal) => get<{ templates: NotificationTemplate[] }>('/admin/notifications/templates', undefined, signal), []);
}

/** What one template says with the values the operator gives it. A preview sends nothing. */
export function NotificationTemplatePreview() {
  const { id = '' } = useParams();
  const mayWrite = can(useAdminSession().staff, 'infrastructure.write');
  const list = useTemplates();
  const template = list.data?.templates.find((entry) => entry.id === id) ?? null;
  const [values, setValues] = useState('');
  const [result, setResult] = useState<NotificationPreview | null>(null);
  const preview = useAction(async () => {
    const parsed = notificationPayload(values);
    if (!parsed.ok) throw new ApiError(0, 'invalid_payload', parsed.error);
    const rendered = await runNotificationTemplatePreview(id, parsed.payload);
    const missing = rendered.missing.length ? rendered.missing : await runNotificationTemplateValidate(id, parsed.payload);
    const next = { ...rendered, missing };
    setResult(next);
    return next;
  });
  return (
    <PageEditorShell eyebrow="Notifications" title={template ? `Preview: ${template.id}` : 'Template preview'} description="A preview shows what a template says and sends nothing." backTo={BACK_TO} backLabel="Back to notifications" actions={null}>
      {list.loading && !list.data ? <LoadingBlock rows={3} label="Loading the template" />
        : list.error ? <ErrorState title="The templates could not be loaded" message={list.error.message} onRetry={list.reload} />
        : !template ? <EmptyState title="Template not found." description="It is not in the catalogue." />
        : (
          <NotificationTemplatePreviewPanel template={template} values={values} onValuesChange={setValues} onPreview={() => void preview.run()} preview={result} busy={preview.pending} error={preview.error} mayPreview={mayWrite} />
        )}
    </PageEditorShell>
  );
}

/** A test message to one address from one template. */
export function NotificationTestSend() {
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'infrastructure.write');
  const list = useTemplates();
  const [to, setTo] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState('');
  const [sent, setSent] = useState<NotificationTestSendResult | null>(null);
  const send = useAction(async () => {
    const parsed = notificationPayload(values);
    if (!parsed.ok) throw new ApiError(0, 'invalid_payload', parsed.error);
    const result = await runNotificationTestSend({ to, templateId, payload: parsed.payload });
    setSent(result);
    toast.push('The test message was given to the server.', 'ok');
    return result;
  });
  return (
    <PageEditorShell eyebrow="Notifications" title="Send a test message" description="One address, one template. Nothing goes to a customer." backTo={BACK_TO} backLabel="Back to notifications" actions={null}>
      {list.loading && !list.data ? <LoadingBlock rows={3} label="Loading the templates" />
        : list.error ? <ErrorState title="The templates could not be loaded" message={list.error.message} onRetry={list.reload} />
        : (
          <NotificationTestSendPanel templates={list.data?.templates ?? []} to={to} onToChange={setTo} templateId={templateId} onTemplateIdChange={setTemplateId} values={values} onValuesChange={setValues} onSend={() => void send.run()} busy={send.pending} error={send.error} sent={sent} maySend={mayWrite} />
        )}
    </PageEditorShell>
  );
}
