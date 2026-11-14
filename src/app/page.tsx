import Link from 'next/link';

import { configuredLlmMode } from '@/adapters/llm/model';
import { getContainer } from '@/server/container';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const mode = configuredLlmMode();
  const container = getContainer();
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Harborline Desk · synthetic demo</p>
        <h1>
          Every lead.
          <br />
          One desk.
        </h1>
        <p className="lede">
          Instagram, SMS, email, and site chat share one qualification path. Budget, area, beds,
          type, timeline, then a tour.
        </p>
        <p className="fine">
          {mode === 'openai'
            ? 'Phrasing can use OpenAI. If a call fails, that reply is marked offline fallback.'
            : 'Replies on this run are templates. No model is called.'}
        </p>
        <div className="actions">
          <Link className="button" href="/chat">
            Open chat
          </Link>
          <Link className="button ghost" href="/simulator">
            Simulate a channel
          </Link>
        </div>
        <ul className="status">
          <li>Storage {container.storage}</li>
          <li>Calendar {container.calendarName}</li>
          <li>Voice stub</li>
        </ul>
      </section>
      <section className="flow" aria-label="Path from channel to a booked tour" data-testid="flow">
        <div className="packet" data-testid="flow-packet" aria-hidden="true">
          New lead · 3-bed condo · Lantern Hill
        </div>
        <ol className="stations">
          <li data-testid="flow-node">
            <span>01</span>
            <strong>Channel</strong>
          </li>
          <li>
            <span>02</span>
            <strong>Engine</strong>
          </li>
          <li>
            <span>03</span>
            <strong>Qualify</strong>
          </li>
          <li>
            <span>04</span>
            <strong>Booked</strong>
          </li>
        </ol>
      </section>
      <section className="beats">
        <article>
          <h2>Reply</h2>
          <p>
            One state machine answers every channel. The thread does not stop at three messages.
          </p>
        </article>
        <article>
          <h2>Qualify</h2>
          <p>
            Budget, area, beds, property type, and timeline. Listings come from a fixed synthetic
            set.
          </p>
        </article>
        <article>
          <h2>Book</h2>
          <p>Weekday slots, 9:00–17:00 America/Chicago. A taken slot stays taken.</p>
        </article>
      </section>
      <section className="split">
        <article className="example">
          <h2>Example path</h2>
          <p className="fine">Illustration only. Not a recorded lead.</p>
          <ol>
            <li>
              <b>Lead</b>
              <span>3-bed condo in Lantern Hill, under $700k.</span>
            </li>
            <li>
              <b>Desk</b>
              <span>Timeline is still open. When do you want to move?</span>
            </li>
            <li>
              <b>Lead</b>
              <span>Within 30 days. Book the earliest tour.</span>
            </li>
            <li>
              <b>Desk</b>
              <span>The tour is booked on the next open weekday slot.</span>
            </li>
          </ol>
        </article>
        <article className="panel">
          <h2>Target</h2>
          <p>
            Answer inside 30 seconds. Latency on the Latency page is measured in this process only.
          </p>
          <p className="fine">No published response-time result is shown here.</p>
        </article>
      </section>
    </main>
  );
}
