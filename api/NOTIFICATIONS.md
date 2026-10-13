# VendorTrace notifications

## Behaviour

- When a review stage first becomes active, every configured individual on that team gets a **separate** email.
- New cases initially notify PVM, Business Architecture, and Risk. Later handoffs notify only newly activated stages.
- If TPRM rules require `UpguardAssessment`, Security Governance also receives an **immediate creation-time setup request**, independent of its later review turn.
- Risk's initial review and final sign-off are distinct events. Starting a stage, refreshing a page, and retrying a completed-stage request do not generate new events.
- No messages are sent directly to vendors. No workbooks, PI answers, contact lists, or assessment attachments are included in the message body.
- Links open the application homepage; the current frontend does not support case deep links. The message includes the case number to find.
- The private recipient roster is independent of application membership and never grants access.

## Safe configuration

Default: `NOTIFICATION_MODE=preview`. There is no network email delivery. With a test address configured, notifications are saved as `previewed`; without one, no recipient jobs are created.

Keep actual staff names/addresses **out of this public repository**, even in comments. The provided private file is `notification-recipients.local.jsonc` (ignored by Git), accepting JSON with full-line `//` comments. Load it only from a private deployment filesystem:

```
NOTIFICATION_MODE=preview
NOTIFICATION_TEST_EMAIL=<approved test recipient>
NOTIFICATION_RECIPIENTS_FILE=/private/path/notification-recipients.local.jsonc
NOTIFICATION_APP_URL=https://<approved VendorTrace frontend>
```

For local preview put settings in `.env.notifications.local` in `api/`, then run `npm run notifications:preview`. The CLI only prints synthetic messages; it never accesses the database or sends mail.

### Amber-only testing, once a sender is approved

Set `NOTIFICATION_MODE=test`. Test mode **ignores every roster and DB team membership** and permits only `NOTIFICATION_TEST_EMAIL`, including for UpGuard. A second allowlist check at the mail transport rejects any queued job with a different recipient.

Sending additionally requires:

```
NOTIFICATION_SENDER=<IT-approved GS mailbox>
GRAPH_TENANT_ID=<tenant>
GRAPH_CLIENT_ID=<application>
GRAPH_CLIENT_SECRET=<secret from approved secret store>
NOTIFICATION_APP_URL=https://<approved VendorTrace frontend>
```

Use Azure application settings / Key Vault for credentials; never commit or paste secrets into source or chat.
The mail app uses Graph client credentials independently of whether SharePoint is configured. SSO consent does **not** grant permission to send mail.
IT must approve Microsoft Graph application `Mail.Send` and restrict application access to the approved sender mailbox. Coordinate the mailbox-scoped permission approach with Exchange administrators.

**No live/test send has been performed by this implementation.** Microsoft Graph `202 Accepted` is recorded as `accepted`, not `delivered`; confirm inbox receipt or use Exchange message tracing for an actual delivery test.

### Live staff notifications (requires a separate go-live decision)

Do not change to live while privacy/security approvals or API access controls are outstanding. Anyone able to trigger case creation/transitions could otherwise trigger notifications.

1. Confirm the complete staff roster, including Risk (not yet provided). Replace test recipients with approved team addresses and activate selected commented entries.
2. Confirm recipient permissions and minimum message contents with the business/privacy owner.
3. Configure the approved sender and mail permissions; verify an Amber-only send and its actual inbox receipt.
4. Explicitly set `NOTIFICATION_MODE=live` and `NOTIFICATION_LIVE_CONFIRMED=yes`.

Live mode fails startup if any of the nine teams has no configured recipients. Use normalized team keys or display labels; duplicate addresses within a team are collapsed. Before submission, the worker rechecks each recipient against its configured team roster; restart the API after an approved roster change.
The provided private roster currently has the test address active for **all** teams. It is NOT a production-ready roster.

## Database migration / worker

Apply `npx prisma migrate deploy` using the existing approved deployment process before starting the updated API. The additive migration introduces `EmailNotification`; it does not modify production until applied.

Case creation and handoff save notification jobs in the **same database transaction**. A unique per-case/stage/recipient event key prevents repeat enqueueing. Concurrent completion actions for a case are serialized.

The API polls the queue every 10 seconds. Multiple API instances compete using atomic job claims. No additional always-running service is required beyond the API, but configure the approved host to stay active if prompt notifications are required.

- `previewed`: no delivery attempted; never automatically promoted to live.
- `pending` / `retry`: awaiting submission in the job's original mode.
- `processing`: claimed by a worker.
- `accepted`: Graph accepted the request, not proof of receipt.
- `failed`: permanent rejection or safe retry budget exhausted.
- `unknown`: timeout, ambiguous server failure, or expired worker claim; operator review required.

Safe retries use persisted backoff (maximum six attempts) and honor `Retry-After` on 429 throttling. Token failures may be retried because no mail was submitted. Ambiguous sends are **not automatically retried**, avoiding blind duplicate sends. Graph offers no exactly-once inbox-delivery guarantee.

For `unknown`, check sender Sent Items / Exchange message trace using `x-vendortrace-notification-id` before deciding whether to replay. Do not bulk replay or change old preview/test jobs to live.
No public queue/replay endpoint is added. Inspect statuses via approved database administration; notification bodies, recipient addresses, and snapshots must be included in the GS retention/access policy.

## Verification

```
npm run build
npm run test:notifications
NOTIFICATION_TEST_DATABASE_URL=<disposable local test DB only> npm run test:notifications:db
```

The integration suite only accepts a loopback database named `vendortrace_notification_test`, refuses an existing `DATABASE_URL`, disables all Graph/SharePoint configuration, and uses synthetic identities/workbooks. Never run it against production.
The mail tests stub HTTP calls; they do not prove live mailbox permissions or actual delivery.

Reference: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
