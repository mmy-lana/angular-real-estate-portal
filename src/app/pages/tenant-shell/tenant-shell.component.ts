import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Tenant } from '../../core/models';
import { DynamicThemeService } from '../../core/services/dynamic-theme.service';
import { TenantNavComponent } from '../../shared/compound/tenant-nav/tenant-nav.component';
import { TenantFooterComponent } from '../../shared/compound/tenant-footer/tenant-footer.component';
import { TenantSwitcherComponent } from '../../shared/compound/tenant-switcher/tenant-switcher.component';

/**
 * Tenant storefront shell.
 *
 * Holds the resolved tenant, applies its theme tokens to the document root and
 * composes the header, routed page and footer. The tenant switcher is mounted
 * here (rather than inside a page) so it survives in-place navigation between
 * the catalog and a listing.
 */
@Component({
  selector: 'app-tenant-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, TenantNavComponent, TenantFooterComponent, TenantSwitcherComponent],
  template: `
    <div class="flex min-h-screen flex-col bg-(--color-brand-bg) text-(--color-brand-text)">
      <aside
        class="border-b border-(--color-brand-line) bg-(--color-brand-surface) px-4 py-1.5 text-center text-[11px] tracking-wide text-(--color-brand-secondary)"
        role="note"
        aria-label="Demonstration Notice"
      >
        <span class="font-medium text-(--color-brand-primary)">Demonstration Environment:</span>
        All agencies, properties, architectural data, agents, and phone numbers are purely simulated mock data. No
        commercial transactions are conducted.
      </aside>
      <app-tenant-nav [tenant]="tenant()" />
      <main class="flex-1">
        <router-outlet />
      </main>
      <app-tenant-footer [tenant]="tenant()" />
      <app-tenant-switcher />
    </div>
  `
})
export class TenantShellComponent {
  private readonly themeService = inject(DynamicThemeService);

  public readonly tenant = input.required<Tenant>();

  constructor() {
    effect(() => {
      const tenant = this.tenant();
      this.themeService.applyBranding(tenant.branding.faviconUrl, tenant.branding.themeTokens);
    });
  }
}