# ADR 002: Policy in code, phrasing in the model

Slot updates, fair-housing refusals, legal and financial refusals, SMS opt-out, handoff, and booking are deterministic. Tests and the YAML evals run with no API key.

When `OPENAI_API_KEY` is set, the model may rewrite an ordinary reply. Refusals, opt-out, and handoff are not rewritten. The call has a timeout and two retries with backoff. On failure the template is returned and the reply mode is `offline_fallback`.

The header shows whether a key is configured. Each reply badge shows the path that produced it. The UI does not say a model ran when it did not.
