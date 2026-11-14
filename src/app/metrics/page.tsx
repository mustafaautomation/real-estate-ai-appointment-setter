import { channelPercentiles } from '@/domain/metrics/percentile';
import { CHANNELS } from '@/domain/types';
import { getContainer } from '@/server/container';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Latency' };

export default function MetricsPage() {
  const samples = getContainer().repo.listLatencies();
  const measured = channelPercentiles(samples);
  const rows = CHANNELS.filter((channel) => channel !== 'voice').map((channel) => {
    const row = measured[channel];
    return { channel, count: row?.count ?? 0, p50: row?.p50 ?? null, p95: row?.p95 ?? null };
  });
  return (
    <main className="page metrics">
      <section>
        <div className="section-label">
          <h1>Latency</h1>
          <p>
            Nearest-rank p50 and p95 for replies measured in this process. Empty cells are not
            zeros.
          </p>
        </div>
        {samples.length === 0 ? (
          <p className="empty" data-testid="metrics-empty">
            No replies measured in this process yet.
          </p>
        ) : null}
        <div className="metric-table">
          <div className="metric-head">
            <span>Channel</span>
            <span>Samples</span>
            <span>p50 ms</span>
            <span>p95 ms</span>
          </div>
          {rows.map((row) => (
            <div className="metric-row" key={row.channel} data-testid={`metric-${row.channel}`}>
              <span>{row.channel}</span>
              <span>{row.count}</span>
              <span data-testid={`metric-p50-${row.channel}`}>
                {row.p50 === null ? '—' : row.p50}
              </span>
              <span data-testid={`metric-p95-${row.channel}`}>
                {row.p95 === null ? '—' : row.p95}
              </span>
            </div>
          ))}
        </div>
      </section>
      <aside className="metric-side">
        <article className="panel">
          <h2>Scope</h2>
          <p>{samples.length} stored replies. Numbers are not carried over from another run.</p>
        </article>
      </aside>
    </main>
  );
}
