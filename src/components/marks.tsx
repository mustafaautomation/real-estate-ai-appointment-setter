import type { Channel } from '@/domain/types';

export function ScoreRing({ score }: { score: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, score));
  const offset = circumference - (filled / 100) * circumference;
  return (
    <span className="ring" title={`Qualification score ${score}`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} className="ring-track" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          className="ring-value"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span>{score}</span>
    </span>
  );
}

export function ChannelMark({ channel }: { channel: Channel }) {
  const label =
    channel === 'web'
      ? 'Web'
      : channel === 'sms'
        ? 'SMS'
        : channel === 'email'
          ? 'Email'
          : channel === 'instagram'
            ? 'IG'
            : 'Voice';
  return (
    <span className={`mark mark-${channel}`} aria-hidden="true">
      {label}
    </span>
  );
}
