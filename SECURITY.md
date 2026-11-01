# Security policy

## Reporting a vulnerability

Send reports to **kioiskio01@gmail.com**. Include the affected component, reproduction steps, expected impact and relevant software version. Use synthetic data. Do not send another person's records or disclose credentials.

Please report vulnerabilities privately before opening a public issue. No response-time commitment or bug bounty is offered.

## Deployment responsibilities

- Keep credentials in Worker secrets or Secrets Store. Never expose them through browser variables or bundles.
- Use a unique authentication secret, restrict the administrator allowlist and verify email and Turnstile on your origin.
- Authenticate incoming webhooks. Protect checkout URLs: possession of their token grants access to that checkout.
- Configure provider spending limits as well as application limits. Web credits do not authenticate Telegram users.
- Back up D1 before migrations. Protect exports, logs and delivery records, which may contain messages and checkout URLs.
- Use PayPal Sandbox. Illustrative listings and sample terms do not authorize collecting real property funds.

The main branch is the maintained version. This project does not claim an independent security audit or regulatory certification.
