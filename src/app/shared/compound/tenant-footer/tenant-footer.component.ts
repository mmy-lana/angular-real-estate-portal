import { Component, input } from '@angular/core';
import { Tenant } from '../../../core/models';

@Component({
  selector: 'app-tenant-footer',
  standalone: true,
  template: `
    <footer class="border-t border-stone-200/80 bg-(--color-brand-surface) mt-auto">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <p class="font-serif text-lg text-(--color-brand-primary)">{{ tenant().branding.legalEntityName }}</p>
          <p class="text-xs text-(--color-brand-secondary) mt-1">Licensing: {{ tenant().branding.licenseNumber }}</p>
        </div>
        <div class="text-xs text-(--color-brand-secondary)">
          <p>Email: {{ tenant().branding.contactEmail }}</p>
          <p class="mt-1">Architectural Housing Portal Specification</p>
        </div>
      </div>
    </footer>
  `
})
export class TenantFooterComponent {
  public readonly tenant = input.required<Tenant>();
}
