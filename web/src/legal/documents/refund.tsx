import { Link } from '../../router';
import { OperatorPlaceholder } from '../OperatorPlaceholder';
import { LEGAL_LINKS } from '../links';
import type { LegalDocument } from '../types';

/**
 * The refund policy.
 *
 * The two refunds that the platform gives by itself are the two the code
 * performs: a paid order whose server cannot be provisioned, and a paid
 * change of plan that cannot be applied. Every other refund is a decision of
 * a person, and the term that decides it is marked, because the code does not
 * hold one.
 */
export const REFUND: LegalDocument = {
  ...LEGAL_LINKS.refund,
  summary:
    'When the money is given back, how it is given back, and who decides when it is not automatic.',
  updated: '2026-10-24',
  sections: [
    {
      id: 'scope',
      title: 'What this policy is about',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              This policy applies to the orders you place on <OperatorPlaceholder label="TODO(operator): the legal name of the operator" /> and pay
              for with a card. It is about the money you paid for a server that you did not get, or that you cannot use.
            </>
          ),
        },
        {
          t: 'p',
          text: 'The platform does not take the money itself: it is taken by a card payment provider, and a refund is made by that same provider.',
        },
      ],
    },
    {
      id: 'how-a-refund-is-made',
      title: 'How a refund is made',
      blocks: [
        {
          t: 'list',
          items: [
            <>The money goes back to the card you paid with. The platform cannot send it to another account, another card or another address.</>,
            <>The refund is made by the payment provider, so the card issuer decides how long the money takes to appear on the statement.</>,
            <>The platform never sees the card number. It only asks the provider for a refund against the payment it already knows.</>,
            <>The order and the payment are marked as refunded, and you can see that on the billing page of your account.</>,
          ],
        },
        {
          t: 'p',
          text: (
            <>
              How long the provider takes to give the money back is stated by the provider itself and is not a promise of the platform:{' '}
              <OperatorPlaceholder label="TODO(operator): the expected time for the money to appear, if the operator wants to state one" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'automatic-refunds',
      title: 'The refunds that are automatic',
      blocks: [
        {
          t: 'p',
          text: 'There are two cases where the money is given back without anybody having to ask for it:',
        },
        {
          t: 'list',
          items: [
            <>
              A server that was paid for and could not be provisioned. The deployment failed, the order is marked as refunded and the
              provider is asked to give the money back. The event is written in the events of the server, so you can see it happened.
            </>,
            <>
              A change of plan that was paid for and could not be applied. The change is refunded, and the server keeps the plan it had.
            </>,
          ],
        },
        {
          t: 'p',
          text: 'A refund that the provider itself refuses is flagged, and the operator returns the money by hand instead of the platform keeping a payment for a service that does not exist.',
        },
      ],
    },
    {
      id: 'asked-refunds',
      title: 'The refunds that are decided by a person',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              Outside those two cases, a refund is not automatic. A request is looked at by the operator, and the decision is taken by a
              person:{' '}
              <OperatorPlaceholder label="TODO(operator): the period in which a refund can be asked for" />.
            </>
          ),
        },
        {
          t: 'p',
          text: 'A request is made with a support ticket from your account, with the category "Billing". Please name the order number in the ticket: it is on the billing page.',
        },
        {
          t: 'p',
          text: (
            <>
              What cannot be refunded is decided by the operator:{' '}
              <OperatorPlaceholder label="TODO(operator): the cases in which no refund is given" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'part-of-a-period',
      title: 'A period that is not over',
      blocks: [
        {
          t: 'p',
          text: 'When you change the plan of a server, the provider charges or credits the difference for the rest of the period you have paid for. The credit is applied by the provider on the card you paid with.',
        },
        {
          t: 'p',
          text: 'Cancelling a subscription takes effect at the end of the period you have already paid for, and the server keeps running until then. The period that was paid for is not refunded when the cancellation happens, because the server is running during it.',
        },
      ],
    },
    {
      id: 'chargebacks',
      title: 'If you do not agree',
      blocks: [
        {
          t: 'p',
          text: 'If you think the platform owes you money and the answer you get is not the answer you want, you can ask your card issuer to open a dispute. The platform prefers to settle a question with you directly, and a ticket is the fastest way to do that.',
        },
      ],
    },
    {
      id: 'changes',
      title: 'Changes and contact',
      blocks: [
        {
          t: 'p',
          text: 'This policy can change. The version that applies is the one on this page, and the date under the title says when it was last changed.',
        },
        {
          t: 'p',
          text: (
            <>
              A question about a refund goes to{' '}
              <OperatorPlaceholder label="TODO(operator): the email address for billing questions" />, or to a support ticket with the
              category "Billing". The{' '}
              <Link to={LEGAL_LINKS.terms.to} className="font-bold text-acc hover:underline">
                terms of service
              </Link>{' '}
              say what the platform sells and how the orders work.
            </>
          ),
        },
      ],
    },
  ],
};
