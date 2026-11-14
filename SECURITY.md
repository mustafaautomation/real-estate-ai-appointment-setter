# Security

This is a personal demo with synthetic listings. Do not put real lead data in it.

The webhook routes check signatures for the Twilio-shaped and Meta-shaped payloads and fail closed when the matching secret is missing. The email route checks an HMAC only when `EMAIL_WEBHOOK_SECRET` is set. Rate limits and idempotency keys are in-process. Logs pass through a redactor for email addresses, phone numbers, and SSNs. Do not log raw bodies.

The values in `.env.example` are test strings for local signature checks. They are not credentials for Twilio, Meta, Cal.com, Google, or OpenAI.

To report a problem in this repository, open a GitHub issue. There is no bounty and no private disclosure program.
