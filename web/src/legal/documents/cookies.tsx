import { Link } from '../../router';
import { OperatorPlaceholder } from '../OperatorPlaceholder';
import { LEGAL_LINKS } from '../links';
import type { LegalDocument } from '../types';

/**
 * The cookie policy.
 *
 * The platform sets exactly two cookies. Their names, their attributes and
 * their lifetime are read from the code that sets them, so the table below is
 * what the browser really receives.
 */
export const COOKIES: LegalDocument = {
  ...LEGAL_LINKS.cookies,
  summary:
    'The two cookies the platform sets, what each of them is for, and the fact that there are no others.',
  updated: '2026-10-24',
  sections: [
    {
      id: 'what-cookies-are',
      title: 'What a cookie is',
      blocks: [
        {
          t: 'p',
          text: 'A cookie is a small piece of text the server asks your browser to remember and to send back with the requests to the same site. Cookies are used for the session of a signed-in person and for the protection of the forms. They are not used to follow you.',
        },
        {
          t: 'p',
          text: (
            <>
              The cookies of the platform are set for <OperatorPlaceholder label="TODO(operator): the legal name of the operator" />, the operator of the site.
            </>
          ),
        },
      ],
    },
    {
      id: 'the-cookies',
      title: 'The cookies the platform sets',
      blocks: [
        {
          t: 'p',
          text: 'There are two of them, and no others.',
        },
        {
          t: 'note',
          tone: 'note',
          text: (
            <>
              <strong>bm_session</strong> — keeps you signed in. It holds the token of your session. It is marked{' '}
              <strong>HttpOnly</strong>, so the code of a page cannot read it, and <strong>SameSite=Lax</strong>. It is marked{' '}
              <strong>Secure</strong> when the site is served over HTTPS, and it always is in the production environment. It is set on the
              whole site and it expires 14 days after you sign in. The server keeps only a hash of the token, so the cookie itself is
              the one thing that can open your session.
            </>
          ),
        },
        {
          t: 'note',
          tone: 'note',
          text: (
            <>
              <strong>bm_csrf</strong> — protects the forms. It is not marked HttpOnly, because the browser has to read it and send it
              back in the <strong>X-CSRF-Token</strong> header of every request that changes something. It is marked{' '}
              <strong>SameSite=Lax</strong> and <strong>Secure</strong> when the site is served over HTTPS. It is set on the whole site
              and it lasts 24 hours. A request that comes from another site can send the cookie but cannot read it, so it cannot build
              the header and the request is refused.
            </>
          ),
        },
      ],
    },
    {
      id: 'what-is-not-set',
      title: 'What the platform does not set',
      blocks: [
        {
          t: 'list',
          items: [
            <>No advertising cookie and no cookie of a network of advertising.</>,
            <>No analytics cookie: the platform does not count the visits with a third party and does not build a profile of the visitor.</>,
            <>No cookie of a social network, and no cookie of a third party at all. The two cookies above are set by the site itself and are only sent back to it.</>,
            <>Nothing is kept in the local storage or in the session storage of the browser. The interface has no tracker in it.</>,
            <>The typeface and the pictures of the site are served by the site itself, so your browser does not tell a third party that you are here.</>,
          ],
        },
      ],
    },
    {
      id: 'removing-them',
      title: 'Removing the cookies',
      blocks: [
        {
          t: 'p',
          text: 'Every browser can refuse cookies or delete the ones that are already there. The settings of the browser are where that is decided.',
        },
        {
          t: 'p',
          text: 'Deleting bm_session signs you out. Deleting bm_csrf is not a problem: the site asks the browser for a new one the next time it needs it.',
        },
      ],
    },
    {
      id: 'questions',
      title: 'Questions',
      blocks: [
        {
          t: 'p',
          text: (
            <>
              A question about these cookies goes to{' '}
              <OperatorPlaceholder label="TODO(operator): the email address for questions about privacy and cookies" />. The{' '}
              <Link to={LEGAL_LINKS.privacy.to} className="font-bold text-acc hover:underline">
                privacy policy
              </Link>{' '}
              says what the platform stores and who else sees it.
            </>
          ),
        },
      ],
    },
  ],
};
