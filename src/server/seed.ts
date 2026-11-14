import { createSession } from '@/domain/conversation/session';
import { qualificationScore } from '@/domain/qualification/score';
import type { Channel, PipelineStage, Slots } from '@/domain/types';

import type { Container } from './container';

type Profile = {
  key: string;
  channel: Channel;
  stage: PipelineStage;
  slots: Slots;
  daysAgo: number;
  book: boolean;
};

function openingLine(profile: Profile): string {
  if (profile.key === '01') return 'Hi, are you free to chat about a place?';
  if (profile.key === '02') return 'Saw the post. Is it still available?';
  if (profile.slots.area && profile.slots.beds) {
    return `Synthetic note. Looking at ${profile.slots.beds} bedrooms in ${profile.slots.area}.`;
  }
  if (profile.slots.area) return `Synthetic note. Curious about ${profile.slots.area}.`;
  return 'Synthetic note. Just starting to look.';
}

const PROFILES: readonly Profile[] = [
  { key: '01', channel: 'sms', stage: 'new', slots: {}, daysAgo: 1, book: false },
  { key: '02', channel: 'instagram', stage: 'new', slots: {}, daysAgo: 0, book: false },
  {
    key: '03',
    channel: 'web',
    stage: 'qualifying',
    slots: { propertyType: 'condo', beds: 2 },
    daysAgo: 2,
    book: false,
  },
  {
    key: '04',
    channel: 'email',
    stage: 'qualifying',
    slots: { propertyType: 'townhouse', area: 'Old Keel' },
    daysAgo: 3,
    book: false,
  },
  {
    key: '05',
    channel: 'sms',
    stage: 'qualified',
    slots: {
      propertyType: 'condo',
      beds: 2,
      area: 'Glassmarket',
      budget: { max: 520_000, currency: 'USD' },
      timeline: 'browsing',
    },
    daysAgo: 4,
    book: false,
  },
  {
    key: '06',
    channel: 'instagram',
    stage: 'qualified',
    slots: {
      propertyType: 'single_family',
      beds: 4,
      area: 'Reed Shores',
      budget: { max: 1_150_000, currency: 'USD' },
      timeline: '90_days',
    },
    daysAgo: 5,
    book: false,
  },
  {
    key: '07',
    channel: 'email',
    stage: 'booked',
    slots: {
      propertyType: 'single_family',
      beds: 4,
      area: 'North Wharf',
      budget: { max: 1_100_000, currency: 'USD' },
      timeline: '30_days',
    },
    daysAgo: 2,
    book: true,
  },
  {
    key: '08',
    channel: 'web',
    stage: 'booked',
    slots: {
      propertyType: 'townhouse',
      beds: 3,
      area: 'Old Keel',
      budget: { max: 600_000, currency: 'USD' },
      timeline: 'asap',
    },
    daysAgo: 1,
    book: true,
  },
  {
    key: '09',
    channel: 'sms',
    stage: 'booked',
    slots: {
      propertyType: 'multi_family',
      beds: 3,
      area: 'Millcross',
      budget: { max: 800_000, currency: 'USD' },
      timeline: '90_days',
    },
    daysAgo: 6,
    book: true,
  },
  {
    key: '10',
    channel: 'instagram',
    stage: 'handoff',
    slots: { propertyType: 'condo', area: 'Glassmarket' },
    daysAgo: 3,
    book: false,
  },
  {
    key: '11',
    channel: 'email',
    stage: 'handoff',
    slots: { beds: 3, area: 'North Wharf' },
    daysAgo: 4,
    book: false,
  },
  { key: '12', channel: 'sms', stage: 'opted_out', slots: {}, daysAgo: 5, book: false },
];

export async function seedDemo(container: Container): Promise<void> {
  if (container.repo.listLeads().length > 0) return;
  const now = new Date();
  const open = await container.calendar.listOpen(now);
  let slotCursor = 0;
  for (const profile of PROFILES) {
    const created = new Date(now.getTime() - profile.daysAgo * 24 * 60 * 60 * 1000).toISOString();
    const leadId = `synthetic-lead-${profile.key}`;
    const conversationId = `synthetic-conversation-${profile.key}`;
    const session = createSession({ id: conversationId, leadId, channel: profile.channel });
    session.slots = profile.slots;
    session.stage =
      profile.stage === 'booked'
        ? 'booked'
        : profile.stage === 'handoff'
          ? 'handoff'
          : profile.stage === 'opted_out'
            ? 'opted_out'
            : profile.stage === 'new'
              ? 'greeting'
              : 'collecting';
    session.turnCount = profile.stage === 'new' ? 0 : 2;
    session.handoff = profile.stage === 'handoff';
    session.optedOut = profile.stage === 'opted_out';
    container.repo.upsertConversation({
      id: conversationId,
      leadId,
      channel: profile.channel,
      externalUserId: `synthetic:${profile.key}`,
      session,
      createdAt: created,
      updatedAt: created,
    });
    container.repo.upsertLead({
      id: leadId,
      channel: profile.channel,
      externalUserId: `synthetic:${profile.key}`,
      score: qualificationScore(profile.slots),
      stage: profile.stage,
      slots: profile.slots,
      conversationId,
      createdAt: created,
      updatedAt: created,
    });
    container.repo.addMessage({
      id: `synthetic-msg-${profile.key}-user`,
      conversationId,
      role: 'user',
      text: openingLine(profile),
      channel: profile.channel,
      createdAt: created,
    });
    if (profile.stage !== 'new') {
      container.repo.addMessage({
        id: `synthetic-msg-${profile.key}-desk`,
        conversationId,
        role: 'assistant',
        text:
          profile.stage === 'opted_out'
            ? 'You are opted out. I will not send more texts. Reply START to resume.'
            : 'Synthetic sample reply from the desk. This thread is not a recorded lead.',
        channel: profile.channel,
        createdAt: created,
        mode: 'offline',
      });
    }
  }
  slotCursor = 0;
  for (const profile of PROFILES) {
    if (!profile.book) continue;
    const slot = open[Math.min(slotCursor, open.length - 1)];
    slotCursor += 18;
    if (!slot) continue;
    const leadId = `synthetic-lead-${profile.key}`;
    const conversationId = `synthetic-conversation-${profile.key}`;
    const appointment = await container.calendar.book(slot.id, leadId, conversationId);
    container.repo.upsertAppointment(appointment);
    const lead = container.repo.getLead(leadId);
    const conversation = container.repo.getConversation(conversationId);
    if (lead) {
      lead.appointmentId = appointment.id;
      container.repo.upsertLead(lead);
    }
    if (conversation) {
      conversation.session.appointmentId = appointment.id;
      container.repo.upsertConversation(conversation);
    }
  }
}
