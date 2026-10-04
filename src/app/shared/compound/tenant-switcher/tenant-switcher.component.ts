import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TenantContextService } from '../../../core/services/tenant-context.service';
import { SheetModalComponent } from '../../ui-primitives/sheet-modal/sheet-modal.component';

/**
 * Floating tenant switch utility.
 *
 * Exists so context isolation can be verified in place: switching tenants swaps
 * branding, theme tokens and the entire listing scope without a reload. It stays
 * clear of the mobile call-to-action bar on small viewports.
 */
@Component({
  selector: 'app-tenant-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SheetModalComponent],
  template: `
    <div class="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:justify-end sm:px-6 lg:bottom-6">
      <button
        type="button"
        class="pointer-events-auto inline-flex min-h-11 items-center gap-2 border border-(--color-brand-line)
               bg-(--color-brand-surface)/95 px-4 editorial-label text-(--color-brand-primary) shadow-lg backdrop-blur
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand-accent)"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-(--color-brand-accent)" aria-hidden="true"></span>
        {{ activeLabel() }}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <ui-sheet-modal
      [isOpen]="open()"
      title="Switch agency"
      description="Each agency is an isolated tenant scope with its own branding, theme and listings."
      (closed)="close()"
    >
      <ul class="flex flex-col">
        @for (option of tenants(); track option.id) {
          <li>
            <a
              [routerLink]="['/t', option.slug]"
              class="flex min-h-12 items-center justify-between gap-3 border-b border-(--color-brand-line)"
              [attr.aria-current]="option.id === activeId() ? 'page' : null"
              (click)="close()"
            >
              <span class="min-w-0">
                <span class="block truncate max-w-full text-sm text-(--color-brand-primary)">
                  {{ option.branding.agencyName }}
                </span>
                <span class="block truncate max-w-full editorial-label text-(--color-brand-muted)">
                  {{ option.branding.tagline }}
                </span>
              </span>
              <span class="editorial-label shrink-0 text-(--color-brand-muted)">{{ option.branding.licenseNumber }}</span>
            </a>
          </li>
        } @empty {
          <li class="py-6 text-center text-xs text-(--color-brand-muted)">No additional agencies are registered.</li>
        }
      </ul>

      <div sheetFooter class="text-[11px] text-(--color-brand-muted)">
        Tenant data, branding and listings never cross agency boundaries.
      </div>
    </ui-sheet-modal>
  `
})
export class TenantSwitcherComponent {
  private readonly tenantContext = inject(TenantContextService);

  protected readonly open = signal(false);
  protected readonly tenants = this.tenantContext.availableTenants;
  protected readonly activeTenant = this.tenantContext.activeTenant;
  protected readonly activeId = computed(() => this.activeTenant()?.id ?? '');
  /** Short agency name for the floating pill; falls back to the switcher label. */
  protected readonly activeLabel = computed(() => {
    const tenant = this.activeTenant();
    if (!tenant) {
      return 'Agencies';
    }
    const [firstWord] = tenant.branding.agencyName.split(' ');
    return firstWord || 'Agencies';
  });

  constructor() {
    void this.tenantContext.loadAvailableTenants();
  }

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected close(): void {
    this.open.set(false);
  }
}