import { Link } from '../../router';
import { OperatorPlaceholder } from '../OperatorPlaceholder';
import { LEGAL_LINKS } from '../links';
import type { LegalDocument } from '../types';

/**
 * The privacy policy.
 *
 * The list of the data is the list of the tables of the database. Every item
 * below was read from the schema of the platform, so the page says what is
 * really stored and not what a policy usually says.
 *
 * The values the operator has to supply are marked. The data that is written
 * down in the database is written down in plain words, including the parts
 * that are not flattering: the messages are recorded, the audit log records
 * who did what, and the body of a mail is not kept in the database.
 */
export const PRIVACY: LegalDocument = {
  ...LEGAL_LINKS.privacy,
  summary:
    'What the platform stores about you, why it stores it, who else sees it, and what you can ask for.',
  updated: '2026-10-24',
  sections: [
    {
      id: 'who-is-responsible',
      title: 'Who is responsible for your data',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              The operator of the platform is <OperatorPlaceholder label="TODO(operator): the legal name of the operator" />,{' '}
              <OperatorPlaceholder label="TODO(operator): the registered address of the operator" />. It is the one that
              decides why the data below is collected and what it is used for.
            </>
          ),
        },
        {
          t: 'p',
          text: (
            <>
              Questions about your data go to{' '}
              <OperatorPlaceholder label="TODO(operator): the email address for data questions" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'what-we-store',
      title: 'What the platform stores',
      blocks: [
        {
          t: 'p',
          text: 'The platform stores the data below, and nothing else that it can be blamed for. The lists follow the records of the database.',
        },
        {
          t: 'p',
          text: 'The account:',
        },
        {
          t: 'list',
          items: [
            <>Your email address, your first name and your last name.</>,
            <>A hash of your password, made with scrypt. The password itself is never stored.</>,
            <>The role of the account, whether the address is confirmed, and the moment the account was created and last changed.</>,
            <>The reference to the account you have on the hosting panel, so the platform can act on your servers.</>,
            <>Whether the account is suspended, and whether you have asked for it to be closed.</>,
          ],
        },
        {
          t: 'p',
          text: 'Your orders, invoices and payments:',
        },
        {
          t: 'list',
          items: [
            <>The number of the order, its status, whether it is a new order or a change of plan, the total, the currency and the discount.</>,
            <>The lines of the order: the product, the quantity, the unit price and the configuration you ordered, frozen on the line so a later price change does not change it.</>,
            <>The references the card payment provider gives us for the checkout, the payment, the subscription and the invoice, so a payment can be matched to an order.</>,
            <>The invoices: the number, the amount, the tax, the total, the status, the period they cover and the link to the invoice on the provider.</>,
            <>The payments: the amount, the currency, the status and, when a payment fails, the message the provider gave.</>,
            <>The subscriptions: the status, the amount, the period that is paid for, the date the period ends and the fact that you asked to cancel at the end of it.</>,
            <>The promotions you used, and the amount each of them took off.</>,
          ],
        },
        {
          t: 'p',
          text: 'Your sessions:',
        },
        {
          t: 'list',
          items: [
            <>A hash of the session token. The token itself is only ever in the cookie of your browser.</>,
            <>The moment the session was opened, the moment it expires, and the moment it was last used.</>,
            <>The address the session came from and the browser it named, so you can recognise your own devices and end the ones you do not know.</>,
          ],
        },
        {
          t: 'p',
          text: 'The mail:',
        },
        {
          t: 'list',
          items: [
            <>
              For every message the platform sends, it records what the message was about, the address it was sent to, the way it was sent, whether it was delivered, how many times it was tried, the class of an error when it failed and the moments of all of that. The body of the message is not stored in the database.
            </>,
            <>
              While a message is on its way, it passes through the internal queue of the platform, which carries the body of the message.
            </>,
            <>
              When no mail relay is configured, the message is written to a file on the disk of the server instead of being sent, and any sign-in link in it is removed before it is written, so that the file cannot be used to sign in.
            </>,
          ],
        },
        {
          t: 'p',
          text: 'Your support:',
        },
        {
          t: 'list',
          items: [
            <>The tickets you open: the subject, the category, the priority, the status and the messages of the conversation.</>,
            <>The files you attach to a ticket.</>,
            <>The notes the staff add to a ticket. They are marked as internal and are never shown to you.</>,
          ],
        },
        {
          t: 'p',
          text: 'Your servers:',
        },
        {
          t: 'list',
          items: [
            <>The name of the server, its status, the memory, the processor and the disk it was given, and what it costs.</>,
            <>The references to the container and to the address on the node, so the platform can find the server again.</>,
            <>The events of the server: what happened, when, and the steps of the deployment.</>,
            <>The domains you claim, the port they point at and the proof of ownership you publish for them.</>,
          ],
        },
        {
          t: 'p',
          text: 'The audit log:',
        },
        {
          t: 'list',
          items: [
            <>
              Every action taken on the platform is written down, and in particular the actions of the staff: who acted, what the action was, which record it touched, the address the action came from and the moment it happened. The log is append-only and is meant to be read.
            </>,
          ],
        },
        {
          t: 'p',
          text: 'And the smaller things:',
        },
        {
          t: 'list',
          items: [
            <>The preferences that say what you want to hear about: product news, billing, support, incidents and marketing.</>,
            <>
              The client key the platform holds for you on the hosting panel. It is encrypted, it is scoped to your account alone, and it never reaches your browser.
            </>,
            <>
              The addresses that asked for a change of email address, and the hash of the token that was sent to them. The token itself is never stored.
            </>,
          ],
        },
      ],
    },
    {
      id: 'the-data-in-your-server',
      title: 'The data inside your server',
      blocks: [
        {
          t: 'p',
          text: 'The contents of your server, the files you put in it, the data your application writes and the database it uses, live on the node. They are not in the database of the platform, and they are not in the backups of the platform.',
        },
        {
          t: 'p',
          text: 'The platform keeps the client key that lets it act on your server for you: to start it, to stop it, to read the files and to open the console. That key is scoped to your account and it is used only for the operations you ask for.',
        },
        {
          t: 'p',
          text: 'The platform does not read what your application writes in your server, and it does not put anything of its own in it.',
        },
      ],
    },
    {
      id: 'why',
      title: 'Why the data is collected',
      blocks: [
        {
          t: 'p',
          text: 'The data is collected to run the service you have bought: to open your account, to take the payment, to provision your server, to give you the invoice, to answer you when you write to us, to keep the platform safe, and to keep the record of what was done on it.',
        },
        {
          t: 'p',
          text: (
            <>
              The legal basis that is used for each of these purposes depends on the law that applies to you and to us:{' '}
              <OperatorPlaceholder label="TODO(operator): the legal basis for each purpose (contract, legitimate interest, consent)" />.
            </>
          ),
        },
        {
          t: 'note',
          tone: 'note',
          text: 'The platform does not sell your data, and it does not use it for advertising. There is no advertising cookie and no analytics cookie: see the cookie policy.',
        },
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              The platform sets two cookies: the one that keeps you signed in and the one that protects the forms against a request that comes from another site. Both are described in the{' '}
              <Link to={LEGAL_LINKS.cookies.to} className="font-bold text-acc hover:underline">
                cookie policy
              </Link>
              .
            </>
          ),
        },
      ],
    },
    {
      id: 'who-sees-it',
      title: 'Who else sees the data',
      blocks: [
        {
          t: 'p',
          text: 'Three other parties see part of the data, because they cannot do their part of the work without it:',
        },
        {
          t: 'list',
          items: [
            <>The card payment provider. It handles the payment and the card details, and it gives us the references that let us match a payment to an order. It never sees the contents of your server.</>,
            <>The hosting panel (Pterodactyl) and the node that runs your server (Wings). They hold the contents of your server and the resources it uses. The panel is asked for them with a key that is scoped to your account.</>,
            <>The mail relay, when one is configured. It carries the messages of the platform, such as the confirmation of your address or the reset of your password.</>,
          ],
        },
        {
          t: 'p',
          text: (
            <>
              <OperatorPlaceholder label="TODO(operator): any other recipient or subprocessor the operator appoints" />.
            </>
          ),
        },
        {
          t: 'p',
          text: 'The staff of the platform see the data of an account when they have to work on it. The actions they take are written down in the audit log.',
        },
      ],
    },
    {
      id: 'how-long',
      title: 'How long the data is kept',
      blocks: [
        {
          t: 'list',
          items: [
            <>A session lasts 14 days and is removed when it ends. A session that is ended by you or by the platform is removed at once.</>,
            <>The address of a cancelled server is exported for you, and the server is kept for 30 days by default, a term the operator can change in the settings, before it is deleted.</>,
            <>The mail that was sent is recorded as a line with its state. The file that stands in for a relay is removed by the operator.</>,
            <>The backups of the platform, which are the database and the configuration and never the contents of your servers, are kept for 14 days by default.</>,
          ],
        },
        {
          t: 'p',
          text: (
            <>
              <OperatorPlaceholder label="TODO(operator): how long the orders, the invoices and the audit log are kept" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'your-rights',
      title: 'Your rights',
      blocks: [
        {
          t: 'p',
          text: 'You can ask for a copy of the data the platform holds about you, for it to be corrected, for the processing to be stopped, for the data to be deleted where the law allows it, for the data to be given to you in a portable form, and for you to object to a use of it that is not based on the contract.',
        },
        {
          t: 'p',
          text: 'You can close your account yourself from the settings of the account, and you can read and end your sessions there. You can see your invoices, your orders and your tickets in your account.',
        },
        {
          t: 'p',
          text: (
            <>
              A request is answered by the operator, at the address given above. You can also complain to the authority that watches the operator:{' '}
              <OperatorPlaceholder label="TODO(operator): the data protection authority you can complain to" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'security',
      title: 'How the data is protected',
      blocks: [
        {
          t: 'list',
          items: [
            <>The password is stored as a scrypt hash, never in plain text.</>,
            <>The cookie of the session is marked HttpOnly, so the code of a page cannot read it, and it is marked Secure when the site is served over HTTPS.</>,
            <>The forms that change something ask for a token that is checked against the request, so a request that comes from another site is refused.</>,
            <>The card details never reach the platform: the payment provider handles them.</>,
            <>The client key of the panel is encrypted on the disk and is scoped to one account.</>,
            <>The access of the staff is written down in the audit log.</>,
          ],
        },
      ],
    },
    {
      id: 'where',
      title: 'Where the data is hosted',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              The platform does not name a country in its configuration, so the place where the data is hosted has to be confirmed by the operator:{' '}
              <OperatorPlaceholder label="TODO(operator): the country or region where the data is hosted" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'children',
      title: 'Children',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              The platform is not directed at children, and the operator does not knowingly collect the data of a child. The age from which an account may be opened is{' '}
              <OperatorPlaceholder label="TODO(operator): the minimum age to open an account" />.
            </>
          ),
        },
      ],
    },
    {
      id: 'changes',
      title: 'Changes to this policy and contact',
      blocks: [
        {
          t: 'p',
          text: 'This policy can change. The version that applies is the one on this page, and the date under the title says when it was last changed. When a change is important, the platform writes to the address on your account before it takes effect.',
        },
        {
          t: 'p',
          text: (
            <>
              Questions about your data go to{' '}
              <OperatorPlaceholder label="TODO(operator): the email address for data questions" />.
            </>
          ),
        },
      ],
    },
  ],
};
