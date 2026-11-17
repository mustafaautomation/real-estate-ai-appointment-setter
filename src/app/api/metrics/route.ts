import { json } from '@/adapters/http/respond';
import { CHANNELS } from '@/domain/types';
import { channelPercentiles } from '@/domain/metrics/percentile';
import { getContainer } from '@/server/container';
import { guarded } from '@/server/finish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return guarded(request, 'metrics', async (requestId) => {
    const container = getContainer();
    await container.ready;
    const samples = await container.repo.listLatencies();
    const measured = channelPercentiles(samples);
    const channels = CHANNELS.filter((channel) => channel !== 'voice').map((channel) => {
      const row = measured[channel];
      return {
        channel,
        count: row?.count ?? 0,
        p50: row?.p50 ?? null,
        p95: row?.p95 ?? null,
      };
    });
    return json(
      {
        method: 'nearest-rank',
        scope: container.storage === 'd1' ? 'd1' : 'this-process',
        channels,
        sampleCount: samples.length,
      },
      200,
      requestId,
    );
  });
}
