import { z } from 'zod';

import type { Channel } from '@/domain/types';

export type ParsedInbound = {
  channel: Exclude<Channel, 'voice'>;
  externalUserId: string;
  externalMessageId: string;
  text: string;
  subject?: string;
};

export const smsSchema = z.object({
  MessageSid: z.string().min(1).max(128),
  From: z.string().min(3).max(40),
  To: z.string().min(3).max(40),
  Body: z.string().min(1).max(4000),
  AccountSid: z.string().min(1).max(64).optional(),
});

export const emailSchema = z.object({
  messageId: z.string().min(1).max(200),
  from: z.string().min(3).max(200),
  to: z.string().min(3).max(200),
  subject: z.string().max(300).optional().default(''),
  text: z.string().min(1).max(8000),
});

export const instagramSchema = z.object({
  object: z.literal('instagram'),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        messaging: z
          .array(
            z.object({
              sender: z.object({ id: z.string().min(1) }),
              recipient: z.object({ id: z.string().min(1) }),
              timestamp: z.number().optional(),
              message: z.object({
                mid: z.string().min(1),
                text: z.string().min(1).max(4000),
              }),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export const qualifyLeadArgs = z
  .object({
    budgetMax: z.number().int().positive().optional(),
    area: z.string().min(1).max(80).optional(),
    beds: z.number().int().positive().max(12).optional(),
    propertyType: z.enum(['condo', 'townhouse', 'single_family', 'multi_family']).optional(),
    timeline: z.enum(['asap', '30_days', '90_days', '6_months', 'browsing']).optional(),
  })
  .strict();

export const bookAppointmentArgs = z
  .object({
    leadId: z.string().min(1).max(80),
    slotId: z.string().min(1).max(200).optional(),
    preference: z.enum(['earliest', 'morning', 'afternoon']).optional(),
  })
  .strict();

export const voiceToolSchema = z.object({
  callId: z.string().min(1).max(120),
  tool: z.discriminatedUnion('name', [
    z.object({ name: z.literal('qualify_lead'), arguments: qualifyLeadArgs }),
    z.object({ name: z.literal('book_appointment'), arguments: bookAppointmentArgs }),
  ]),
});

export const chatSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
});

export const simulatorSchema = z.object({
  channel: z.enum(['sms', 'email', 'instagram']),
  text: z.string().trim().min(1).max(4000),
  externalUserId: z.string().trim().min(3).max(120),
  externalMessageId: z.string().trim().min(3).max(120).optional(),
});

export function parseSms(params: Record<string, string>): ParsedInbound {
  const body = smsSchema.parse(params);
  return {
    channel: 'sms',
    externalUserId: body.From,
    externalMessageId: body.MessageSid,
    text: body.Body,
  };
}

export function parseEmail(payload: unknown): ParsedInbound {
  const body = emailSchema.parse(payload);
  return {
    channel: 'email',
    externalUserId: body.from,
    externalMessageId: body.messageId,
    text: body.text,
    subject: body.subject,
  };
}

export function parseInstagram(payload: unknown): ParsedInbound {
  const body = instagramSchema.parse(payload);
  const event = body.entry[0]?.messaging[0];
  if (!event) throw new Error('instagram payload has no message');
  return {
    channel: 'instagram',
    externalUserId: event.sender.id,
    externalMessageId: event.message.mid,
    text: event.message.text,
  };
}
