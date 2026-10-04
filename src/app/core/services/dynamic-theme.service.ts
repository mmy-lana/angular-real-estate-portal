import { Injectable, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TenantThemeTokens } from '../models';

/** Platform mark used when a tenant publishes no favicon of its own. */
export const DEFAULT_FAVICON_URL = '/favicon.svg';

/** Fallback palette applied whenever a tenant token fails validation. */
const FALLBACK_TOKENS: TenantThemeTokens = {
  primaryColor: '#2C2B29',
  secondaryColor: '#6B6864',
  accentColor: '#B59E7D',
  surfaceColor: '#F5F3EF',
  backgroundColor: '#FAFAF7',
  textColor: '#1A1918',
  fontFamilySerif: 'Georgia, serif',
  fontFamilySans: 'system-ui, sans-serif',
  borderRadiusBase: '2px'
};

/**
 * Runtime theming bridge.
 *
 * Tailwind utilities reference the same custom properties (`bg-(--color-brand-bg)`),
 * so writing them onto `:root` re-skins the entire application without a rebuild
 * and without the circular self-reference that `@theme` would introduce.
 */
@Injectable({ providedIn: 'root' })
export class DynamicThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly tokensState = signal<TenantThemeTokens | null>(null);

  /** Tokens currently applied to the document root. */
  public readonly activeTokens = this.tokensState.asReadonly();
  public readonly hasTheme = computed(() => this.tokensState() !== null);

  /**
   * Writes the tenant palette onto the document root.
   *
   * Every token is validated against its format first: a value that is not a
   * colour, a length or a font stack is replaced by the platform default rather
   * than being interpolated into the stylesheet.
   */
  public applyTheme(tokens: TenantThemeTokens): void {
    const safe = sanitizeThemeTokens(tokens);
    const rootStyle = this.document.documentElement.style;

    rootStyle.setProperty('--color-brand-primary', safe.primaryColor);
    rootStyle.setProperty('--color-brand-secondary', safe.secondaryColor);
    rootStyle.setProperty('--color-brand-accent', safe.accentColor);
    rootStyle.setProperty('--color-brand-surface', safe.surfaceColor);
    rootStyle.setProperty('--color-brand-bg', safe.backgroundColor);
    rootStyle.setProperty('--color-brand-text', safe.textColor);
    rootStyle.setProperty('--font-serif-brand', safe.fontFamilySerif);
    rootStyle.setProperty('--font-sans-brand', safe.fontFamilySans);
    rootStyle.setProperty('--radius-brand', safe.borderRadiusBase);

    // Derived roles, composed in the browser from the validated tokens so a
    // tenant only has to publish the nine values defined by the theme contract.
    rootStyle.setProperty(
      '--color-brand-muted',
      `color-mix(in srgb, ${safe.secondaryColor} 72%, ${safe.backgroundColor})`
    );
    rootStyle.setProperty(
      '--color-brand-line',
      `color-mix(in srgb, ${safe.textColor} 12%, ${safe.backgroundColor})`
    );
    rootStyle.setProperty('--color-brand-inverse', safe.backgroundColor);

    this.tokensState.set(safe);
  }

  /**
   * Applies the tenant favicon when one is published. Tenants that ship no
   * mark fall back to the platform favicon rather than removing the link: a
   * missing `<link rel="icon">` makes browsers request `/favicon.ico`, which
   * would answer 404 on every tenant switch.
   */
  public applyFavicon(faviconUrl: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'icon';
      head.appendChild(link);
    }
    const source = isSafeAssetUrl(faviconUrl) ? faviconUrl : DEFAULT_FAVICON_URL;
    link.type = source.endsWith('.svg') ? 'image/svg+xml' : 'image/x-icon';
    link.href = source;
  }

  /** Applies branding side effects (favicon) that ride along with the palette. */
  public applyBranding(faviconUrl: string, tokens: TenantThemeTokens): void {
    this.applyTheme(tokens);
    this.applyFavicon(faviconUrl);
  }
}
/**
 * Accepted colour formats. Anything else (an `url()`, a stray declaration, a
 * CSS var indirection) is rejected before it can reach a custom property.
 */
const COLOR_PATTERN =
  /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|^rgba?\([^()]*\)$|^hsla?\([^()]*\)$/;
const RADIUS_PATTERN = /^(?:0|\d+(?:\.\d+)?(?:px|rem|em|%|pt|vh|vw)?)$/i;
const FONT_STACK_PATTERN = /^[^;{}<>]*$/;

function sanitizeColor(value: string, fallback: string): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return COLOR_PATTERN.test(candidate) ? candidate : fallback;
}

function sanitizeRadius(value: string, fallback: string): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return RADIUS_PATTERN.test(candidate) ? candidate : fallback;
}

function sanitizeFontStack(value: string, fallback: string): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return FONT_STACK_PATTERN.test(candidate) && candidate !== '' ? candidate : fallback;
}

/** Favicons are restricted to same-origin paths and http(s) URLs. */
function isSafeAssetUrl(value: string): boolean {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  const candidate = value.trim();
  return (
    candidate.startsWith('/') ||
    candidate.startsWith('./') ||
    candidate.startsWith('data:image/') ||
    /^https?:\/\//i.test(candidate)
  );
}

/**
 * Validates a tenant palette field by field, substituting the platform default
 * for any token that does not match its expected format.
 */
export function sanitizeThemeTokens(tokens: TenantThemeTokens): TenantThemeTokens {
  return {
    primaryColor: sanitizeColor(tokens.primaryColor, FALLBACK_TOKENS.primaryColor),
    secondaryColor: sanitizeColor(tokens.secondaryColor, FALLBACK_TOKENS.secondaryColor),
    accentColor: sanitizeColor(tokens.accentColor, FALLBACK_TOKENS.accentColor),
    surfaceColor: sanitizeColor(tokens.surfaceColor, FALLBACK_TOKENS.surfaceColor),
    backgroundColor: sanitizeColor(tokens.backgroundColor, FALLBACK_TOKENS.backgroundColor),
    textColor: sanitizeColor(tokens.textColor, FALLBACK_TOKENS.textColor),
    fontFamilySerif: sanitizeFontStack(tokens.fontFamilySerif, FALLBACK_TOKENS.fontFamilySerif),
    fontFamilySans: sanitizeFontStack(tokens.fontFamilySans, FALLBACK_TOKENS.fontFamilySans),
    borderRadiusBase: sanitizeRadius(tokens.borderRadiusBase, FALLBACK_TOKENS.borderRadiusBase)
  };
}
