import { Injectable, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TenantThemeTokens } from '../models';

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

  public applyTheme(tokens: TenantThemeTokens): void {
    const rootStyle = this.document.documentElement.style;
    rootStyle.setProperty('--color-brand-primary', tokens.primaryColor);
    rootStyle.setProperty('--color-brand-secondary', tokens.secondaryColor);
    rootStyle.setProperty('--color-brand-accent', tokens.accentColor);
    rootStyle.setProperty('--color-brand-surface', tokens.surfaceColor);
    rootStyle.setProperty('--color-brand-bg', tokens.backgroundColor);
    rootStyle.setProperty('--color-brand-text', tokens.textColor);
    rootStyle.setProperty('--font-serif-brand', tokens.fontFamilySerif);
    rootStyle.setProperty('--font-sans-brand', tokens.fontFamilySans);
    rootStyle.setProperty('--radius-brand', tokens.borderRadiusBase);
    this.tokensState.set({ ...tokens });
  }

  /**
   * Applies the tenant favicon when one is published, and removes the tag when a
   * tenant ships none so a previous tenant's mark never leaks across a switch.
   */
  public applyFavicon(faviconUrl: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!faviconUrl) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'icon';
      head.appendChild(link);
    }
    link.href = faviconUrl;
  }

  /** Applies branding side effects (favicon) that ride along with the palette. */
  public applyBranding(faviconUrl: string, tokens: TenantThemeTokens): void {
    this.applyTheme(tokens);
    this.applyFavicon(faviconUrl);
  }
}