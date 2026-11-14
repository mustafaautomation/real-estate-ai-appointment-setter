'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';

type SlotState = {
  budget?: { min?: number; max?: number };
  area?: string;
  beds?: number;
  propertyType?: string;
  timeline?: string;
};

type ListingCard = {
  id: string;
  address: string;
  neighborhood: string;
  beds: number;
  type: string;
  price: number;
};

type TranscriptItem = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  mode?: string | null;
};

type ChatResponse = {
  reply: string;
  mode: 'offline' | 'openai' | 'offline_fallback';
  conversationId: string;
  slots: SlotState;
  score: number;
  listings: ListingCard[];
  appointment: { id: string; label: string } | null;
  transcript: TranscriptItem[];
  error?: { message?: string };
};

const SLOT_FIELDS = [
  ['propertyType', 'Type'],
  ['beds', 'Beds'],
  ['area', 'Area'],
  ['budget', 'Budget'],
  ['timeline', 'Timeline'],
] as const;

export function ChatPanel() {
  const [text, setText] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [slots, setSlots] = useState<SlotState>({});
  const [score, setScore] = useState(0);
  const [listings, setListings] = useState<ListingCard[]>([]);
  const [appointment, setAppointment] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: message,
          conversationId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as ChatResponse;
      if (!response.ok) {
        setError(payload.error?.message ?? 'The desk could not send that.');
        return;
      }
      setText('');
      setConversationId(payload.conversationId);
      setTranscript(payload.transcript);
      setSlots(payload.slots);
      setScore(payload.score);
      setListings(payload.listings);
      setAppointment(payload.appointment?.label ?? null);
    } catch {
      setError('The desk could not send that.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="chat-shell">
      <section className="chat-log-wrap" aria-labelledby="chat-heading">
        <div className="section-label">
          <h1 id="chat-heading">Site chat</h1>
          <p>Same engine as SMS, email, and Instagram.</p>
        </div>
        <div
          className="chat-log"
          data-testid="chat-log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {transcript.length === 0 ? (
            <p className="empty" data-testid="chat-empty">
              Ask about a home. The thread stays open past three messages.
            </p>
          ) : (
            transcript.map((item) => (
              <article
                key={item.id}
                className={`bubble ${item.role}`}
                data-testid={`${item.role}-message`}
              >
                <span className="who">{item.role === 'user' ? 'Lead' : 'Desk'}</span>
                <p>{item.text}</p>
                {item.role === 'assistant' && item.mode ? <ModeNote mode={item.mode} /> : null}
              </article>
            ))
          )}
        </div>
        {appointment ? (
          <p className="confirm" data-testid="booking-confirmation">
            Booked {appointment}
          </p>
        ) : null}
        {listings.length > 0 ? (
          <ul className="listing-list">
            {listings.map((listing) => (
              <li key={listing.id}>
                {listing.address}, {listing.neighborhood} · {listing.beds} bd · $
                {listing.price.toLocaleString('en-US')}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p className="form-error" role="alert" data-testid="chat-error">
            {error}
          </p>
        ) : null}
        <form onSubmit={send} aria-busy={pending}>
          <label htmlFor="chat-text">Message</label>
          <div className="composer">
            <textarea
              id="chat-text"
              data-testid="chat-input"
              value={text}
              rows={2}
              maxLength={4000}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              type="submit"
              data-testid="chat-send"
              disabled={pending || text.trim().length === 0}
            >
              {pending ? 'Sending' : 'Send'}
            </button>
          </div>
        </form>
      </section>
      <aside className="slot-rail" aria-label="Qualification">
        <h2>Qualification</h2>
        <p className="scoreline">
          Score <strong data-testid="qual-score">{score}</strong>
        </p>
        <ul>
          {SLOT_FIELDS.map(([key, label]) => (
            <li key={key} data-testid={`slot-${key}`}>
              <span>{label}</span>
              <strong>{formatSlot(key, slots) ?? 'Needed'}</strong>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function ModeNote({ mode }: { mode: string }) {
  const label =
    mode === 'openai' ? 'OpenAI' : mode === 'offline_fallback' ? 'Offline fallback' : 'Offline';
  return (
    <span className="mode-note" data-testid="reply-mode">
      {label}
    </span>
  );
}

function formatSlot(key: (typeof SLOT_FIELDS)[number][0], slots: SlotState): string | null {
  if (key === 'budget') {
    if (slots.budget?.min !== undefined && slots.budget.max !== undefined) {
      return `$${slots.budget.min.toLocaleString('en-US')}–$${slots.budget.max.toLocaleString('en-US')}`;
    }
    if (slots.budget?.max !== undefined)
      return `under $${slots.budget.max.toLocaleString('en-US')}`;
    if (slots.budget?.min !== undefined) return `from $${slots.budget.min.toLocaleString('en-US')}`;
    return null;
  }
  const value = slots[key];
  if (value === undefined) return null;
  return String(value).replaceAll('_', ' ');
}
