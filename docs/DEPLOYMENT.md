# Deployment guide

## 1. Provision the runtime

Use your own Cloudflare account, D1 database, email sender and Turnstile widget. The configuration in this repository does not refer to the hosted application's resources.

```sh
npm ci
npx wrangler login
npx wrangler d1 create sahar-agent
```

Replace the placeholder `database_id` in `wrangler.toml` with the returned ID. Set `APP_BASE_URL` to the final HTTPS origin. Configure `ADMIN_EMAILS`, `EMAIL_FROM` and `TURNSTILE_SITE_KEY` for your deployment. A custom domain is optional; if you add one, update provider callback URLs and Turnstile's hostname allowlist together.

The hosted demo uses `https://sahar-agent.kioiskio.dev`. Its legacy hostname remains configured: browser GET and HEAD requests redirect with their path and query intact, while API requests and provider callbacks continue to work at the original address. Keep both hostname routes and the Turnstile allowlist entries during migration. Session cookies are host-specific, so users sign in again on the new hostname; accounts, credits and orders remain in the same database. `run_worker_first` ensures redirects also apply to the homepage and existing static assets.

For local development, copy `.dev.vars.example` to `.dev.vars` and set the local origin there. Apply migrations with `npx wrangler d1 migrations apply DB --local`. The default Vite port is 3000; use its actual printed origin if the port is occupied. Start with `npm run dev`.

Keep `assets.not_found_handling = "none"`. The Worker supplies the application shell for browser routes and handles static assets separately. Missing scripts return a non-cacheable error rather than homepage HTML; JavaScript and CSS responses are checked for their expected media types. Builds place hashed resources under `/assets/app/` and embed the shared stylesheet in the HTML.

## 2. Configure sign-in

Create a Turnstile widget whose allowed hostname matches your application. Set the public site key in configuration and the secret key as a Worker secret. Sign-in requires an `EMAIL` binding exposing the `send({ to, from, subject, text })` interface defined in `src/lib/mailer.ts`.

The hosted installation uses Cloudflare's email-sending service. Provision the service and verify your sender in your account before adding this binding to `wrangler.toml`:

```toml
[[send_email]]
name = "EMAIL"
allowed_sender_addresses = ["noreply@your-domain.example"]
```

Set `EMAIL_FROM` to the verified sender. Availability and recipient restrictions depend on the email service provisioned for your account. A build does not provision or validate email delivery. If your account only supports raw Email Routing messages, provide a binding adapter implementing the application's mailer interface; those interfaces are not interchangeable.

Generate a unique, unpredictable `AUTH_SECRET` of at least 32 characters. Set `ADMIN_EMAILS` to the email addresses that should receive administrator access. Ordinary users cannot grant themselves administrator access by changing browser state.

```sh
npx wrangler secret put AUTH_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Never enable internal verification sinks on a deployed hostname. They are not a replacement for email delivery or bot verification.

## 3. Configure the model

Keep `AI_PROVIDER=openai` for the OpenAI-compatible protocol. Set `AI_BASE_URL` and `AI_MODEL` for a model available in your Qiniu account. The release uses `deepseek/deepseek-v4.1-flash-1017`.

For a standard Worker secret:

```sh
npx wrangler secret put AI_API_KEY
```

Alternatively, create a dedicated Secrets Store secret and add its binding:

```toml
[[secrets_store_secrets]]
binding = "QINIU_SAHAR"
store_id = "YOUR_STORE_ID"
secret_name = "YOUR_SECRET_NAME"
```

When the binding exists, it takes precedence over `AI_API_KEY`. A failed or empty Secrets Store lookup is an error; do not configure an unused binding. Keep a conservative `AI_DAILY_CALL_BUDGET` and set provider-side spending controls. This limit is a number of calls, not a monetary budget. The Telegram path shares the global call budget but does not use web account credits.

## 4. Configure PayPal Sandbox

Create a Sandbox REST application in the PayPal Developer Dashboard. Use its client ID and secret, and a separate Sandbox **Personal** account for buyer approval. The Business seller cannot buy from itself.

```sh
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_SECRET
```

Register `https://YOUR_ORIGIN/webhook/paypal` for the events handled by `src/routes/paypal.ts`:

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REFUNDED`

Store the returned registration ID:

```sh
npx wrangler secret put PAYPAL_WEBHOOK_ID
```

Keep `PAYPAL_MODE=sandbox`. The checkout link is a bearer capability; never publish a real checkout URL or its access token in logs, screenshots or issues. The app generates return and cancel URLs using `APP_BASE_URL`.

## 5. Configure Telegram

Create a bot through BotFather and set these secrets:

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Register the bot's webhook using Telegram's `setWebhook` method with:

| Field | Value |
| --- | --- |
| `url` | `https://YOUR_ORIGIN/webhook/telegram` |
| `secret_token` | The value of your webhook secret |
| `allowed_updates` | `["message"]` |

Send this request through a trusted local client without recording the bot token in shared shell history or logs. Only private, human-authored text messages enter the workflow. Scheduled maintenance retries persisted jobs and outbound deliveries.

Legacy channel identifiers in migrations are retained for schema compatibility. Telegram and signed-in web chat are the supported channels described by this release.

## 6. Migrate and deploy

```sh
npm run typecheck
npm run build
npx wrangler d1 migrations list DB --remote
# Back up any existing database before applying pending migrations.
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Apply the numbered migrations in order. Do not apply `src/db/schema.sql` on top of an already migrated database. The scheduled trigger processes delivery retries, recovers expired credit reservations and cleans up eligible simulator and webhook records.

Do not reuse the hosted instance's Worker name, database ID, credentials or callback registration for a new deployment. Each installation owns its own resources.

## 7. Verify the deployed workflow

- Confirm `/api/health` can read the database. Configuration indicators do not establish provider connectivity.
- Sign in through a real mailbox; confirm a new account receives 50 credits and a returning account does not receive another grant.
- Confirm an ordinary account cannot access administration or another account's conversations.
- Send a multilingual enquiry, check the listing and amount, and confirm exactly one credit is charged for a successful reply.
- Ask for deposit details without confirming; no order should be created by that question alone.
- Explicitly confirm, approve using a Sandbox buyer and capture after returning. Refresh and confirm the order remains Paid.
- Inspect the capture reference, verified webhook processing and conversation handoff state in your own deployment.
- Confirm provider failures show a recoverable error and release the web credit reservation.

These steps use external services and test funds. Type checking and building alone do not establish this acceptance result.
