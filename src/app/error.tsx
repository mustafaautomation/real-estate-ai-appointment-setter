'use client';

export default function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <h1>The desk hit an error</h1>
      <p>
        This screen is the error state. The underlying message stays in the server log, redacted.
      </p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
