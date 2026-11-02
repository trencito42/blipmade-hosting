# Support security

What the code does about each threat, and what it does not. "Tested" means a test in `api/tests/support-*.test.ts` fails without the control.

| Threat | Control | State |
|---|---|---|
| Reading another customer's conversation | Every ticket route compares the owner; a stranger gets 404. The stream sends a customer only their own public events | Tested |
| Internal notes reaching a customer | Left out by the query, not only by a filter; events of types `note, assigned, department, rating, automation, bounce` are staff-only; the files of a note are refused to a customer; the stream strips `internal` | Tested |
| Staff acting beyond their permission | `requirePermission` on every staff route and stream; settings changes need `settings.write`; billing in the context panel needs `orders.read` | Tested |
| Stored XSS | Messages, bot text and previews are rendered as text by React; a bot variable is plain text and `{{…}}` is the only syntax; the draft of the assistant is shown as text | Tested for the bot; by construction for the rest |
| Malicious attachments | (also for files that come with an email) Size, declared type from a list, and the signature of the bytes for images, PDF, zip and gzip; text types must hold no NUL byte; served as `attachment` with `nosniff`; stored outside the web root | Tested. No virus scan |
| Duplicate and lost messages | Idempotency-Key on replies; Message-ID unique for email; the message is saved before anything is announced; the stream is a hint and is recovered by `seq` | Tested |
| Impersonation by email | The mail system must report SPF or DKIM pass; the sender must be a customer with a verified address; a reply must come from the owner of the conversation; automatic mail and bounces never open a conversation | Tested. Depends on the mail system reporting the checks truthfully |
| Mail loops | `Auto-Submitted`, `Precedence`, `List-Id`, `noreply` senders and bounces are ignored | Tested |
| Webhook replay | A message is taken in once by its Message-ID | Tested |
| Automation loops and floods | One event is handled once per rule (unique key); a change by a rule starts rules three levels deep at most; five runs an hour per rule and conversation; failed runs are tried three times and kept as dead; a rule that waits for the customer cannot be saved as a loop | Tested |
| Bot abuse | No code in a flow; 60 blocks, 50 blocks per turn, 200 per conversation, then a person; a flow that loops without asking cannot be published | Tested |
| Prompt injection | Customer text and notes go in marked blocks; the system text says they are data; the assistant has no tools and cannot change anything; its output is a draft marked "not verified" | The structure is tested; the behaviour of a real model is not |
| Leaking secrets to the provider | Text is passed through the same redaction as the support diagnosis (`password=…`, tokens, URLs with passwords, long random strings) before it leaves | Tested for the common shapes; redaction is best effort |
| SSRF through the provider address | https and a public host are required; localhost, `.internal`, private and link-local addresses are refused | Tested |
| Spending | A daily token limit and a timeout; a failure gives a plain fallback | Tested |
| Notification flooding / resource exhaustion | Rate limits on every write; at most 5 streams per user; a reader that does not keep up is dropped events and told to resync; messages are 4,000 (chat) or 20,000 characters | Partly tested |
| Credentials in the browser | The key of the provider is read from the environment (`SUPPORT_AI_API_KEY`), never stored in the database, never sent | Tested |
| CSRF | The normal double-submit token on every write; `internal/support/inbound` is exempt only when there is no session cookie | Tested |

## Guests of the public chat

Off until an operator switches them on (`/admin/support`). A guest is a user row with `isGuest`, an address that cannot exist (`@guest.invalid`) and a password that matches nothing, so it cannot sign in and no email is ever written to it (the notification publisher skips guests).

| Threat | Control | State |
|---|---|---|
| Impersonation, "who is this" | Name and contact are shown as given and marked "not verified"; the staff sees "Guest (not signed in)", never an address; guests are not listed as customers | Tested |
| Stolen or guessed credential | 32 random bytes in an httpOnly, SameSite=Strict cookie scoped to `/api/support/guest`; only the SHA-256 is stored; valid a day from the last use and a week at most; opens only the chat of its own guest | Tested |
| Session fixation / mixing identities | The chat never accepts a platform session as a guest and the platform never accepts the guest cookie; a signed-in customer without the guest cookie is not a guest | Tested |
| Guest to account | `POST /support/guest/claim` needs both a session and the guest credential; it moves the conversations and deletes the guest | Tested |
| Cross-origin use | `Origin` must equal the host on start, send, end and claim; the normal CSRF token also applies | Tested |
| Abuse and flooding | 5 starts an hour per address (a refused one counts), 60 new guests a minute for the whole platform, 30 messages a minute, 200 messages per chat | Tested (the per-address limit) |
| Consent and privacy | The start is refused without the consent to the notice; the notice is editable and warns not to write secrets | Tested |
| Retention | A guest who has not come back for the retention period (default 30 days) is deleted with the conversations; an hourly job in the worker | Tested |

## Not built, so not protected
- **Origin checks and WebSocket hijacking:** the transport is SSE with the session cookie, same origin; there is no websocket for support.
- **Retention and deletion of conversations:** the platform's account export and deletion cover tickets as before; no separate retention period was added for chats, bot sessions or automation history.
- **Guests cannot upload files**, and cannot see typing indicators.
- **Customer-facing AI** does not exist: the assistant drafts for staff only.
