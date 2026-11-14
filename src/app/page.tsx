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
        <div className="hero-copy">
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
        </div>
        <div className="stage" aria-hidden="true">
          <article className="float ig">
            <span>Instagram</span>
            <p>3-bed condo in Lantern Hill?</p>
          </article>
          <article className="float sms">
            <span>SMS</span>
            <p>Under 700k, within 30 days.</p>
          </article>
          <article className="float mail">
            <span>Email</span>
            <p>Can we tour this week?</p>
          </article>
          <article className="thread-card">
            <header>
              <strong>One thread</strong>
              <em>Desk</em>
            </header>
            <p className="line l1">Looking at a 3-bedroom condo.</p>
            <p className="line l2">Lantern Hill, under $700,000.</p>
            <div className="chip-row">
              <span>Condo</span>
              <span>3 bd</span>
              <span>Lantern Hill</span>
              <span>$700k</span>
              <span>30 days</span>
            </div>
            <div className="book-card">
              <span className="cal" />
              <div>
                <b>Tour booked</b>
                <small>Weekday morning · Cedar Bay</small>
              </div>
            </div>
            <span className="flow-packet" data-testid="flow-packet" />
          </article>
        </div>
      </section>
      <section className="pipeline-visual" aria-label="Path from channel to a booked tour">
        <div className="pipe">
          <div>
            <span>Channel</span>
            <strong>Four inboxes</strong>
          </div>
          <i />
          <div>
            <span>Engine</span>
            <strong>One machine</strong>
          </div>
          <i />
          <div>
            <span>Qualify</span>
            <strong>Five slots</strong>
          </div>
          <i />
          <div>
            <span>Booked</span>
            <strong>Open slot only</strong>
          </div>
        </div>
      </section>
      <section className="mocks">
        <article className="mock">
          <h2>Reply</h2>
          <div className="mini-chat">
            <p className="me">Under 700k in Lantern Hill.</p>
            <p className="desk">I can hold a weekday tour once the timeline is set.</p>
          </div>
        </article>
        <article className="mock">
          <h2>Qualify</h2>
          <ul className="mini-slots">
            <li>Condo</li>
            <li>3 bedrooms</li>
            <li>Lantern Hill</li>
            <li>Under $700k</li>
            <li>30 days</li>
          </ul>
        </article>
        <article className="mock">
          <h2>Book</h2>
          <div className="mini-cal">
            <span>Mon</span>
            <span>Tue</span>
            <span className="held">Wed 9:00</span>
            <span>Thu</span>
            <span>Fri</span>
          </div>
        </article>
      </section>
    </main>
  );
}
