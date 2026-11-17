import { channelPercentiles } from '@/domain/metrics/percentile';
import { getContainer } from '@/server/container';
import { guarded } from '@/server/finish';
import { json } from '@/adapters/http/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return guarded(request, 'leads', async (requestId) => {
    const container = getContainer();
    await container.ready;
    const leads = await container.repo.listLeads();
    const appointments = await container.repo.listAppointments();
    const samples = await container.repo.listLatencies();
    return json(
      {
        leads: leads.map((lead) => ({
          id: lead.id,
          channel: lead.channel,
          score: lead.score,
          stage: lead.stage,
          slots: lead.slots,
          appointmentId: lead.appointmentId ?? null,
          conversationId: lead.conversationId,
          updatedAt: lead.updatedAt,
        })),
        appointments,
        metrics: channelPercentiles(samples),
      },
      200,
      requestId,
    );
  });
}
