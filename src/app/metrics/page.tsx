import { channelPercentiles } from '@/domain/metrics/percentile';
import { CHANNELS } from '@/domain/types';
import { getContainer } from '@/server/container';

const CHANNEL_LABEL = {
  web: 'Site chat',
  sms: 'SMS',
  email: 'Email',
  instagram: 'Instagram',
  voice: 'Voice',
} as const;

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Latency' };

export default function MetricsPage() {
  const samples = getContainer().repo.listLatencies();
  const measured = channelPercentiles(samples);
  const rows = CHANNELS.filter((channel) => channel !== 'voice').map((channel) => {
    const row = measured[channel];
    return {
      channel,
      label: CHANNEL_LABEL[channel],
      count: row?.count ?? 0,
      p50: row?.p50 ?? null,
      p95: row?.p95 ?? null,
    };
  });
  const bins = histogram(samples.map((sample) => sample.latencyMs));
  const peak = Math.max(1, ...bins.map((bin) => bin.count));
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
        ) : (
          <figure className="hist">
            <figcaption>Histogram of measured reply time, this process only.</figcaption>
            <div className="bars" aria-hidden="true">
              {bins.map((bin) => (
                <div key={bin.label}>
                  <span style={{ height: `${Math.max(8, (bin.count / peak) * 140)}px` }} />
                  <small>{bin.label}</small>
                </div>
              ))}
            </div>
          </figure>
        )}
        <table className="metric-table">
          <caption className="sr-only">Reply latency by channel, this process only.</caption>
          <thead>
            <tr>
              <th scope="col">Channel</th>
              <th scope="col">Samples</th>
              <th scope="col">p50 ms</th>
              <th scope="col">p95 ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.channel} data-testid={`metric-${row.channel}`}>
                <th scope="row">{row.label}</th>
                <td>{row.count}</td>
                <td data-testid={`metric-p50-${row.channel}`}>
                  {row.p50 === null ? '—' : row.p50}
                </td>
                <td data-testid={`metric-p95-${row.channel}`}>
                  {row.p95 === null ? '—' : row.p95}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function histogram(values: number[]): { label: string; count: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const bins = 6;
  const counts = Array.from({ length: bins }, () => 0);
  for (const value of values) {
    const index = Math.min(bins - 1, Math.floor(((value - min) / span) * bins));
    const bucket = counts[index];
    if (bucket !== undefined) counts[index] = bucket + 1;
  }
  return counts.map((count, index) => {
    const from = Math.round(min + (span * index) / bins);
    const to = Math.round(min + (span * (index + 1)) / bins);
    return { count, label: `${from}–${to}` };
  });
}
