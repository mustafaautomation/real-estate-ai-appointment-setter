import type { SlotKey, Slots } from '../types';

export function missingSlots(slots: Slots): SlotKey[] {
  const missing: SlotKey[] = [];
  if (slots.budget?.max === undefined) missing.push('budget');
  if (!slots.area) missing.push('area');
  if (slots.beds === undefined) missing.push('beds');
  if (!slots.propertyType) missing.push('propertyType');
  if (!slots.timeline) missing.push('timeline');
  return missing;
}

export function isQualified(slots: Slots): boolean {
  return missingSlots(slots).length === 0;
}

export function mergeSlots(prev: Slots, next: Partial<Slots>): Slots {
  const merged: Slots = { ...prev };
  if (next.budget) merged.budget = { ...next.budget };
  if (next.area) merged.area = next.area;
  if (next.beds !== undefined) merged.beds = next.beds;
  if (next.propertyType) merged.propertyType = next.propertyType;
  if (next.timeline) merged.timeline = next.timeline;
  return merged;
}

export function propertyLabel(type: NonNullable<Slots['propertyType']>): string {
  switch (type) {
    case 'condo':
      return 'condo';
    case 'townhouse':
      return 'townhouse';
    case 'single_family':
      return 'house';
    case 'multi_family':
      return 'multi-family';
  }
}

export function timelineLabel(timeline: NonNullable<Slots['timeline']>): string {
  switch (timeline) {
    case 'asap':
      return 'as soon as possible';
    case '30_days':
      return 'within 30 days';
    case '90_days':
      return 'within 90 days';
    case '6_months':
      return 'within 6 months';
    case 'browsing':
      return 'browsing';
  }
}
