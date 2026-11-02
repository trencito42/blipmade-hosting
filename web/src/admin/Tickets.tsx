import TicketInbox from './tickets/TicketInbox';

/**
 * The support desk of the back office.
 *
 * The page is the inbox of the tickets: the list takes the whole width of the
 * screen and the conversation has a page of its own,
 * /admin/tickets/:id.
 *
 * The old address of a conversation was `/admin/tickets?ticket=<id>`, and it
 * still opens the same conversation: the inbox reads the query of the page
 * and opens the conversation it names. When the dedicated route is in the
 * table of the routes, the address is replaced with it, so the conversation
 * keeps one address and the history of the browser works with it.
 *
 * The route of the page still points here until the desk is wired to the
 * inbox and to the conversation directly.
 */

export default function Tickets() {
  return <TicketInbox />;
}
