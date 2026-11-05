import { useMemo } from 'react';
import type { IconName } from '../icons';
import type { MenuItem } from '../context-menu';
import { useRouter } from '../router';
import { useToast } from '../ui-app';

type Extra = Partial<Pick<MenuItem, 'danger' | 'disabled' | 'reason' | 'separated' | 'hint'>>;

/**
 * The two kinds of entry nearly every menu is made of: a way to another page and a copy to the clipboard. A page builds
 * the rest from the same handlers its buttons call, so the menu never has logic of its own.
 */
export function useMenuKit() {
  const { navigate } = useRouter();
  const toast = useToast();
  return useMemo(
    () => ({
      /** An entry that opens another page of the app. */
      go: (key: string, label: string, icon: IconName, to: string, extra: Extra = {}): MenuItem => ({
        key,
        label,
        icon,
        ...extra,
        onSelect: () => navigate(to),
      }),
      /** An entry that copies a value. The toast tells what was copied, or that it failed. */
      copy: (key: string, what: string, value: string, extra: Extra = {}): MenuItem => ({
        key,
        label: `Copy ${what}`,
        icon: 'copy',
        ...extra,
        onSelect: () => {
          void navigator.clipboard.writeText(value).then(
            () => toast.push(`${what[0]!.toUpperCase()}${what.slice(1)} copied.`, 'ok'),
            () => toast.push('Copy failed. Select the text and copy it by hand.', 'error'),
          );
        },
      }),
      navigate,
      toast,
    }),
    [navigate, toast],
  );
}
