# Support security

What the code does about each threat, and what it does not. "Tested" means a test in `api/tests/support-*.test.ts` fails without the control.

| Threat | Control | State |
|---|---|---|
| Reading another customer's conversation | Every ticket route compares the owner; a stranger gets 404. The stream sends a customer only their own public events | Tested |
| Internal notes reaching a customer | Left out by the query, not only by a filter; events of types `note, assigned, department, rating, automation, bounce` are staff-only; the files of a note are refused to a customer; the stream strips `internal` | Tested |
| Staff acting beyond their permission | `requirePermission` on every staff route and stream; settings changes need `settings.write`; billing in the context panel needs `orders.read` | Tested |
| Stored XSS | Messages, bot text and previews are rendered as text by React; a bot variable is plain text and `{{…}}` is the only syntax; the draft of the assistant is shown as text | Tested for the bot; by construction for the rest |
| Malicious attachments | Size, declared type from a list, and the signature of the bytes for images, PDF, zip and gzip; text types must hold no NUL byte; served as `attachment` with `nosniff`; stored outside the web root | Tested. No virus scan |
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

## Not built, so not protected

- **Anonymous visitors** have no chat. A guest needs a short-lived scoped token and a verified path to an account; it was not built, so no guest credential exists to steal.
- **Origin checks and WebSocket hijacking:** the transport is SSE with the session cookie, same origin; there is no websocket for support.
- **Retention and deletion of conversations:** the platform's account export and deletion cover tickets as before; no separate retention period was added for chats, bot sessions or automation history.
- **Attachments by email** are not taken in.
- **Customer-facing AI** does not exist: the assistant drafts for staff only.
