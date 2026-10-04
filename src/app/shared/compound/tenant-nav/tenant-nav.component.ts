import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tenant } from '../../../core/models';

@Component({
  selector: 'app-tenant-nav',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="border-b border-stone-200/80 bg-(--color-brand-surface) sticky top-0 z-30">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <a
          [routerLink]="['/t', tenant().slug]"
          class="flex flex-col justify-center min-h-11"
          [attr.aria-label]="tenant().branding.agencyName + ' home'"
        >
          <span class="font-serif text-2xl tracking-tight text-(--color-brand-primary)">
            {{ tenant().branding.agencyName }}
          </span>
          <span class="text-[10px] tracking-widest uppercase text-(--color-brand-secondary)">
            {{ tenant().branding.tagline }}
          </span>
        </a>

        <div class="flex items-center gap-4 sm:gap-6">
          <div class="hidden md:flex flex-col text-right">
            <span class="text-xs uppercase tracking-wider text-(--color-brand-secondary)">Direct Inquiries</span>
            <a
              class="text-sm font-medium text-(--color-brand-primary) inline-flex items-center min-h-11"
              [href]="'tel:' + tenant().branding.contactPhone"
            >
              {{ tenant().branding.contactPhone }}
            </a>
          </div>

          <nav
            aria-label="Tenant switcher"
            class="flex items-center gap-1 text-xs border border-stone-300 p-1 rounded-[var(--radius-brand)]"
          >
            <a
              [routerLink]="['/t', 'atelier-living']"
              class="inline-flex items-center justify-center min-h-11 px-3 font-medium hover:underline"
              [class.underline]="tenant().slug === 'atelier-living'"
              [attr.aria-current]="tenant().slug === 'atelier-living' ? 'page' : null"
              >Atelier</a
            >
            <span class="text-stone-300" aria-hidden="true">|</span>
            <a
              [routerLink]="['/t', 'monolith-properties']"
              class="inline-flex items-center justify-center min-h-11 px-3 font-medium hover:underline"
              [class.underline]="tenant().slug === 'monolith-properties'"
              [attr.aria-current]="tenant().slug === 'monolith-properties' ? 'page' : null"
              >Monolith</a
            >
          </nav>
        </div>
      </div>
    </header>
  `
})
export class TenantNavComponent {
  public readonly tenant = input.required<Tenant>();
}