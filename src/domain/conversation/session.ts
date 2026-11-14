import type { Channel, Session } from '../types';

export function createSession(input: { id: string; leadId: string; channel: Channel }): Session {
  return {
    id: input.id,
    leadId: input.leadId,
    channel: input.channel,
    stage: 'greeting',
    slots: {},
    language: 'en',
    optedOut: false,
    handoff: false,
    listingIds: [],
    turnCount: 0,
  };
}
