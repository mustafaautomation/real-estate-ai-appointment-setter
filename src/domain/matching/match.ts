import type { Listing, Slots } from '../types';

export function matchListings(listings: readonly Listing[], slots: Slots, limit = 3): Listing[] {
  const exact = rank(listings, slots, true);
  if (exact.length >= 2) return exact.slice(0, limit);
  const relaxed = rank(listings, slots, false);
  return relaxed.slice(0, limit);
}

function rank(listings: readonly Listing[], slots: Slots, exactBeds: boolean): Listing[] {
  return listings
    .filter((listing) => fits(listing, slots, exactBeds))
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
}

function fits(listing: Listing, slots: Slots, exactBeds: boolean): boolean {
  if (slots.propertyType && listing.type !== slots.propertyType) return false;
  if (slots.area && listing.neighborhood.toLowerCase() !== slots.area.toLowerCase()) return false;
  if (slots.beds !== undefined) {
    if (exactBeds && listing.beds !== slots.beds) return false;
    if (!exactBeds && (listing.beds < slots.beds || listing.beds > slots.beds + 1)) return false;
  }
  if (slots.budget?.max !== undefined && listing.price > slots.budget.max) return false;
  if (slots.budget?.min !== undefined && listing.price < slots.budget.min) return false;
  return true;
}
