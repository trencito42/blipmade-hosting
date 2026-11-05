# Context menus

One menu for the whole app: the one the File Manager always had, now shared.

* `web/src/context-menu.tsx`: `ContextMenu` (the menu), `useContextMenu` (state of one menu: where, whose, where the focus returns to), `RowMenuButton` (the three dots), `onRecordContextMenu` and `isMenuKey` (the handlers), `keepsNativeMenu` (the cases where the browser keeps its own menu: fields, editable text, a selected text, a link to another site).
* `web/src/lib/menu-actions.tsx`: `useMenuKit()` gives `go` (an entry that opens a page) and `copy` (an entry that copies a value).
* `DataTable` and `CardList` in `web/src/ui-app.tsx` take `rowActions(row)` and `rowLabel(row)`. The provider is called when the menu opens, for the exact row. An empty list gives the browser its menu back.

A page builds its entries from the same handlers and routes its buttons use. The menu has no business logic and no endpoint of its own: a refund opens the refund editor, a delete opens its confirmation, a state change calls the endpoint the conversation page calls. The server still decides.

## Where it is

| Screen | Entries |
|---|---|
| Admin orders | Open order, Open customer, Copy number, Copy ID, Retry delivery (paid, `orders.write`), Refund part, Refund in full (paid or fulfilled, `orders.write`) |
| Admin customers | View, Open orders, View security, Copy ID, Copy e-mail (only after the reveal), Edit profile, Add note, Account action (`customers.write`) |
| Admin ticket inbox | Open conversation, Copy number, Copy link, Open customer, Open service, Claim, Assign or reassign, Unassign, Put on hold, Resolve, Reopen (`tickets.write`) |
| Admin support console | Open conversation, Copy number, Copy link, Open customer |
| Admin services | Open control, Open customer, Copy ID, name, panel ID, Change resources, Retry provisioning (state and `services.write`) |
| Admin servers (VPS) | Open customer, Copy ID, name, address, VM, Start, Restart, Change plan, Adjust resources, Build again, Reinstall, Delete (confirmation) |
| Admin customer record | The same menus for its instances, orders (with refund), tickets and invoices |
| Admin catalogue, promotions, staff, mail plans, mail services, mail domains, abuse reports, nodes | Open, Edit, Copy, and the actions their buttons have |
| App: services, servers, tickets, orders, invoices, backups, databases | Open, sections the access role may see, Copy, Start, Restart, Close ticket (confirmation), Download, Restore |

## Left out on purpose

* Impersonation: it lives in a dialog of the customer page with its own audit flow.
* Force stop, delete of a service, and other one-click destructive actions: the menu only opens the confirmation or does not offer them.
* Priority and escalation of a ticket: there is no endpoint for them.
* Admin domains, DNS and invoices: there is no list or page for the staff.
* The customer's domains page: each domain is a card of live DNS steps, not a row.
* Copying a secret (a password, a token): never.
