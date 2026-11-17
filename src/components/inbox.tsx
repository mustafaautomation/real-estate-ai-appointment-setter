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
  preview: string;
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
                <section
                  key={stage.id}
                  className={`lane lane-${stage.id}`}
                  aria-label={stage.label}
                >
                  <header>
                    <h2>{stage.label}</h2>
                    <span>{cards.length}</span>
                  </header>
                  {cards.length === 0 ? <p className="lane-empty">No leads</p> : null}
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
                      <span className="card-meta">{cardMeta(card)}</span>
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
                <div className="day-label">
                  <span>{day.weekday}</span>
                  <strong>{day.date}</strong>
                </div>
                <div className="day-tours">
                  {day.tours.map((tour) => (
                    <p key={tour.id} className="tour-chip">
                      <b>{tour.time}</b>
                      <span>{tour.title}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function cardMeta(card: InboxCard): string {
  if (card.area || card.budget) {
    return [card.area, card.budget].filter((part) => part.length > 0).join(' · ');
  }
  return card.preview || 'New note';
}

function Spark({ points }: { points: number[] }) {
  const max = Math.max(1, ...points);
  const width = 120;
  const height = 36;
  const pad = 4;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const d = points
    .map((point, index) => {
      const x = index * step;
      const y = pad + (1 - point / max) * (height - pad * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <line className="spark-base" x1="0" y1={height - 1} x2={width} y2={height - 1} />
      <path d={d} />
    </svg>
  );
}

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}
