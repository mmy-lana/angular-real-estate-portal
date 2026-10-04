import { PropertyStatus, PropertyType } from '../models';

const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  CHF: 'de-CH',
  AED: 'en-AE'
};

function localeForCurrency(currency: string): string {
  return CURRENCY_LOCALE[currency.toUpperCase()] ?? 'en-US';
}

function createFormatter(options: Intl.NumberFormatOptions, currency: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(localeForCurrency(currency), options);
  } catch {
    return new Intl.NumberFormat('en-US', options);
  }
}

/** Full currency rendering, e.g. `$6,850,000`. */
export function formatCurrency(amount: number, currency = 'USD'): string {
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return createFormatter({ style: 'currency', currency, maximumFractionDigits: 0 }, currency).format(amount);
}

/** Precision currency for payment envelopes, e.g. `$4,128.55`. */
export function formatCurrencyPrecise(amount: number, currency = 'USD'): string {
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return createFormatter({ style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }, currency).format(amount);
}

/** Editorial abbreviated currency for tight card layouts, e.g. `$14.5M`. */
export function formatCompactCurrency(amount: number, currency = 'USD'): string {
  if (!Number.isFinite(amount)) {
    return '—';
  }
  const absolute = Math.abs(amount);
  const symbol = createFormatter({ style: 'currency', currency, maximumFractionDigits: 0 }, currency)
    .format(0)
    .replace(/[\d.,\s]/g, '');

  const format = (value: number, fractionDigits: number): string =>
    createFormatter(
      { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits },
      currency
    ).format(value);

  if (absolute >= 1_000_000) {
    return `${symbol}${format(amount / 1_000_000, absolute >= 10_000_000 ? 1 : 2)}M`;
  }
  if (absolute >= 1_000) {
    return `${symbol}${format(amount / 1_000, 0)}K`;
  }
  return `${symbol}${format(amount, 0)}`;
}

/** Plain grouped number, e.g. `6,400`. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return createFormatter({ maximumFractionDigits: 0 }, 'USD').format(value);
}

/** Interior/exterior area with the imperial unit used across the portfolio. */
export function formatSquareFeet(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${formatNumber(value)} sq ft`;
}

/** Lot sizes below an acre are expressed in square feet, above in acres. */
export function formatLotSize(acres: number): string {
  if (!Number.isFinite(acres)) {
    return '—';
  }
  if (acres <= 0) {
    return 'No lot';
  }
  if (acres < 0.25) {
    return `${formatNumber(Math.round(acres * 43_560))} sq ft lot`;
  }
  return `${createFormatter({ minimumFractionDigits: 1, maximumFractionDigits: 2 }, 'USD').format(acres)} acre lot`;
}

/** Ceiling height in feet and inches, e.g. `12 ft 6 in`. */
export function formatCeilingHeight(feet: number): string {
  if (!Number.isFinite(feet) || feet <= 0) {
    return '—';
  }
  const wholeFeet = Math.floor(feet);
  const inches = Math.round((feet - wholeFeet) * 12);
  return inches === 0 ? `${wholeFeet} ft` : `${wholeFeet} ft ${inches} in`;
}

/** Median-ish date rendering for editorial bylines. */
export function formatListingDate(isoDateTime: string | null): string {
  if (!isoDateTime) {
    return 'Unpublished';
  }
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unpublished';
  }
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(parsed);
}

/** 24-hour tour slot label, e.g. `14:30`. */
export function formatTimeSlot(isoDateTime: string): string {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(parsed);
}

/** Long-form tour date label, e.g. `Thursday, 12 March 2026`. */
export function formatTourDate(isoDateTime: string): string {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parsed);
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  architectural_estate: 'Architectural Estate',
  minimalist_villa: 'Minimalist Villa',
  urban_penthouse: 'Urban Penthouse',
  historic_renovation: 'Historic Renovation',
  coastal_residence: 'Coastal Residence'
};

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  pending: 'Pending',
  under_contract: 'Under Contract',
  sold: 'Sold',
  archived: 'Archived'
};

/** Short status chip copy used on listing cards. */
export function formatPropertyStatus(status: PropertyStatus): string {
  return PROPERTY_STATUS_LABELS[status];
}

export function formatPropertyType(type: PropertyType): string {
  return PROPERTY_TYPE_LABELS[type];
}