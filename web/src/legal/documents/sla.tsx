import { Link } from '../../router';
import { OperatorPlaceholder } from '../OperatorPlaceholder';
import { LEGAL_LINKS } from '../links';
import type { LegalDocument } from '../types';

/**
 * The service levels and the support.
 *
 * This page is deliberately short on promises. The platform does not publish
 * an availability figure, a response time or a maintenance window, so the
 * page does not have any: it says what the platform does today, and it marks
 * the commitments the operator may want to add.
 */
export const SLA: LegalDocument = {
  ...LEGAL_LINKS.sla,
  summary:
    'What the platform commits to today, and what it does not promise: no availability figure, no response time, no service credit.',
  updated: '2026-10-24',
  sections: [
    {
      id: 'what-this-page-is',
      title: 'What this page is',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              This page describes the service level of <OperatorPlaceholder label="TODO(operator): the legal name of the operator" /> as it
              stands today. It is written for the customer, and everything on it is either something the platform does or something it
              does not promise.
            </>
          ),
        },
        {
          t: 'p',
          text: 'A statement that depends on a decision the operator has not made yet carries the marker of the operator, so nobody reads it as a commitment that was not made.',
        },
      ],
    },
    {
      id: 'no-uptime-promise',
      title: 'There is no availability guarantee',
      blocks: [
        {
          t: 'p',
          text: 'The platform does not publish an availability figure and does not guarantee that the service will be reachable at any given moment. There is no service credit and no compensation for a period of interruption.',
        },
        {
          t: 'p',
          text: (
            <>
              The{' '}
              <Link to="/status" className="font-bold text-acc hover:underline">
                status page
              </Link>{' '}
              shows the state of the components as the platform reports it at that moment. No history of that state is published yet, so
              the page cannot be used to measure an availability over a period.
            </>
          ),
        },
        {
          t: 'p',
          text: (
            <>
              If the operator wants to commit to a figure or to a credit:{' '}
              <OperatorPlaceholder label="TODO(operator): the availability figure and the service credit, if any is to be offered" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'support',
      title: 'Support',
      blocks: [
        {
          t: 'p',
          text: 'Support is given with tickets, from the support page of your account. A ticket can be given the category "Technical", "Billing", "Account" or "Abuse report", and the priority decides the order in which the queue is worked.',
        },
        {
          t: 'p',
          text: (
            <>
              The platform does not publish a response time for a ticket, and it does not promise one. If the operator wants to commit to
              one:{' '}
              <OperatorPlaceholder label="TODO(operator): the response time for a support ticket, if one is to be committed to" />.
            </>
          ),
        },
        {
          t: 'p',
          text: (
            <>
              A question can also be sent to{' '}
              <OperatorPlaceholder label="TODO(operator): the email address for support" />.
            </>
          ),
        },
        {
          t: 'p',
          text: 'The platform does not publish a quota for tickets, for accounts or for the number of servers an account may run. A limit that exists is shown where you would meet it.',
        },
      ],
    },
    {
      id: 'what-the-platform-does',
      title: 'What the platform does commit to',
      blocks: [
        {
          t: 'list',
          items: [
            <>
              A server that was paid for and could not be provisioned is refunded. The money goes back through the payment provider, and
              the event is written in the events of the server.
            </>,
            <>
              The status of an order, of a server and of an invoice is written on the billing page of your account, so you do not have to
              ask to know where a payment or a deployment stands.
            </>,
            <>
              The steps of a deployment are written down, so the page of the server can say where it stopped when something goes wrong.
            </>,
            <>
              You can read the list of your sessions and end the ones you do not recognise, from the settings of your account.
            </>,
            <>
              When a server is cancelled, its data is exported for you and the server is kept for 30 days by default, a term the operator
              can change in the settings.
            </>,
          ],
        },
      ],
    },
    {
      id: 'maintenance',
      title: 'Maintenance',
      blocks: [
        {
          t: 'p',
          text: 'A node of the cluster can be put into maintenance, and the servers on that node can be affected by it. The platform can also restart a node when the machine or the system under it has to be worked on.',
        },
        {
          t: 'p',
          text: (
            <>
              The platform does not publish a maintenance window, and the announcement of one is not a commitment:{' '}
              <OperatorPlaceholder label="TODO(operator): the maintenance window and the notice given before it, if any is to be committed to" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'your-data',
      title: 'Your data',
      blocks: [
        {
          t: 'p',
          text: 'The platform backs up its own database and its configuration, and keeps those copies for 14 days by default. Those backups do not contain the contents of your servers.',
        },
        {
          t: 'p',
          text: 'The data inside your server is your responsibility: the platform does not take automatic backups of it, and it does not promise a time in which lost data can be restored. Take your own copy with the commands on the page of your product.',
        },
      ],
    },
    {
      id: 'if-something-is-wrong',
      title: 'If something is wrong',
      blocks: [
        {
          t: 'p',
          text: 'A server that does not answer is usually a server that is short of memory or that has a full disk. The documentation of each product has a page of troubleshooting for that, and a ticket is the way to bring in a person when the answer is not there.',
        },
        {
          t: 'p',
          text: (
            <>
              The{' '}
              <Link to={LEGAL_LINKS.aup.to} className="font-bold text-acc hover:underline">
                acceptable use policy
              </Link>{' '}
              says what may run on a server, and the{' '}
              <Link to={LEGAL_LINKS.refund.to} className="font-bold text-acc hover:underline">
                refund policy
              </Link>{' '}
              says when the money is given back.
            </>
          ),
        },
      ],
    },
  ],
};
