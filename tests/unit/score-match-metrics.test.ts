import { describe, expect, it } from 'vitest';

import { leadLabel } from '@/domain/mask';
import { matchListings } from '@/domain/matching/match';
import { percentile } from '@/domain/metrics/percentile';
import { LISTINGS } from '@/domain/listings/data';
import { qualificationScore } from '@/domain/qualification/score';
import { isQualified, missingSlots } from '@/domain/qualification/slots';
import type { Slots } from '@/domain/types';

const full: Slots = {
  budget: { max: 700_000, currency: 'USD' },
  area: 'Lantern Hill',
  beds: 3,
  propertyType: 'condo',
  timeline: '30_days',
};

describe('score and matching', () => {
  it('scores only captured slots', () => {
    expect(qualificationScore({})).toBe(0);
    expect(qualificationScore(full)).toBe(94);
    expect(qualificationScore({ ...full, timeline: 'asap' })).toBe(100);
    expect(qualificationScore({ ...full, timeline: 'browsing' })).toBe(82);
    expect(isQualified(full)).toBe(true);
    expect(missingSlots({ area: 'Old Keel' })).toEqual([
      'budget',
      'beds',
      'propertyType',
      'timeline',
    ]);
  });

  it('returns two or three homes inside the constraints', () => {
    const matches = matchListings(LISTINGS, full);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.length).toBeLessThanOrEqual(3);
    for (const listing of matches) {
      expect(listing.neighborhood).toBe('Lantern Hill');
      expect(listing.type).toBe('condo');
      expect(listing.beds).toBe(3);
      expect(listing.price).toBeLessThanOrEqual(700_000);
    }
    expect(matches.map((listing) => listing.price)).toEqual(
      [...matches.map((listing) => listing.price)].sort((a, b) => a - b),
    );
  });

  it('returns nothing when the constraints exclude the catalog', () => {
    expect(
      matchListings(LISTINGS, {
        budget: { max: 100_000, currency: 'USD' },
        area: 'Lantern Hill',
        beds: 5,
        propertyType: 'multi_family',
        timeline: 'asap',
      }),
    ).toEqual([]);
  });

  it('relaxes beds by one when an exact match is thin', () => {
    const matches = matchListings(LISTINGS, {
      budget: { max: 800_000, currency: 'USD' },
      area: 'Millcross',
      beds: 3,
      propertyType: 'multi_family',
      timeline: '90_days',
    });
    expect(matches.some((listing) => listing.beds === 3 || listing.beds === 4)).toBe(true);
  });
});

describe('percentile', () => {
  it('uses inclusive nearest-rank and returns null when empty', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([10], 95)).toBe(10);
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 95)).toBe(50);
  });
});

describe('lead label', () => {
  it('does not include the external id', () => {
    expect(leadLabel('sms', '3-bed condo')).toBe('SMS · 3-bed condo');
    expect(leadLabel('web', '')).toBe('Site chat');
    expect(leadLabel('email', '')).toBe('Email');
    expect(leadLabel('instagram', '')).toBe('Instagram');
    expect(leadLabel('voice', '')).toBe('Voice');
  });
});
