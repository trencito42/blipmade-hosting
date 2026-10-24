import { OperatorPlaceholder } from '../OperatorPlaceholder';
import { LEGAL_LINKS } from '../links';
import type { LegalDocument } from '../types';

/**
 * The terms of service.
 *
 * Every statement in this page is either a fact about the platform that the
 * code makes true, or a value the operator still has to supply. The values
 * that are missing carry the marker of the operator, so nothing on the page
 * is silently wrong.
 *
 * The facts come from the code of the platform: the catalogue and the prices
 * are in the database, the payment is taken by a card provider, the servers
 * are provisioned on a node of the cluster, and the data of an account is
 * listed in the privacy policy.
 */
export const TERMS: LegalDocument = {
  ...LEGAL_LINKS.terms,
  summary:
    'The agreement that governs the use of Blipmade: what the platform sells, what it costs, what you get, and what each of us owes the other.',
  updated: '2026-10-24',
  sections: [
    {
      id: 'who-you-contract-with',
      title: 'Who you are contracting with',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              The platform is operated by <OperatorPlaceholder label="TODO(operator): the legal name of the operator" />,{' '}
              <OperatorPlaceholder label="TODO(operator): the registered address of the operator" />
              {', '}
              <OperatorPlaceholder label="TODO(operator): the company registration number" />
              {', '}
              <OperatorPlaceholder label="TODO(operator): the VAT identifier" />.
            </>
          ),
        },
        {
          t: 'p',
          text: 'These terms are the agreement between you and that operator. Where they say "we", "us" or "our", they mean the operator named above. Where they say "you", they mean the person or the company that opened the account.',
        },
        {
          t: 'p',
          text: (
            <>
              These terms are written in English and that is the only version of them. If a translation exists, the English text is the one that counts. The law that applies is{' '}
              <OperatorPlaceholder label="TODO(operator): the governing law and the jurisdiction of the courts" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'what-blipmade-is',
      title: 'What Blipmade is',
      blocks: [
        {
          t: 'p',
          text: 'Blipmade is a hosting platform. We sell game servers and application servers, we take the orders and the payments, and we provision the servers on a cluster of nodes that runs the containers of our customers.',
        },
        {
          t: 'p',
          text: 'The catalogue is the list of what can be bought. Each product has a price, a minimum and a maximum of memory, processor and disk, and a description of what it is meant for. A product that is listed but not marked as deployable cannot be ordered yet, and the page of that product says so.',
        },
        {
          t: 'p',
          text: 'Everything that runs inside a server you buy is yours. The platform does not put anything of its own inside your server, and it does not read what your application writes there.',
        },
      ],
    },
    {
      id: 'your-account',
      title: 'Your account',
      blocks: [
        {
          t: 'list',
          items: [
            <>
              One account belongs to one person or one company. You need an email address and a password to open it.
            </>,
            <>
              The password itself is never stored. The platform keeps a hash of it, made with scrypt, and compares that hash when you sign in. A person who reads the database cannot read your password from it.
            </>,
            <>
              You are responsible for what happens under your account. Keep the password to yourself, and tell us as soon as you think somebody else has it. You can see every session of your account and end the ones you do not recognise.
            </>,
            <>
              The email address on the account is the address we write to. Keep it working: a confirmation link stops working after a while, and a new one can be asked for.
            </>,
            <>
              You can ask for the account to be closed from the settings of the account. The request is written down and the account is not deleted on the spot: a person looks at it first.
            </>,
          ],
        },
      ],
    },
    {
      id: 'prices-orders-and-payment',
      title: 'Prices, orders and payment',
      blocks: [
        {
          t: 'p',
          text: 'Prices are in euros. The catalogue shows the price of a product for a configuration, and the configuration you order is frozen on the order line, so a later change of the price does not change what you have already ordered.',
        },
        {
          t: 'p',
          text: 'The payment is taken by a card payment provider. Your card number never reaches us: the provider handles it and gives us a payment record, an order reference and, for a subscription, a subscription reference. We keep those references so that a payment can be matched to an order and to an invoice.',
        },
        {
          t: 'p',
          text: 'A subscription renews for the period you bought. You can cancel it from the billing page of your account, and the cancellation takes effect at the end of the period you have already paid for. The server keeps running until then.',
        },
        {
          t: 'p',
          text: 'The prices in the catalogue do not include the taxes that may apply to you. The invoice shows the tax that was charged.',
        },
        {
          t: 'p',
          text: 'A change of the plan of a running server is a new order. The provider charges or credits the difference for the rest of the period you have paid for.',
        },
        {
          t: 'note',
          tone: 'note',
          text: 'The refund rules are on their own page, so they are not buried in these terms.',
        },
      ],
    },
    {
      id: 'what-happens-after-you-pay',
      title: 'What happens after you pay',
      blocks: [
        {
          t: 'p',
          text: 'A paid order becomes a request for a server. The server is provisioned on a node of the cluster: a container is created, the resources you paid for are reserved on that node, and the deployment is checked. The steps of the deployment are written down, so the page of your server can tell you where it stopped if something goes wrong.',
        },
        {
          t: 'p',
          text: 'If the deployment cannot be completed, the money is returned through the provider and the order is marked as refunded. A paid change of plan that cannot be applied is refunded as well.',
        },
        {
          t: 'p',
          text: 'The status of the order, of the server and of the invoice is on the billing page of your account.',
        },
        {
          t: 'p',
          text: 'We can refuse an order, for example when the product is not available, when the payment cannot be completed, or when we have a reason to believe the order is fraudulent. An order that is refused is not charged.',
        },
      ],
    },
    {
      id: 'your-use-of-the-service',
      title: 'Your use of the service',
      blocks: [
        {
          t: 'list',
          items: [
            <>
              You are responsible for what runs in the server you bought: the application, its configuration and its data.
            </>,
            <>
              The platform does not take automatic backups of your data. That is a decision about your data and not about ours: you know what the data is and how it should be restored. Take your own copy with the commands on the page of your product.
            </>,
            <>
              You keep the rights to everything you put in your server. You give us the right to store it, to run it and to move it as part of running the service for you.
            </>,
            <>
              The limits of your server are the limits of the product you bought: a minimum and a maximum of memory, processor and disk. The order form refuses anything outside them.
            </>,
          ],
        },
        {
          t: 'p',
          text: 'The rules about what may and may not run on a server are in the acceptable use policy, which is part of these terms.',
        },
      ],
    },
    {
      id: 'suspension-and-termination',
      title: 'Suspension, cancellation and closing the account',
      blocks: [
        {
          t: 'p',
          text: 'We can suspend a server or an account when the acceptable use policy is broken, when an invoice is not paid, or when we have to, for example to protect the platform or the other customers. A suspended account cannot sign in.',
        },
        {
          t: 'p',
          text: 'You can stop a server yourself. Stopping it does not stop the billing: it keeps its resources on the node and its subscription keeps running until you cancel it.',
        },
        {
          t: 'p',
          text: 'When a server is cancelled, the data it holds is exported for you and the server is kept for 30 days by default, a term the operator can change in the settings of the platform. It is removed when the operator has allowed the sweep that removes the cancelled servers to run.',
        },
        {
          t: 'p',
          text: 'We keep the invoices, the orders and the audit log for as long as the law requires us to keep them. The privacy policy says what is kept and for how long.',
        },
      ],
    },
    {
      id: 'intellectual-property',
      title: 'Intellectual property',
      blocks: [
        {
          t: 'p',
          text: 'The platform, the catalogue, the interface and the name are ours. We do not claim anything over the application you deploy, over your data, or over the content you put in your server.',
        },
        {
          t: 'p',
          text: 'The name and the marks of the products in the catalogue belong to the people who own them, not to us. Listing a product does not give you any right over it.',
        },
      ],
    },
    {
      id: 'disclaimer',
      title: 'What we do not promise',
      blocks: [
        {
          t: 'p',
          text: 'The service is provided as it is. We do not promise that it will never be interrupted, and there is no availability guarantee in these terms. The status page shows the state of the components as the platform reports it at that moment; no history of that state is published.',
        },
        {
          t: 'p',
          text: 'We do not promise that the service is fit for a particular purpose. You choose the product and the configuration, and the documentation of a product says what it is meant for.',
        },
        {
          t: 'p',
          text: 'We may change the catalogue, the prices and the products. A product that is withdrawn from the catalogue does not stop the servers you have already bought.',
        },
      ],
    },
    {
      id: 'liability',
      title: 'Liability',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              <OperatorPlaceholder label="TODO(operator): the cap of our liability (the amount and the period it is limited to), and the claims that are excluded from it" />.
            </>
          ),
        },
        {
          t: 'p',
          text: 'Nothing in these terms takes away a liability that the law that applies does not allow us to take away.',
        },
        {
          t: 'p',
          text: (
            <>
              <OperatorPlaceholder label="TODO(operator): whether the operator indemnifies the customer, and against what" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'changes',
      title: 'Changes to these terms',
      blocks: [
        {
          t: 'p',
          text: 'These terms can change. The version that applies is the one on this page at the moment you place an order or at the moment you use the service. The date under the title says when the text was last changed.',
        },
        {
          t: 'p',
          text: 'If a change is important enough to change what you pay for, the platform writes to the address on your account before it takes effect.',
        },
      ],
    },
    {
      id: 'contact',
      title: 'How to reach us',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              The fastest way to reach us is a support ticket from the support page of your account. For anything that concerns these terms you can also write to{' '}
              <OperatorPlaceholder label="TODO(operator): the email address for legal and support questions" />.
            </>
          ),
        },
        {
          t: 'p',
          text: (
            <>
              A written notice can be sent to <OperatorPlaceholder label="TODO(operator): the postal address for notices" />.
            </>
          ),
        },
      ],
    },
  ],
};
