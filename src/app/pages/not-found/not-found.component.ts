import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { DEFAULT_TENANT_SLUG } from '../../app.routes';

/**
 * Terminal route for an unknown tenant slug, deactivated tenant or missing
 * residence. It reuses the active tenant theme when one is already resolved so
 * the exit state never flashes an unbranded palette.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-(--color-brand-bg) px-4 py-16 text-(--color-brand-text)">
      <div class="w-full max-w-lg border border-(--color-brand-line) bg-(--color-brand-surface) p-8 text-center">
        <p class="editorial-label text-(--color-brand-secondary)">404 · Outside the register</p>
        <h1 class="mt-3 text-3xl text-(--color-brand-primary) sm:text-4xl">Location not found</h1>
        <p class="mt-4 text-pretty text-sm leading-relaxed text-(--color-brand-secondary)">
          The agency domain, tenant scope or architectural listing you requested is not held in this
          register. Listings never cross agency boundaries, so a valid residence may exist under a
          different tenant.
        </p>

        <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            [routerLink]="recoveryLink()"
            class="inline-flex min-h-11 items-center justify-center border border-(--color-brand-primary) bg-(--color-brand-primary) px-5 editorial-label text-(--color-brand-inverse) hover:opacity-90"
          >
            Return to residences
          </a>
          <a
            routerLink="/preview/components"
            class="inline-flex min-h-11 items-center justify-center border border-(--color-brand-line) px-5 editorial-label text-(--color-brand-secondary) hover:border-(--color-brand-primary)"
          >
            Design system
          </a>
        </div>

        @if (activeAgency(); as agency) {
          <p class="mt-8 border-t border-(--color-brand-line) pt-5 text-[11px] text-(--color-brand-muted)">
            Currently resolving: {{ agency }} · {{ licenseNumber() }}
          </p>
        }
      </div>
    </div>
  `
})
export class NotFoundComponent {
  private readonly tenantContext = inject(TenantContextService);

  protected readonly activeAgency = this.tenantContext.activeTenant;
  protected readonly licenseNumber = () => this.tenantContext.activeTenant()?.branding.licenseNumber ?? '—';
  protected readonly recoveryLink = () => {
    const slug = this.tenantContext.activeTenant()?.slug ?? DEFAULT_TENANT_SLUG;
    return ['/t', slug];
  };
}