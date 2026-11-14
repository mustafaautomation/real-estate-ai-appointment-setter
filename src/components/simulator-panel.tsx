'use client';

import { useState } from 'react';

type Channel = 'sms' | 'email' | 'instagram';

function fixtureIds(): Record<Channel, { externalUserId: string; label: string }> {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  return {
    sms: { externalUserId: `+1555${suffix.slice(0, 7)}`, label: 'SMS' },
    email: { externalUserId: `lead-${suffix}@example.com`, label: 'Email' },
    instagram: { externalUserId: suffix, label: 'Instagram' },
  };
}

const INQUIRY = 'Looking for a 3 bedroom condo in Lantern Hill under $700k within 30 days.';

type DispatchResponse = {
  reply?: string;
  mode?: string;
  score?: number;
  appointment?: { label: string } | null;
  error?: { message?: string };
};

export function SimulatorPanel() {
  const [fixtures] = useState(fixtureIds);
  const [channel, setChannel] = useState<Channel>('sms');
  const [text, setText] = useState(INQUIRY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DispatchResponse | null>(null);

  async function send(nextText: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/simulator/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel,
          text: nextText,
          externalUserId: fixtures[channel].externalUserId,
        }),
      });
      const payload = (await response.json()) as DispatchResponse;
      if (!response.ok) {
        setError(payload.error?.message ?? 'The webhook rejected that payload.');
        setResult(payload);
        return;
      }
      setResult(payload);
      setText(nextText);
    } catch {
      setError('The webhook rejected that payload.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="simulator">
      <div className="tabs" role="group" aria-label="Channel">
        {(Object.keys(fixtures) as Channel[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={channel === item}
            data-testid={`simulator-tab-${item}`}
            onClick={() => {
              setChannel(item);
              setText(INQUIRY);
              setResult(null);
              setError(null);
            }}
          >
            {fixtures[item].label}
          </button>
        ))}
      </div>
      <form
        data-testid={`simulator-${channel}`}
        onSubmit={(event) => {
          event.preventDefault();
          void send(text);
        }}
      >
        <label htmlFor="sim-text">Payload text</label>
        <textarea
          id="sim-text"
          data-testid="simulator-text"
          rows={4}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="row-actions">
          <button
            type="submit"
            data-testid="simulator-send"
            disabled={pending || text.trim().length === 0}
          >
            {pending ? 'Sending' : `Send ${fixtures[channel].label}`}
          </button>
          <button
            type="button"
            data-testid="simulator-book"
            disabled={pending}
            onClick={() => void send('Book the earliest slot')}
          >
            Book earliest
          </button>
        </div>
      </form>
      {error ? (
        <p className="form-error" role="alert" data-testid="simulator-error">
          {error}
        </p>
      ) : null}
      <div className="sim-result" data-testid="simulator-result" aria-live="polite">
        {result?.reply ? (
          <>
            <p data-testid="simulator-reply">{result.reply}</p>
            {result.mode ? (
              <p className="mode-note" data-testid="simulator-mode">
                {result.mode === 'openai'
                  ? 'OpenAI'
                  : result.mode === 'offline_fallback'
                    ? 'Offline fallback'
                    : 'Offline'}
              </p>
            ) : null}
            {result.appointment?.label ? (
              <p data-testid="simulator-booked">Booked {result.appointment.label}</p>
            ) : null}
          </>
        ) : (
          <p className="empty">No webhook response yet.</p>
        )}
      </div>
    </div>
  );
}
