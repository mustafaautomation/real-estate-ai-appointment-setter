'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';

import { ScoreRing } from './marks';

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
  createdAt?: string;
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

const FIELDS = [
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
  const [offers, setOffers] = useState<Record<string, ListingCard[]>>({});
  const [bookedHomeId, setBookedHomeId] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<string | null>(null);
  const [mode, setMode] = useState('offline');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(message: string) {
    const trimmed = message.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    setText('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          conversationId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as ChatResponse;
      if (!response.ok) {
        setText(trimmed);
        setError(payload.error?.message ?? 'The desk could not send that.');
        return;
      }
      setConversationId(payload.conversationId);
      setTranscript(payload.transcript);
      setSlots(payload.slots);
      setScore(payload.score);
      setOffers((current) => {
        if (Object.keys(current).length > 0 || payload.listings.length === 0) return current;
        const offer = [...payload.transcript].reverse().find((item) => item.role === 'assistant');
        return offer ? { [offer.id]: payload.listings } : current;
      });
      if (payload.appointment && payload.listings[0]) setBookedHomeId(payload.listings[0].id);
      setAppointment(payload.appointment?.label ?? null);
      setMode(payload.mode);
    } catch {
      setText(trimmed);
      setError('The desk could not send that.');
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(text);
  }

  const filled = FIELDS.filter(([key]) => formatSlot(key, slots)).length;

  return (
    <div className="messenger">
      <section className="thread" aria-labelledby="chat-heading">
        <header className="thread-head">
          <div>
            <h1 id="chat-heading">Site chat</h1>
            <p>Same desk as SMS, email, and Instagram.</p>
          </div>
          <span className="quiet-mode" data-testid="reply-mode">
            {mode === 'openai'
              ? 'OpenAI'
              : mode === 'offline_fallback'
                ? 'Offline fallback'
                : 'Offline'}
          </span>
        </header>
        <div className="thread-log" data-testid="chat-log" aria-live="polite">
          {transcript.length === 0 ? (
            <p className="empty" data-testid="chat-empty">
              Say what you are looking for. The thread stays open.
            </p>
          ) : (
            transcript.map((item) => (
              <article
                key={item.id}
                className={`bubble ${item.role}`}
                data-testid={`${item.role}-message`}
              >
                <span className="avatar" aria-hidden="true">
                  {item.role === 'user' ? 'You' : 'H'}
                </span>
                <div>
                  <p>{item.text}</p>
                  {item.createdAt ? (
                    <time dateTime={item.createdAt}>{clock(item.createdAt)}</time>
                  ) : null}
                  {offers[item.id] ? (
                    <ul className="homes">
                      {offers[item.id]?.map((listing) => (
                        <li
                          key={listing.id}
                          className={listing.id === bookedHomeId ? 'home-card held' : 'home-card'}
                        >
                          <div
                            className={`home-photo tone-${listing.id.slice(-1)}`}
                            aria-hidden="true"
                          />
                          <div>
                            <strong>{listing.address}</strong>
                            <p>
                              {listing.neighborhood} · {listing.beds} bd ·{' '}
                              {listing.type.replaceAll('_', ' ')}
                            </p>
                            <p className="price">${listing.price.toLocaleString('en-US')}</p>
                            {listing.id === bookedHomeId ? (
                              <p className="held-label">Booked for the tour</p>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void submit('Book the earliest slot')}
                              >
                                Book tour
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </article>
            ))
          )}
          {pending ? (
            <article className="bubble assistant typing" aria-hidden="true">
              <span className="avatar">H</span>
              <div className="dots">
                <i />
                <i />
                <i />
              </div>
            </article>
          ) : null}
          {appointment ? (
            <article className="confirm-card" data-testid="booking-confirmation">
              <span className="cal" aria-hidden="true" />
              <div>
                <p>Tour booked</p>
                <strong>{appointment}</strong>
              </div>
            </article>
          ) : null}
        </div>
        {error ? (
          <p className="form-error" role="alert" data-testid="chat-error">
            {error}
          </p>
        ) : null}
        <div className="chips">
          {chipsFor(slots, Boolean(appointment)).map((chip) => (
            <button key={chip.label} type="button" onClick={() => void submit(chip.text)}>
              {chip.label}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} aria-busy={pending}>
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
      <aside className="qualify" aria-label="Qualification">
        <div className="qualify-head">
          <ScoreRing score={score} />
          <div>
            <h2>Qualification</h2>
            <p>{filled} of 5 slots</p>
          </div>
        </div>
        <ol className="steps">
          {FIELDS.map(([key, label]) => {
            const value = formatSlot(key, slots);
            return (
              <li key={key} data-testid={`slot-${key}`} className={value ? 'done' : ''}>
                <span>{label}</span>
                <strong>{value ?? 'Open'}</strong>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

function chipsFor(slots: SlotState, booked: boolean): { label: string; text: string }[] {
  if (booked) return [];
  if (!slots.propertyType) {
    return [
      { label: 'Condo', text: 'a condo' },
      { label: 'House', text: 'a house' },
      { label: 'Townhouse', text: 'a townhouse' },
    ];
  }
  if (slots.beds === undefined) {
    return [
      { label: '2 beds', text: '2 bedrooms' },
      { label: '3 beds', text: '3 bedrooms' },
      { label: '4 beds', text: '4 bedrooms' },
    ];
  }
  if (!slots.area) {
    return [
      { label: 'Lantern Hill', text: 'Lantern Hill' },
      { label: 'Old Keel', text: 'Old Keel' },
      { label: 'Glassmarket', text: 'Glassmarket' },
    ];
  }
  if (slots.budget?.max === undefined) {
    return [
      { label: 'Under $500k', text: 'budget under 500k' },
      { label: 'Under $700k', text: 'budget under 700k' },
      { label: 'Under $1.1M', text: 'budget under 1.1m' },
    ];
  }
  if (!slots.timeline) {
    return [
      { label: '30 days', text: 'within 30 days' },
      { label: '90 days', text: 'within 90 days' },
      { label: 'Just looking', text: 'just looking' },
    ];
  }
  return [{ label: 'Book earliest', text: 'Book the earliest slot' }];
}

function formatSlot(key: (typeof FIELDS)[number][0], slots: SlotState): string | null {
  if (key === 'budget') {
    if (slots.budget?.max !== undefined)
      return `under $${slots.budget.max.toLocaleString('en-US')}`;
    return null;
  }
  const value = slots[key];
  if (value === undefined) return null;
  return String(value).replaceAll('_', ' ');
}

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}
