import { useCallback, useEffect, useState } from 'react';
import {
  del,
  formatMoment,
  get,
  post,
  relativeTime,
  type NotificationCategoryView,
  type NotificationListResponse,
  type NotificationView,
} from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { cn } from '../lib';
import {
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  Select,
  SoftButton,
  StatTile,
  useToast,
} from '../ui-app';

/**
 * The notification centre of the customer.
 *
 * Everything the page shows comes from the server: the list of the messages,
 * the number of the unread ones and the groups of the messages. Nothing is
 * kept in the storage of the browser, so two sessions of the same account
 * always show the same thing.
 *
 * The server builds the list from the session of the customer, so a message
 * of another customer is never even fetched: the interface does not have to
 * hide anything, because there is nothing of another customer to see.
 */

/** How many messages the list holds before the cursor asks for more. */
const PAGE_SIZE = 20;

/** The message of a failure, in the words of the server. */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * The name of a group of messages.
 *
 * The server sends the name of every group it knows. A group it does not
 * know is written out in words, so the page never shows a key.
 */
export function categoryLabel(categories: NotificationCategoryView[], key: string): string {
  const found = categories.find((category) => category.key === key);
  if (found) return found.label;
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Where the action of a message leads.
 *
 * A link inside the platform keeps the router of the application, a link
 * outside of it is a plain address.
 */
function actionTarget(url: string): { to?: string; href?: string } {
  return /^https?:\/\//i.test(url) ? { href: url } : { to: url };
}

export default function Notifications() {
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [pending, setPending] = useState<NotificationView | null>(null);
  const [nonce, setNonce] = useState(0);

  // The groups of the messages come with the preferences of the account.
  const groups = useAsync(
    (signal) => get<{ categories: NotificationCategoryView[] }>('/notifications/preferences', undefined, signal),
    [],
  );
  const categories = groups.data?.categories ?? [];

  /**
   * The number of the messages that wait to be read.
   *
   * It is read again after every action of the customer, and now and then
   * on its own, so the number on the screen is the number of the server.
   */
  const refreshCount = useCallback(async () => {
    try {
      const result = await get<{ unread: number }>('/notifications/unread-count');
      setUnread(result.unread);
    } catch {
      // The server cannot be reached: the number on the screen stays the
      // last one the server gave.
    }
  }, []);

  // The list is read again whenever the filter changes. The cursor walks the
  // list, so a customer with thousands of messages never loads thousands of
  // messages at once.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    get<NotificationListResponse>(
      '/notifications',
      {
        category: category || undefined,
        unread: unreadOnly ? 'true' : undefined,
        limit: PAGE_SIZE,
      },
      controller.signal,
    )
      .then((result) => {
        if (!active) return;
        setItems(result.notifications);
        setNextCursor(result.nextCursor);
        setUnread(result.unread);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(messageOf(err, 'Your notifications could not be loaded.'));
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [category, unreadOnly, nonce]);

  // The number is kept fresh on its own, so a message that is read on
  // another device shows up here too.
  useEffect(() => {
    const timer = window.setInterval(() => void refreshCount(), 60000);
    return () => window.clearInterval(timer);
  }, [refreshCount]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await get<NotificationListResponse>('/notifications', {
        category: category || undefined,
        unread: unreadOnly ? 'true' : undefined,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setItems((current) => [...current, ...result.notifications]);
      setNextCursor(result.nextCursor);
    } catch (err: unknown) {
      // The list that is on the screen stays: only the next page is lost.
      setMoreError(messageOf(err, 'The next page could not be loaded.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = useAction(async (id: string) => {
    await post<{ ok: true }>(`/notifications/${encodeURIComponent(id)}/read`);
    return id;
  });

  const markAllRead = useAction(async () => {
    const result = await post<{ ok: true; updated: number }>('/notifications/read-all');
    return result.updated;
  });

  const removeNotification = useAction(async (id: string) => {
    await del<{ ok: true }>(`/notifications/${encodeURIComponent(id)}`);
    return id;
  });

  const onMarkRead = async (notification: NotificationView) => {
    const id = await markRead.run(notification.id);
    if (!id) return;
    const moment = new Date().toISOString();
    setItems((current) => current.map((item) => (item.id === id ? { ...item, readAt: moment } : item)));
    toast.push('The notification is marked as read', 'ok');
    void refreshCount();
  };

  const onMarkAllRead = async () => {
    const updated = await markAllRead.run();
    if (updated === undefined) return;
    const moment = new Date().toISOString();
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: moment })));
    toast.push(`${updated} notification${updated === 1 ? '' : 's'} marked as read.`, 'ok');
    void refreshCount();
  };

  const onConfirmDelete = async () => {
    const target = pending;
    if (!target) return;
    const id = await removeNotification.run(target.id);
    setPending(null);
    if (!id) return;
    setItems((current) => current.filter((item) => item.id !== id));
    toast.push('The notification was deleted', 'ok');
    void refreshCount();
  };

  const filtered = Boolean(category) || unreadOnly;

  return (
    <div className="grid gap-4">
      <Panel
        title="Notifications"
        description="Everything the platform tells you about your account, newest first."
        action={
          /* The number of the messages that wait to be read is in the
             header of the page, and it is the number of the server. */
          <div className="grid gap-2 sm:min-w-[220px]">
            <div role="status">
              <StatTile
                label="Unread"
                value={unread}
                hint={unread === 0 ? 'Everything has been read.' : 'Waiting to be read.'}
              />
            </div>
            <SoftButton onClick={onMarkAllRead} disabled={markAllRead.pending || unread === 0}>
              {markAllRead.pending ? 'Working…' : 'Mark all as read'}
            </SoftButton>
          </div>
        }
        actionBelow
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Select
              id="notification-category"
              label="Category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All the groups</option>
              {categories.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </Select>

            <label className="flex min-h-14 items-center gap-3 rounded-full bg-s2 px-5">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.target.checked)}
                className="size-6 shrink-0 accent-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              />
              <span className="text-[14.5px] font-medium text-ink">Only the unread</span>
            </label>
          </div>

          {loading ? (
            <LoadingBlock rows={3} label="Loading your notifications" />
          ) : error ? (
            <ErrorState
              title="Your notifications could not be loaded"
              message={error}
              onRetry={() => setNonce((value) => value + 1)}
            />
          ) : (
            <NotificationList
              notifications={items}
              categories={categories}
              filtered={filtered}
              onMarkRead={onMarkRead}
              onDelete={setPending}
            />
          )}

          {nextCursor && !loading && !error && (
            <div className="grid justify-items-center gap-2">
              <SoftButton onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </SoftButton>
              {moreError && (
                <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
                  {moreError}
                </p>
              )}
            </div>
          )}

          {markRead.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
              {markRead.error}
            </p>
          )}
          {markAllRead.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
              {markAllRead.error}
            </p>
          )}
          {removeNotification.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
              {removeNotification.error}
            </p>
          )}
        </div>
      </Panel>

      <ConfirmDialog
        open={Boolean(pending)}
        title="Delete this notification?"
        description={
          pending
            ? `“${pending.title}” is removed from your account. It cannot be undone.`
            : undefined
        }
        confirmLabel="Delete it"
        busy={removeNotification.pending}
        onCancel={() => setPending(null)}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}

/**
 * The list of the messages.
 *
 * Two empty states: a customer without any message and a customer whose
 * filter shows nothing. They are not the same thing, so they are not written
 * the same way.
 */
export function NotificationList({
  notifications,
  categories,
  filtered,
  onMarkRead,
  onDelete,
}: {
  notifications: NotificationView[];
  categories: NotificationCategoryView[];
  /** True when a filter hides part of the list. */
  filtered: boolean;
  onMarkRead?: (notification: NotificationView) => void;
  onDelete?: (notification: NotificationView) => void;
}) {
  if (!notifications.length) {
    return filtered ? (
      <EmptyState
        title="No notification in this group."
        description="Nothing matches the filter. Choose another group, or show the messages that are already read."
      />
    ) : (
      <EmptyState
        title="You have no notification yet."
        description="The messages of the platform will show up here: the state of your services, your invoices and the answers of the support."
      />
    );
  }

  return (
    <ul className="grid gap-2">
      {notifications.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          label={categoryLabel(categories, notification.category)}
          onMarkRead={onMarkRead}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

/**
 * One message of the list.
 *
 * A message that was not read yet is drawn apart: another surface and a
 * mark that says so. The colour alone is not the sign, the words are there
 * too.
 */
export function NotificationRow({
  notification,
  label,
  onMarkRead,
  onDelete,
}: {
  notification: NotificationView;
  /** The name of the group of the message. */
  label: string;
  onMarkRead?: (notification: NotificationView) => void;
  onDelete?: (notification: NotificationView) => void;
}) {
  const unread = !notification.readAt;

  return (
    <li
      data-unread={unread ? 'true' : 'false'}
      className={cn(
        'grid gap-2 rounded-2xl p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start',
        unread ? 'bg-acc-bg' : 'bg-s2',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-[15.5px] font-bold tracking-[-0.02em]', unread ? 'text-ink' : 'text-ink2')}>
            {notification.title}
          </p>
          {unread ? (
            <span className="rounded-full bg-acc/12 px-2.5 py-1 text-[12px] font-bold text-acc">Unread</span>
          ) : null}
        </div>

        <p className="mt-1 text-[13.5px] leading-relaxed text-ink2">{notification.body}</p>

        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink3">
          <span>{label}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={notification.createdAt} title={formatMoment(notification.createdAt)}>
            {relativeTime(notification.createdAt)}
          </time>
        </p>

        {notification.actionUrl ? (
          <div className="mt-2">
            <ButtonLink variant="soft" {...actionTarget(notification.actionUrl)}>
              {notification.actionLabel ?? 'Open'}
            </ButtonLink>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 sm:justify-end">
        {unread && onMarkRead ? (
          <SoftButton onClick={() => onMarkRead(notification)} aria-label={`Mark as read: ${notification.title}`}>
            Mark as read
          </SoftButton>
        ) : null}
        {onDelete ? (
          <SoftButton onClick={() => onDelete(notification)} aria-label={`Delete the notification: ${notification.title}`}>
            Delete
          </SoftButton>
        ) : null}
      </div>
    </li>
  );
}
