# ADR 004: Fair-housing refusals are code, not a prompt

A message that asks the desk to screen by race, color, religion, national origin, sex, disability, or familial status gets a refusal and no slot update from that message. The check is a set of explicit patterns in `src/domain/guardrails/policy.ts`, with unit tests and YAML cases. “White kitchen” and “for my kids” are not matches.

The model is not asked to decide this. A prompt-only refusal would be skipped whenever the process is offline, which is the default and the CI path.

The desk also refuses legal advice and mortgage or tax advice, and it does not book outside weekdays 09:00–17:00 America/Chicago.
