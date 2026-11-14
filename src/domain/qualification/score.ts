import type { Slots } from '../types';
import { SLOT_KEYS } from '../types';

/**
 * Qualification score, computed from captured slots only.
 * 16 points for each of budget, area, beds, property type, and timeline (80).
 * Timeline weight: asap 20, 30 days 14, 90 days 8, 6 months 4, browsing 2.
 * Capped at 100.
 */
export function qualificationScore(slots: Slots): number {
  const filled = SLOT_KEYS.filter((key) => {
    if (key === 'budget') return slots.budget?.max !== undefined;
    return slots[key] !== undefined;
  }).length;
  const urgency =
    slots.timeline === 'asap'
      ? 20
      : slots.timeline === '30_days'
        ? 14
        : slots.timeline === '90_days'
          ? 8
          : slots.timeline === '6_months'
            ? 4
            : slots.timeline === 'browsing'
              ? 2
              : 0;
  return Math.min(100, filled * 16 + urgency);
}

export function pipelineStage(input: {
  optedOut: boolean;
  handoff: boolean;
  appointmentId?: string;
  slots: Slots;
  turnCount: number;
}): 'new' | 'qualifying' | 'qualified' | 'booked' | 'handoff' | 'opted_out' {
  if (input.optedOut) return 'opted_out';
  if (input.handoff) return 'handoff';
  if (input.appointmentId) return 'booked';
  if (qualificationScore(input.slots) >= 80 && filledRequired(input.slots)) return 'qualified';
  if (input.turnCount > 0) return 'qualifying';
  return 'new';
}

function filledRequired(slots: Slots): boolean {
  return (
    slots.budget?.max !== undefined &&
    Boolean(slots.area) &&
    slots.beds !== undefined &&
    Boolean(slots.propertyType) &&
    Boolean(slots.timeline)
  );
}
