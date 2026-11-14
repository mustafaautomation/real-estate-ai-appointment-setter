import { describe, expect, it } from 'vitest';

import { extractBudget, extractSlots } from '@/domain/qualification/extract';

describe('extractSlots', () => {
  it('reads a full buyer sentence', () => {
    const slots = extractSlots(
      'Looking for a 3 bedroom condo in Lantern Hill under $700k within 30 days.',
    );
    expect(slots).toMatchObject({
      beds: 3,
      propertyType: 'condo',
      area: 'Lantern Hill',
      timeline: '30_days',
      budget: { max: 700_000, currency: 'USD' },
    });
  });

  it('reads ranges, word numbers, and suffixes', () => {
    expect(extractBudget('budget between 400k and 550k')).toEqual({
      min: 400_000,
      max: 550_000,
      currency: 'USD',
    });
    expect(extractBudget('under 1.2 million')).toEqual({ max: 1_200_000, currency: 'USD' });
    expect(extractBudget('budget 700')).toEqual({ max: 700_000, currency: 'USD' });
    expect(extractBudget('$650,000')).toEqual({ max: 650_000, currency: 'USD' });
    expect(extractSlots('three bedrooms').beds).toBe(3);
    expect(extractSlots('tres habitaciones').beds).toBe(3);
    expect(extractSlots('a duplex in Millcross').propertyType).toBe('multi_family');
    expect(extractSlots('townhouse in Old Keel').area).toBe('Old Keel');
    expect(extractSlots('just looking').timeline).toBe('browsing');
    expect(extractSlots('as soon as possible').timeline).toBe('asap');
    expect(extractSlots('in 6 months').timeline).toBe('6_months');
    expect(extractSlots('within 90 days').timeline).toBe('90_days');
  });

  it('does not treat bedroom counts as money', () => {
    expect(extractBudget('3 to 4 bedrooms')).toBeUndefined();
    expect(extractSlots('about 3 bedrooms').budget).toBeUndefined();
  });

  it('keeps a minimum when the lead gives a floor', () => {
    expect(extractBudget('at least 400k')).toEqual({ min: 400_000, currency: 'USD' });
  });
});
