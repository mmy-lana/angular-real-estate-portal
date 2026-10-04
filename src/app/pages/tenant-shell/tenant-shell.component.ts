import { Component, input, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Tenant } from '../../core/models';
import { DynamicThemeService } from '../../core/services/dynamic-theme.service';
import { TenantNavComponent } from '../../shared/compound/tenant-nav/tenant-nav.component';
import { TenantFooterComponent } from '../../shared/compound/tenant-footer/tenant-footer.component';

@Component({
  selector: 'app-tenant-shell',
  standalone: true,
  imports: [RouterOutlet, TenantNavComponent, TenantFooterComponent],
  template: `
    <div class="min-h-screen flex flex-col bg-(--color-brand-bg) text-(--color-brand-text)">
      <app-tenant-nav [tenant]="tenant()" />
      <main class="flex-1">
        <router-outlet />
      </main>
      <app-tenant-footer [tenant]="tenant()" />
    </div>
  `
})
export class TenantShellComponent {
  private readonly themeService = inject(DynamicThemeService);
  public readonly tenant = input.required<Tenant>();

  constructor() {
    effect(() => {
      this.themeService.applyTheme(this.tenant().branding.themeTokens);
    });
  }
}
