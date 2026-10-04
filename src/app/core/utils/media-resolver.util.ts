import { FloorPlanHotspot, FloorPlanLevel, PropertyMedia } from '../models';

export const MEDIA_TYPE_LABELS: Record<PropertyMedia['type'], string> = {
  interior: 'Interior',
  exterior: 'Exterior',
  aerial: 'Aerial',
  floorplan: 'Floor Plan',
  detail: 'Detail'
};

/** Stable ordering for gallery tracks: explicit `order`, then id as tiebreaker. */
export function sortMediaByOrder(media: PropertyMedia[]): PropertyMedia[] {
  return [...media].sort((a, b) => (a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order));
}

/** Resolves a media entry by id without throwing on an unknown reference. */
export function resolveMediaById(media: PropertyMedia[], mediaId: string): PropertyMedia | null {
  return media.find((entry) => entry.id === mediaId) ?? null;
}

/** Index of a media entry inside the ordered track, or -1 when absent. */
export function resolveMediaIndexById(media: PropertyMedia[], mediaId: string): number {
  return sortMediaByOrder(media).findIndex((entry) => entry.id === mediaId);
}

/** Media attached to a floor-plan hotspot, resolved against the parent listing. */
export function resolveHotspotMedia(hotspot: FloorPlanHotspot, media: PropertyMedia[]): PropertyMedia | null {
  if (!hotspot.associatedMediaId) {
    return null;
  }
  return resolveMediaById(media, hotspot.associatedMediaId);
}

/** Sorts floor plan levels ascending so "Ground" always precedes "Terrace". */
export function sortFloorPlanLevels(levels: FloorPlanLevel[]): FloorPlanLevel[] {
  return [...levels].sort((a, b) => (a.levelIndex === b.levelIndex ? a.id.localeCompare(b.id) : a.levelIndex - b.levelIndex));
}

/**
 * Rewrites an image URL to a requested render width when the host supports
 * query-parameter resizing (Unsplash and friends). Any other host is returned
 * untouched so no request is ever pointed at a non-existent variant.
 */
export function buildResponsiveImageUrl(url: string, width: number): string {
  if (!url || width <= 0) {
    return url;
  }
  const supportsResize = url.includes('images.unsplash.com') || url.includes('plus.unsplash.com');
  if (!supportsResize) {
    return url;
  }
  const safeWidth = Math.round(width);
  if (/[?&]w=\d+/.test(url)) {
    return url.replace(/([?&]w=)\d+/, `$1${safeWidth}`);
  }
  return `${url}${url.includes('?') ? '&' : '?'}w=${safeWidth}`;
}

/** Full address line used in listing headers and inquiry rails. */
export function formatFullAddress(address: {
  streetAddress: string;
  unit?: string;
  neighborhood: string;
  city: string;
  stateProvince: string;
  postalCode: string;
}): string {
  const street = address.unit ? `${address.streetAddress}, ${address.unit}` : address.streetAddress;
  return `${street}, ${address.city}, ${address.stateProvince} ${address.postalCode}`;
}