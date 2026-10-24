import { OperatorPlaceholder } from '../OperatorPlaceholder';
import { LEGAL_LINKS } from '../links';
import type { LegalDocument } from '../types';

/**
 * The acceptable use policy.
 *
 * The rules are the ones the platform can actually enforce: the resources
 * that are bounded are the ones of the catalogue, the reports go through the
 * ticket system, and the sanction is a suspension the code knows about.
 */
export const AUP: LegalDocument = {
  ...LEGAL_LINKS.aup,
  summary:
    'What may and may not run on a server you buy, how an abuse report is made, and what happens to an account that breaks the rules.',
  updated: '2026-10-24',
  sections: [
    {
      id: 'what-this-covers',
      title: 'What this policy covers',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              This policy applies to every server you run on <OperatorPlaceholder label="TODO(operator): the legal name of the operator" />, and to
              everything you put in it. It is part of the terms of service, and breaking it is a reason to suspend a server or an
              account.
            </>
          ),
        },
        {
          t: 'p',
          text: 'You must be old enough to agree to these terms where you live.',
        },
      ],
    },
    {
      id: 'the-general-rule',
      title: 'The general rule',
      blocks: [
        {
          t: 'p',
          text: 'A server is for the application you deployed, its configuration and its data. It is not a machine for anything else.',
        },
        {
          t: 'p',
          text: 'Give the application the memory it needs and watch the disk. An application that is short of memory is the most common cause of a server that is up but does not answer, and a full disk stops the application.',
        },
      ],
    },
    {
      id: 'what-is-not-allowed',
      title: 'What is not allowed',
      blocks: [
        {
          t: 'p',
          text: 'You may not use a server, or anything you reach through it, to:',
        },
        {
          t: 'list',
          items: [
            <>break the law, or help anybody else break it;</>,
            <>send bulk mail, or mail that was not asked for;</>,
            <>carry malware, or anything that is meant to spy on, to steal from or to damage a system that is not yours;</>,
            <>phish, or send a message that pretends to be somebody else in order to collect a password or a card number;</>,
            <>attack, scan or flood the platform, the panel, the node or the other customers;</>,
            <>use the network of the platform to reach a system you do not own, or to hide where you are coming from;</>,
            <>mine a currency, or run anything that is meant to consume the resources of the node for the benefit of somebody else;</>,
            <>circumvent a limit of the catalogue, a price or a rule of the platform;</>,
            <>resell a server, or give access to it to somebody else, without a written agreement with the operator;</>,
            <>publish or store the content of another person without the right to do it;</>,
            <>use a server to attack a game server or any other system of somebody else.</>,
          ],
        },
        {
          t: 'p',
          text: 'A server that is used for something that has nothing to do with the application you deployed is a breach of this policy, even when the use itself is not forbidden by the list above.',
        },
      ],
    },
    {
      id: 'the-limits',
      title: 'The limits that apply',
      blocks: [
        {
          t: 'p',
          text: 'Every product in the catalogue has a minimum and a maximum of memory, processor and disk. The order form refuses anything outside those values, so a server can never ask for more than the plan allows.',
        },
        {
          t: 'p',
          text: 'The platform does not publish a quota for traffic, for tickets, for accounts or for the number of servers you may run. Nothing here is a limit you can trip over without being told: a limit that exists is shown where you would meet it.',
        },
      ],
    },
    {
      id: 'your-content',
      title: 'Your content',
      blocks: [
        {
          t: 'p',
          text: 'You are responsible for what you put in your server and for what your users do with it. The platform does not read what your application writes there.',
        },
        {
          t: 'p',
          text: 'The platform may remove content that the law requires it to remove, and may hand the information it holds to the authority that asks for it.',
        },
        {
          t: 'p',
          text: 'The platform does not take automatic backups of the data in your server. Take your own copy: the documentation of each product has the commands for it.',
        },
      ],
    },
    {
      id: 'reporting',
      title: 'Reporting an abuse',
      blocks: [
        {
          t: 'p',
          text: 'Open a support ticket from your account and choose the category "Abuse report". A report says what was seen, where it was seen and when. The category is read by the staff and the report is not mixed with the ordinary support requests.',
        },
        {
          t: 'p',
          text: (
            <>
              A report that cannot wait for the ticket system can be sent to{' '}
              <OperatorPlaceholder label="TODO(operator): the email address for abuse reports" />.
            </>
          ),
        },
        {
          t: 'p',
          text: 'The platform keeps what it does with a report in the audit log, so the action that was taken can be read afterwards.',
        },
      ],
    },
    {
      id: 'enforcement',
      title: 'What happens when the policy is broken',
      blocks: [
        {
          t: 'list',
          items: [
            <>A server that breaks the policy can be suspended. It stops running until the situation is put right.</>,
            <>An account that breaks the policy can be suspended. A suspended account cannot sign in, so its servers stop being reachable as well.</>,
            <>In a serious case the account can be closed and the servers removed.</>,
            <>The operator writes to the address on the account and says what was done and why.</>,
          ],
        },
        {
          t: 'p',
          text: 'A refund is not given for a suspension that follows a breach of this policy. The rules about refunds are on their own page.',
        },
      ],
    },
  ],
};
