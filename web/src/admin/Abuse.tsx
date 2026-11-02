import AbuseInbox from './abuse/AbuseInbox';

/**
 * The reports of abuse in the back office.
 *
 * The page itself lives in `admin/abuse/AbuseInbox.tsx`, next to the page of
 * one report. This file keeps the old address of the page working: the route
 * of the area still points at it until the queue and the case each have their
 * own route.
 */
export default function Abuse() {
  return <AbuseInbox />;
}
