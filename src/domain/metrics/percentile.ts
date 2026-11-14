/** Inclusive nearest-rank percentile. Returns null when there are no samples. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (p <= 0) return [...values].sort((a, b) => a - b)[0] ?? null;
  if (p >= 100) return [...values].sort((a, b) => a - b).at(-1) ?? null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? null;
}

export function channelPercentiles(
  samples: readonly { channel: string; latencyMs: number }[],
): Record<string, { count: number; p50: number | null; p95: number | null }> {
  const grouped = new Map<string, number[]>();
  for (const sample of samples) {
    const list = grouped.get(sample.channel) ?? [];
    list.push(sample.latencyMs);
    grouped.set(sample.channel, list);
  }
  const result: Record<string, { count: number; p50: number | null; p95: number | null }> = {};
  for (const [channel, values] of grouped) {
    result[channel] = {
      count: values.length,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
    };
  }
  return result;
}
