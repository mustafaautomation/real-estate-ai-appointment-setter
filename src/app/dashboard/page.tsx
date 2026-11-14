import { addCivilDays, zonedParts } from '@/domain/booking/time';
import { propertyLabel } from '@/domain/qualification/slots';
import type { Lead, Slots } from '@/domain/types';
import { Inbox, type InboxCard, type Kpi, type WeekDay } from '@/components/inbox';
import { getContainer } from '@/server/container';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inbox' };

export default async function DashboardPage() {
  const container = getContainer();
  await container.ready;
  const leads = container.repo.listLeads();
  const tours = container.repo
    .listAppointments()
    .filter((appointment) => appointment.status === 'booked');
  const cards: InboxCard[] = leads.map((lead) => ({
    id: lead.id,
    synthetic: lead.externalUserId.startsWith('synthetic:'),
    channel: lead.channel,
    stage: lead.stage,
    score: lead.score,
    label: cardLabel(lead),
    budget: budgetLabel(lead.slots),
    area: lead.slots.area ?? '',
    preview: previewFor(container.repo.listMessages(lead.conversationId)),
    transcript: container.repo.listMessages(lead.conversationId).map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
    })),
  }));
  const week = buildWeek(container.timeZone, tours, leads);
  const kpis = buildKpis(leads, tours, container.timeZone);
  return (
    <main className="page">
      <div className="section-label">
        <h1>Inbox</h1>
        <p>
          Synthetic seed plus anyone who writes in during this process. Scores come from filled
          slots.
        </p>
      </div>
      <Inbox leads={cards} week={week} kpis={kpis} />
    </main>
  );
}

function cardLabel(lead: Lead): string {
  const kind =
    lead.channel === 'web'
      ? 'Site chat'
      : lead.channel === 'sms'
        ? 'SMS'
        : lead.channel === 'email'
          ? 'Email'
          : lead.channel === 'instagram'
            ? 'Instagram'
            : 'Voice';
  const bits: string[] = [];
  if (lead.slots.beds !== undefined && lead.slots.propertyType) {
    bits.push(`${lead.slots.beds}-bed ${propertyLabel(lead.slots.propertyType)}`);
  } else if (lead.slots.propertyType) bits.push(propertyLabel(lead.slots.propertyType));
  if (lead.slots.area) bits.push(lead.slots.area);
  return bits.length > 0 ? `${kind} · ${bits.join(' ')}` : kind;
}

function tourTitle(lead: Lead): string {
  const who = cardLabel(lead).split(' · ')[0] ?? 'Lead';
  return lead.slots.area ? `${who} · ${lead.slots.area}` : who;
}

function previewFor(messages: { role: string; text: string }[]): string {
  const first = messages.find((message) => message.role === 'user');
  if (!first) return '';
  return first.text.length > 72 ? `${first.text.slice(0, 69)}…` : first.text;
}

function budgetLabel(slots: Slots): string {
  if (slots.budget?.max !== undefined) {
    return `under $${slots.budget.max.toLocaleString('en-US')}`;
  }
  return '';
}

function buildWeek(
  timeZone: string,
  tours: { id: string; start: string; leadId: string; status: string }[],
  leads: Lead[],
): WeekDay[] {
  const days: WeekDay[] = [];
  for (let index = 0; index < 7; index += 1) {
    const parts = addCivilDays(new Date(), timeZone, index);
    const toursToday = tours
      .filter((tour) => {
        const when = zonedParts(new Date(tour.start), timeZone);
        return when.year === parts.year && when.month === parts.month && when.day === parts.day;
      })
      .map((tour) => {
        const lead = leads.find((item) => item.id === tour.leadId);
        return {
          id: tour.id,
          time: new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(tour.start)),
          title: lead ? tourTitle(lead) : 'Tour',
        };
      });
    days.push({
      key: `${parts.year}-${parts.month}-${parts.day}`,
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parts.weekday] ?? '',
      date: String(parts.day),
      tours: toursToday,
    });
  }
  return days;
}

function buildKpis(
  leads: Lead[],
  tours: { createdAt?: string; start: string }[],
  timeZone: string,
): Kpi[] {
  const days = Array.from({ length: 7 }, (_, index) =>
    addCivilDays(new Date(), timeZone, index - 6),
  );
  const onDay = (iso: string, index: number) => {
    const when = zonedParts(new Date(iso), timeZone);
    const day = days[index];
    if (!day) return false;
    return when.year === day.year && when.month === day.month && when.day === day.day;
  };
  const leadPoints = days.map(
    (_, index) => leads.filter((lead) => onDay(lead.createdAt, index)).length,
  );
  const tourPoints = days.map(
    (_, index) => tours.filter((tour) => onDay(tour.start, index)).length,
  );
  const qualifiedPoints = days.map(
    (_, index) =>
      leads.filter(
        (lead) =>
          (lead.stage === 'qualified' || lead.stage === 'booked') && onDay(lead.createdAt, index),
      ).length,
  );
  return [
    { label: 'Leads in process', value: leads.length, points: leadPoints },
    { label: 'Tours booked', value: tours.length, points: tourPoints },
    {
      label: 'Qualified or booked',
      value: leads.filter((lead) => lead.stage === 'qualified' || lead.stage === 'booked').length,
      points: qualifiedPoints,
    },
  ];
}
