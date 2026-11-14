'use client';

import { useEffect, useState } from 'react';

import type { Channel, PipelineStage } from '@/domain/types';

import { ChannelMark, ScoreRing } from './marks';

export type InboxCard = {
  id: string;
  synthetic: boolean;
  channel: Channel;
  stage: PipelineStage;
  score: number;
  label: string;
  budget: string;
  area: string;
  transcript: { id: string; role: 'user' | 'assistant'; text: string; createdAt: string }[];
};

export type WeekDay = {
  key: string;
  weekday: string;
  date: string;
  tours: { id: string; time: string; title: string }[];
};

export type Kpi = { label: string; value: number; points: number[] };

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'qualifying', label: 'Qualifying' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'booked', label: 'Booked' },
  { id: 'handoff', label: 'Handoff' },
  { id: 'opted_out', label: 'Opted out' },
];

export function Inbox({ leads, week, kpis }: { leads: InboxCard[]; week: WeekDay[]; kpis: Kpi[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = leads.find((lead) => lead.id === openId) ?? null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="inbox">
      <div className="kpis">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="kpi">
            <p>{kpi.label}</p>
            <strong>{kpi.value}</strong>
            <Spark points={kpi.points} />
          </article>
        ))}
      </div>
      <div className="inbox-grid">
        <div>
          <div className="kanban" aria-label="Pipeline">
            {STAGES.map((stage) => {
              const cards = leads.filter((lead) => lead.stage === stage.id);
              return (
                <section key={stage.id} className="lane" aria-label={stage.label}>
                  <header>
                    <h2>{stage.label}</h2>
                    <span>{cards.length}</span>
                  </header>
                  {cards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className="lead-card"
                      data-testid="lead-card"
                      onClick={() => setOpenId(card.id)}
                    >
                      <span className="card-top">
                        <ChannelMark channel={card.channel} />
                        <ScoreRing score={card.score} />
                      </span>
                      <strong>{card.label}</strong>
                      <span className="card-meta">
                        {card.area || 'Area open'} · {card.budget || 'Budget open'}
                      </span>
                      {card.synthetic ? <em>Synthetic</em> : <em>This process</em>}
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
          {open ? (
            <section className="drawer" data-testid="transcript-drawer" aria-label="Transcript">
              <header>
                <div>
                  <p className="eyebrow">{open.synthetic ? 'Synthetic thread' : 'Live thread'}</p>
                  <h2>{open.label}</h2>
                </div>
                <button type="button" onClick={() => setOpenId(null)}>
                  Close
                </button>
              </header>
              <div className="bubbles">
                {open.transcript.length === 0 ? (
                  <p className="empty">No messages yet.</p>
                ) : (
                  open.transcript.map((message) => (
                    <article key={message.id} className={`bubble ${message.role}`}>
                      <p>{message.text}</p>
                      <time dateTime={message.createdAt}>{clock(message.createdAt)}</time>
                    </article>
                  ))
                )}
              </div>
            </section>
          ) : null}
        </div>
        <section className="week" data-testid="tour-calendar" aria-label="Week of tours">
          <h2>Next 7 days</h2>
          <div className="week-grid">
            {week.map((day) => (
              <div key={day.key} className="day">
                <span>{day.weekday}</span>
                <strong>{day.date}</strong>
                {day.tours.map((tour) => (
                  <p key={tour.id}>
                    {tour.time}
                    <br />
                    {tour.title}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Spark({ points }: { points: number[] }) {
  const max = Math.max(1, ...points);
  const width = 120;
  const height = 28;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const d = points
    .map((point, index) => {
      const x = index * step;
      const y = height - (point / max) * (height - 2) - 1;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}
