# Verify email addresses through Google SMTP

Thirrem now verifies the email address of each account. Verification emails are sent over Google SMTP from a dedicated Gmail account, using an app password. This reverses the first version's "no email verification" rule.

We rejected Resend's free plan, which can only send to arbitrary recipients from a domain the owner has verified: the demo runs at $0 on free subdomains (`*.vercel.app`, `*.ts.net`) that the owner does not control DNS for, and a domain is a recurring cost. We also rejected a provider that verifies a single sender address, because mail sent from a Gmail address through another provider is more likely to be treated as spam than mail sent through Gmail itself. The backend is home-hosted, so it can open the SMTP connection directly.

## Consequences

- Mail goes out from a Gmail address that recruiters can see, so it must be a dedicated account, not the owner's personal one.
- Gmail limits how many recipients a personal account can mail per day (about 500, unchecked), and Google can lock an account for automated sending. Resending must be rate limited, and email sending sits behind an interface so the provider can change.
- The SMTP username and app password live in environment variables on the host and are never committed.
- Tests and CI use a fake mailer; no real email is sent.
- A custom sending domain with a provider such as Resend is a possible later upgrade, if the owner buys a domain.

## Open

- Whether an unverified Rider can log in and enter a Sandbox, or must verify first.
- Link or code, and what happens to accounts created before verification existed.

Tracked in issue #30.
