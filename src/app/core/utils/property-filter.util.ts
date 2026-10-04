import { Property, PropertyFilterCriteria, PropertyMedia, PropertyStatus, PropertyType } from '../models';

export const DEFAULT_SORT_OPTION: PropertyFilterCriteria['sortBy'] = 'date_desc';

/** Creates the neutral criteria used by a freshly mounted catalog surface. */
export function createDefaultFilterCriteria(): PropertyFilterCriteria {
  return {
    searchQuery: '',
    propertyTypes: [],
    sortBy: DEFAULT_SORT_OPTION
  };
}

/** Structural clone so callers can mutate criteria without touching shared state. */
export function cloneFilterCriteria(criteria: PropertyFilterCriteria): PropertyFilterCriteria {
  return {
    ...criteria,
    propertyTypes: [...criteria.propertyTypes]
  };
}

/**
 * Picks the published cover image for a listing. Prefers an explicit `isCover`
 * entry and falls back to the lowest `order` value so a card never renders blank
 * just because a photographer forgot to flag the hero frame.
 */
export function resolveCoverImage(media: PropertyMedia[]): PropertyMedia | null {
  if (!media || media.length === 0) {
    return null;
  }
  const covers = media.filter((entry) => entry.isCover);
  const pool = covers.length > 0 ? covers : media;
  return [...pool].sort((a, b) => a.order - b.order)[0] ?? null;
}

function matchesText(property: Property, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') {
    return true;
  }
  const haystack = [
    property.title,
    property.tagline,
    property.description,
    property.address.streetAddress,
    property.address.neighborhood,
    property.address.city,
    property.address.stateProvince,
    property.specs.architectName ?? '',
    ...property.amenities
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function matchesNeighborhood(property: Property, neighborhood: string): boolean {
  const query = neighborhood.trim().toLowerCase();
  if (query === '') {
    return true;
  }
  return (
    property.address.neighborhood.toLowerCase().includes(query) ||
    property.address.city.toLowerCase().includes(query) ||
    property.address.stateProvince.toLowerCase().includes(query)
  );
}

/**
 * Applies the tenant-scoped filter criteria then orders the result.
 * The input array is never mutated: `.filter()` always allocates first.
 */
export function filterAndSortProperties(
  properties: Property[],
  criteria: PropertyFilterCriteria
): Property[] {
  return properties
    .filter((property) => {
      if (property.status === 'active' && !property.publishedAt) {
        return false;
      }
      if (criteria.status && property.status !== criteria.status) {
        return false;
      }
      if (criteria.propertyTypes.length > 0 && !criteria.propertyTypes.includes(property.type)) {
        return false;
      }
      if (criteria.minPrice !== undefined && property.price < criteria.minPrice) {
        return false;
      }
      if (criteria.maxPrice !== undefined && property.price > criteria.maxPrice) {
        return false;
      }
      if (criteria.minBedrooms !== undefined && property.specs.bedrooms < criteria.minBedrooms) {
        return false;
      }
      if (criteria.minBathrooms !== undefined && property.specs.bathrooms < criteria.minBathrooms) {
        return false;
      }
      if (criteria.minSquareFeet !== undefined && property.specs.interiorSquareFeet < criteria.minSquareFeet) {
        return false;
      }
      if (!matchesNeighborhood(property, criteria.neighborhood ?? '')) {
        return false;
      }
      if (!matchesText(property, criteria.searchQuery ?? '')) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (criteria.sortBy) {
        case 'price_asc':
          return a.price - b.price;
        case 'price_desc':
          return b.price - a.price;
        case 'sqft_desc':
          return b.specs.interiorSquareFeet - a.specs.interiorSquareFeet;
        case 'date_desc':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
}

/** Adds or removes a property type without mutating the source array. */
export function togglePropertyType(criteria: PropertyFilterCriteria, type: PropertyType): PropertyFilterCriteria {
  const next = cloneFilterCriteria(criteria);
  next.propertyTypes = next.propertyTypes.includes(type)
    ? next.propertyTypes.filter((entry) => entry !== type)
    : [...next.propertyTypes, type];
  return next;
}

/** Removes every narrowing criterion while preserving the chosen sort order. */
export function clearFilterCriteria(criteria: PropertyFilterCriteria): PropertyFilterCriteria {
  return {
    searchQuery: '',
    propertyTypes: [],
    sortBy: criteria.sortBy
  };
}

/** Counts user-visible narrowing criteria; drives the "filters applied" badge. */
export function countActiveFilters(criteria: PropertyFilterCriteria): number {
  let count = criteria.propertyTypes.length;
  const numericKeys: (keyof PropertyFilterCriteria)[] = [
    'minPrice',
    'maxPrice',
    'minBedrooms',
    'minBathrooms',
    'minSquareFeet'
  ];
  for (const key of numericKeys) {
    const value = criteria[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      count += 1;
    }
  }
  if (criteria.neighborhood && criteria.neighborhood.trim() !== '') count += 1;
  if (criteria.status) count += 1;
  if (criteria.searchQuery && criteria.searchQuery.trim() !== '') count += 1;
  return count;
}

/** Derives the price envelope of a tenant's portfolio for slider bounds. */
export function derivePropertyPriceBounds(properties: Property[]): { min: number; max: number } {
  if (properties.length === 0) {
    return { min: 0, max: 0 };
  }
  const prices = properties.map((property) => property.price);
  const min = Math.floor(Math.min(...prices));
  const max = Math.ceil(Math.max(...prices));
  return { min, max: max === min ? min + 1 : max };
}

/** Distinct, alphabetised neighborhoods within a tenant's portfolio. */
export function deriveNeighborhoods(properties: Property[]): string[] {
  return Array.from(new Set(properties.map((property) => property.address.neighborhood)))
    .filter((neighborhood) => neighborhood.trim() !== '')
    .sort((a, b) => a.localeCompare(b));
}

/** Statuses actually present in a tenant's portfolio, used by the status filter. */
export function deriveAvailableStatuses(properties: Property[]): PropertyStatus[] {
  const order: PropertyStatus[] = ['draft', 'active', 'pending', 'under_contract', 'sold', 'archived'];
  const present = new Set(properties.map((property) => property.status));
  return order.filter((status) => present.has(status));
}

/** Largest interior footprint in the portfolio; keeps the sqft slider meaningful. */
export function deriveMaxInteriorSquareFeet(properties: Property[]): number {
  if (properties.length === 0) {
    return 0;
  }
  return Math.max(...properties.map((property) => property.specs.interiorSquareFeet));
}