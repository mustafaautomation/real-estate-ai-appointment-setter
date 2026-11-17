import { AppError } from '@/domain/errors';
import { getContainer } from '@/server/container';
import { guarded } from '@/server/finish';
import { json } from '@/adapters/http/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return guarded(request, 'leads', async (requestId) => {
    const { id } = await context.params;
    const container = getContainer();
    await container.ready;
    const lead = await container.repo.getLead(id);
    if (!lead) throw new AppError('not_found', 'Lead not found', 404);
    const transcript = await container.repo.listMessages(lead.conversationId);
    return json(
      {
        lead: {
          id: lead.id,
          channel: lead.channel,
          score: lead.score,
          stage: lead.stage,
          slots: lead.slots,
          appointmentId: lead.appointmentId ?? null,
          conversationId: lead.conversationId,
          updatedAt: lead.updatedAt,
        },
        transcript: transcript.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.text,
          mode: message.mode ?? null,
          latencyMs: message.latencyMs ?? null,
          createdAt: message.createdAt,
        })),
      },
      200,
      requestId,
    );
  });
}
