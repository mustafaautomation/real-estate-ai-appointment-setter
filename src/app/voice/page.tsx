export const metadata = { title: 'Voice stub' };

export default function VoicePage() {
  return (
    <main className="page">
      <div className="section-label">
        <h1>Voice is not live</h1>
        <p>The webhook validates tool calls and does not place a call or book a tour.</p>
      </div>
      <ol className="call-flow">
        <li>
          <span>01</span>
          <h2>Call hits the stub</h2>
          <p>A vendor would POST a tool call. Nothing is dialed.</p>
        </li>
        <li>
          <span>02</span>
          <h2>Schema check</h2>
          <p>qualify_lead or book_appointment is validated and then dropped.</p>
        </li>
        <li>
          <span>03</span>
          <h2>Same desk, if it were on</h2>
          <p>Slots and the calendar port would match chat. That path is off.</p>
        </li>
      </ol>
      <section className="split">
        <article className="panel">
          <h2>POST /api/webhooks/voice</h2>
          <p>Tools: qualify_lead, book_appointment. Both are schemas only.</p>
          <p className="fine">A provider such as Vapi or Retell is not connected.</p>
        </article>
        <article className="panel">
          <h2>What a call would do</h2>
          <p>
            The same qualification slots and calendar port as chat. That path is described in
            docs/voice.md and is not enabled.
          </p>
        </article>
      </section>
    </main>
  );
}
