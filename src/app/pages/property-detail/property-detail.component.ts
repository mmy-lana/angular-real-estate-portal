import { Component, input } from '@angular/core';
import { Tenant } from '../../core/models';

@Component({
  selector: 'app-property-detail',
  standalone: true,
  template: `
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <span class="text-[10px] tracking-widest uppercase text-(--color-brand-secondary) block mb-2">Architectural Monograph</span>
      <h1 class="font-serif text-3xl sm:text-4xl text-(--color-brand-primary)">Property: {{ propertySlug() }}</h1>
      <p class="text-xs text-(--color-brand-secondary) mt-2">Represented by {{ tenant().branding.agencyName }}</p>
    </section>
  `
})
export class PropertyDetailComponent {
  public readonly tenant = input.required<Tenant>();
  public readonly propertySlug = input.required<string>();
}
