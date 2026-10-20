# Security policy

## Reporting vulnerabilities

Contact the maintainer via https://github.com/cahyunk132-ai.
If GitHub private vulnerability reporting is enabled for this repository, use
**Security → Report a vulnerability**. Do not post credentials, personal data,
or exploit details in public issues. If no private channel is listed, ask the
maintainer for a private reporting channel before sharing sensitive details.

Include the affected version or commit, reproduction steps, expected and actual
behaviour, and potential impact. Reports in Indonesian or English are welcome.
No response-time guarantee is made.

## Deployment hardening

- CSP and cross-origin isolation headers are applied by middleware without
  changing API session authentication. The CSP keeps inline scripts for Next.js
  static hydration and inline styles used by the UI; it is a baseline, not a
  nonce-based strict CSP. Production does not permit `unsafe-eval`.
- APIs are same-origin: no cross-origin permission is granted by the application.
  Native clients using bearer tokens are not subject to browser CORS.
- Sensitive probe paths return 404 when they reach the application. Vercel WAF
  may return 403 first; that does **not** prove a sensitive file exists.
- `Server: Vercel` is an infrastructure identifier, not a disclosed software
  version, and may be inserted after application response headers.
- SPF/DMARC require DNS control. Do not add speculative mail records to a shared
  `vercel.app` domain. With a custom domain, configure SPF for actual senders and
  DMARC after verifying mail alignment. For a domain that sends no mail, consider
  `v=spf1 -all` and a DMARC reject policy after reviewing subdomain mail usage.
- Confirm headers on the production URL after deployment. Hosting configuration
  or WAF rules can override application behaviour, including CORS headers.
- Review security.txt contact information and expiry when changing maintainers
  or domains. Configure a verified private contact channel if available.
