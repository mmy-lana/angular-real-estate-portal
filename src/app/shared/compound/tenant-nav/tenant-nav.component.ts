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
        <a [routerLink]="['/t', tenant().slug]" class="flex flex-col">
          <span class="font-serif text-2xl tracking-tight text-(--color-brand-primary)">
            {{ tenant().branding.agencyName }}
          </span>
          <span class="text-[10px] tracking-widest uppercase text-(--color-brand-secondary)">
            {{ tenant().branding.tagline }}
          </span>
        </a>

        <div class="flex items-center space-x-6">
          <div class="hidden md:flex flex-col text-right">
            <span class="text-xs uppercase tracking-wider text-(--color-brand-secondary)">Direct Inquiries</span>
            <span class="text-sm font-medium text-(--color-brand-primary)">{{ tenant().branding.contactPhone }}</span>
          </div>

          <div class="flex items-center space-x-2 text-xs border border-stone-300 px-3 py-1.5 rounded-[var(--radius-brand)]">
            <span class="text-stone-400">Tenant:</span>
            <a [routerLink]="['/t', 'atelier-living']" class="hover:underline font-medium" [class.underline]="tenant().slug === 'atelier-living'">Atelier</a>
            <span class="text-stone-300">|</span>
            <a [routerLink]="['/t', 'monolith-properties']" class="hover:underline font-medium" [class.underline]="tenant().slug === 'monolith-properties'">Monolith</a>
          </div>
        </div>
      </div>
    </header>
  `
})
export class TenantNavComponent {
  public readonly tenant = input.required<Tenant>();
}
