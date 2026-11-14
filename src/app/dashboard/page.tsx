import { formatWhen } from '@/domain/booking/time';
import { leadLabel } from '@/domain/mask';
import { propertyLabel, timelineLabel } from '@/domain/qualification/slots';
import type { Lead, PipelineStage, Slots } from '@/domain/types';
import { PIPELINE_STAGES } from '@/domain/types';
import { getContainer } from '@/server/container';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inbox' };

const STAGE_LABEL: Record<PipelineStage, string> = {
  new: 'New',
  qualifying: 'Qualifying',
  qualified: 'Qualified',
  booked: 'Booked',
  handoff: 'Handoff',
  opted_out: 'Opted out',
};

export default function DashboardPage() {
  const container = getContainer();
  const leads = container.repo.listLeads();
  const tours = container.repo
    .listAppointments()
    .filter((appointment) => appointment.status === 'booked');
  return (
    <main className="page dash">
      <section>
        <div className="section-label">
          <h1>Inbox</h1>
          <p>Leads in this process. Scores are computed from filled slots.</p>
        </div>
        {leads.length === 0 ? (
          <p className="empty" data-testid="inbox-empty">
            No leads in this process yet.
          </p>
        ) : (
          <>
            <div className="pipeline" aria-label="Pipeline counts">
              {PIPELINE_STAGES.map((stage) => (
                <section key={stage} className="column">
                  <h2>{STAGE_LABEL[stage]}</h2>
                  <p className="count">{leads.filter((lead) => lead.stage === stage).length}</p>
                </section>
              ))}
            </div>
            <div className="lead-list">
              {leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} timeZone={container.timeZone} />
              ))}
            </div>
          </>
        )}
      </section>
      <aside className="dash-side">
        <article className="panel">
          <h2>Tours</h2>
          {tours.length === 0 ? (
            <p className="empty" data-testid="tour-empty">
              No tours booked in this process.
            </p>
          ) : (
            <ul className="tours" data-testid="tour-list">
              {tours.map((tour) => (
                <li key={tour.id}>{formatWhen(tour.start, container.timeZone)}</li>
              ))}
            </ul>
          )}
        </article>
      </aside>
    </main>
  );
}

function LeadCard({ lead, timeZone }: { lead: Lead; timeZone: string }) {
  const container = getContainer();
  const messages = container.repo.listMessages(lead.conversationId);
  const appointment = lead.appointmentId
    ? container.repo.listAppointments().find((item) => item.id === lead.appointmentId)
    : undefined;
  return (
    <details className="lead" data-testid="lead-row">
      <summary>
        <strong>{lead.score}</strong>
        <span>{STAGE_LABEL[lead.stage]}</span>
        <span>{leadLabel(lead.channel, summary(lead.slots))}</span>
      </summary>
      <div className="transcript">
        {appointment && appointment.status === 'booked' ? (
          <p>Booked {formatWhen(appointment.start, timeZone)}</p>
        ) : null}
        {messages.map((message) => (
          <p key={message.id}>
            <b>{message.role === 'user' ? 'Lead' : 'Desk'}. </b>
            {message.text}
          </p>
        ))}
      </div>
    </details>
  );
}

function summary(slots: Slots): string {
  const bits: string[] = [];
  if (slots.beds !== undefined) bits.push(`${slots.beds}-bed`);
  if (slots.propertyType) bits.push(propertyLabel(slots.propertyType));
  if (slots.area) bits.push(slots.area);
  if (slots.timeline) bits.push(timelineLabel(slots.timeline));
  return bits.join(' ');
}
