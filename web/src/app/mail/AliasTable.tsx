/**
 * The aliases of a domain.
 *
 * An alias is another address that reaches one of the mailboxes. The API of
 * the platform creates an alias and deletes one: it does not change the
 * mailbox an alias goes to, so the table offers no edit.
 */

import { useMemo, useState } from 'react';
import { Icon } from '../../icons';
import type { MailAliasView, MailDomainView } from '../../lib/api';
import { CardList, DataTable, DangerButton, EmptyState, PrimaryButton, TextInput } from '../../ui-app';

export function AliasTable({
  domain,
  aliases,
  onCreate,
  onDelete,
  busy,
  searchable = true,
}: {
  domain: MailDomainView;
  aliases: MailAliasView[];
  /** Asks for the dialog of a new alias. Without it, no button is shown. */
  onCreate?: () => void;
  /** The customer asked to delete an alias: the dialog confirms it. */
  onDelete?: (alias: MailAliasView) => void;
  /** True while an action of the table is running. */
  busy?: boolean;
  /** The list of a short domain is not searched. */
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');

  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return aliases;
    return aliases.filter(
      (alias) => alias.alias.toLowerCase().includes(needle) || alias.target.toLowerCase().includes(needle),
    );
  }, [aliases, query]);

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">
          Aliases · {domain.aliases} of {domain.maxAliases}
        </p>
        {onCreate && (
          <PrimaryButton onClick={onCreate} disabled={busy} className="h-9 px-3.5">
            <Icon name="plus" size={13} />
            Create alias
          </PrimaryButton>
        )}
      </div>

      {searchable && aliases.length > 3 && (
        <TextInput
          label="Search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by alias or by mailbox"
          autoComplete="off"
        />
      )}

      {aliases.length === 0 ? (
        <EmptyState
          title="No alias yet"
          description="An alias is another address that reaches one of your mailboxes."
        />
      ) : found.length === 0 ? (
        <p className="rounded-2xl bg-s2 px-3.5 py-3 text-[13.5px] text-ink2">
          No alias of this domain carries “{query.trim()}”.
        </p>
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'alias',
                header: 'Alias',
                truncate: true,
                render: (alias: MailAliasView) => (
                  <span className="font-bold text-ink" title={alias.alias}>
                    {alias.alias}
                  </span>
                ),
              },
              {
                key: 'target',
                header: 'Goes to',
                truncate: true,
                render: (alias: MailAliasView) => (
                  <span className="text-[13.5px] text-ink2" title={alias.target}>
                    {alias.target}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                srOnlyHeader: true,
                align: 'right',
                render: (alias: MailAliasView) =>
                  onDelete ? (
                    <DangerButton onClick={() => onDelete(alias)} disabled={busy} className="h-9 px-3">
                      Delete
                    </DangerButton>
                  ) : null,
              },
            ]}
            rows={found}
            rowKey={(alias: MailAliasView) => alias.id}
            minWidth="520px"
          />
          <CardList rows={found} rowKey={(alias: MailAliasView) => alias.id}>
            {(alias: MailAliasView) => (
              <div className="grid gap-2">
                <span className="min-w-0 break-all font-bold text-ink">{alias.alias}</span>
                <span className="min-w-0 break-all text-[13.5px] text-ink2">Goes to {alias.target}</span>
                {onDelete && (
                  <div>
                    <DangerButton onClick={() => onDelete(alias)} disabled={busy} className="h-9 px-3">
                      Delete
                    </DangerButton>
                  </div>
                )}
              </div>
            )}
          </CardList>
        </>
      )}
    </section>
  );
}
