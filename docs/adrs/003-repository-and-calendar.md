# ADR 003: Repository port and calendar port

Leads, conversations, messages, appointments, idempotency rows, and latency samples go through `LeadRepository`. `MemoryRepository` is the default. `SqlRepository` uses `INSERT ... ON CONFLICT` against a small executor interface. `SqliteExecutor` is the implementation in the repo. A Postgres executor would implement the same three methods (`run`, `get`, `all`) and the schema in `src/adapters/storage/schema.ts`.

The calendar port lists open slots, books one, and releases one. `MemoryCalendar` takes a per-slot async lock and checks the slot state again after a yield, so two in-flight bookings cannot both win. SQLite slot claims use `UPDATE ... WHERE state = 'open'`. That predicate is what makes a second writer fail. The lock is in-process. Two Node processes do not share it unless they share a database that enforces the predicate.

`CALENDAR_PROVIDER=calcom` calls the Cal.com v2 slots and bookings endpoints. `CALENDAR_PROVIDER=google` calls Google Calendar free/busy and event insert. Neither is selected by default. Google OAuth is not implemented; the adapter requires an access token and refuses to construct without one.
