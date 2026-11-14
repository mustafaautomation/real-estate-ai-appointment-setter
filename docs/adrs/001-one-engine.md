# ADR 001: One state machine for every channel

Channel adapters parse a provider payload into `{ channel, externalUserId, externalMessageId, text }`. They do not qualify leads. SMS, email, Instagram, and site chat call `handleTurn`.

A per-channel script would drift, and it would make the “not capped at three messages” behavior a special case. One machine keeps slot merge, refusals, and booking identical in tests and in the simulator.

Voice is the exception, and only because it is unwired. Its route validates tool arguments and returns.
