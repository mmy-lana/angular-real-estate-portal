import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TenantThemeTokens } from '../models';

@Injectable({ providedIn: 'root' })
export class DynamicThemeService {
  private readonly document = inject(DOCUMENT);

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
  }
}
