import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tenant } from '../../../core/models';
import { TenantContextService } from '../../../core/services/tenant-context.service';
import { ButtonComponent } from '../../ui-primitives/button/button.component';
import { SheetModalComponent } from '../../ui-primitives/sheet-modal/sheet-modal.component';

/**
 * Editorial agency header.
 *
 * Desktop keeps a minimal horizontal rail with the direct-inquiry line and the
 * tenant selector. Mobile collapses to a fixed top bar plus a bottom-sheet
 * drawer, so navigation never depends on hover.
 */
@Component({
  selector: 'app-tenant-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SheetModalComponent, ButtonComponent],
  templateUrl: './tenant-nav.component.html'
})
export class TenantNavComponent {
  public readonly tenant = input.required<Tenant>();

  private readonly tenantContext = inject(TenantContextService);

  protected readonly menuOpen = signal(false);
  protected readonly availableTenants = this.tenantContext.availableTenants;
  protected readonly currentSlug = computed(() => this.tenant().slug);
  protected readonly catalogLink = computed(() => ['/t', this.currentSlug()]);
  protected readonly phoneHref = computed(() => `tel:${this.tenant().branding.contactPhone.replace(/[^\d+]/g, '')}`);
  protected readonly mailHref = computed(() => `mailto:${this.tenant().branding.contactEmail}`);

  constructor() {
    void this.tenantContext.loadAvailableTenants();
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected isCurrent(slug: string): boolean {
    return slug === this.currentSlug();
  }
}