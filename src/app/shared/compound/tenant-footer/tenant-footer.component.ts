import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tenant } from '../../../core/models';
import { TenantContextService } from '../../../core/services/tenant-context.service';

/**
 * Multi-column footer carrying the agency identity, licensing credentials,
 * contact routes and the tenant switch utility.
 */
@Component({
  selector: 'app-tenant-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <footer class="mt-auto border-t border-(--color-brand-line) bg-(--color-brand-surface)">
      <div class="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
        <div class="min-w-0">
          <p class="editorial-serif text-lg text-(--color-brand-primary) truncate max-w-full">
            {{ tenant().branding.legalEntityName }}
          </p>
          <p class="mt-2 text-xs leading-relaxed text-(--color-brand-secondary) text-pretty">
            {{ tenant().branding.tagline }}. Representation limited to architecturally significant residences.
          </p>
          <p class="mt-3 editorial-label text-(--color-brand-muted)">{{ tenant().branding.licenseNumber }}</p>
        </div>

        <div class="min-w-0">
          <p class="editorial-label text-(--color-brand-muted)">Inquiries</p>
          <ul class="mt-3 flex flex-col gap-1 text-xs text-(--color-brand-secondary)">
            <li class="truncate max-w-full">
              <a class="inline-flex min-h-11 items-center hover:text-(--color-brand-primary)" [href]="phoneHref()">
                {{ tenant().branding.contactPhone }}
              </a>
            </li>
            <li class="truncate max-w-full">
              <a class="inline-flex min-h-11 items-center hover:text-(--color-brand-primary)" [href]="mailHref()">
                {{ tenant().branding.contactEmail }}
              </a>
            </li>
            <li class="pt-1">
              <a
                class="inline-flex min-h-11 items-center gap-2 text-(--color-brand-primary) hover:underline"
                [routerLink]="catalogLink()"
              >
                View current residences
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </a>
            </li>
          </ul>
        </div>

        <div class="min-w-0">
          <p class="editorial-label text-(--color-brand-muted)">Registered agencies</p>
          <ul class="mt-3 flex flex-col">
            @for (option of availableTenants(); track option.id) {
              <li>
                <a
                  [routerLink]="['/t', option.slug]"
                  class="inline-flex min-h-11 items-center justify-between gap-3 border-b border-(--color-brand-line)
                         text-xs text-(--color-brand-secondary) hover:text-(--color-brand-primary)"
                  [attr.aria-current]="option.slug === tenant().slug ? 'page' : null"
                >
                  <span class="truncate max-w-full">{{ option.branding.agencyName }}</span>
                  <span class="editorial-label shrink-0 text-(--color-brand-muted)">
                    {{ option.branding.licenseNumber }}
                  </span>
                </a>
              </li>
            }
          </ul>
        </div>
      </div>

      <div class="border-t border-(--color-brand-line)">
        <div
          class="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-[11px] text-(--color-brand-muted) sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"
        >
          <span>© {{ currentYear }} {{ tenant().branding.legalEntityName }}. Fictional simulation.</span>
          <span>Demonstration portal — all listings, agents, and contacts are synthetic models.</span>
        </div>
      </div>
    </footer>
  `
})
export class TenantFooterComponent {
  public readonly tenant = input.required<Tenant>();

  private readonly tenantContext = inject(TenantContextService);

  protected readonly availableTenants = this.tenantContext.availableTenants;
  protected readonly catalogLink = computed(() => ['/t', this.tenant().slug]);
  protected readonly phoneHref = computed(() => `tel:${this.tenant().branding.contactPhone.replace(/[^\d+]/g, '')}`);
  protected readonly mailHref = computed(() => `mailto:${this.tenant().branding.contactEmail}`);
  protected readonly currentYear = new Date().getFullYear();

  constructor() {
    void this.tenantContext.loadAvailableTenants();
  }
}