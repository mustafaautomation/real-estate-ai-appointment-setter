import type { Channel } from './types';

export function leadLabel(channel: Channel, slotsSummary: string): string {
  const channelName =
    channel === 'web'
      ? 'Site chat'
      : channel === 'sms'
        ? 'SMS'
        : channel === 'email'
          ? 'Email'
          : channel === 'instagram'
            ? 'Instagram'
            : 'Voice';
  if (!slotsSummary) return channelName;
  return `${channelName} · ${slotsSummary}`;
}
