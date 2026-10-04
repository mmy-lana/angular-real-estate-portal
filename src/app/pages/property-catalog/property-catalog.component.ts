import { Component, input } from '@angular/core';
import { Tenant } from '../../core/models';

@Component({
  selector: 'app-property-catalog',
  standalone: true,
  template: `
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div class="max-w-3xl mb-12">
        <span class="text-[10px] tracking-widest uppercase text-(--color-brand-secondary) block mb-2">Portfolio</span>
        <h1 class="font-serif text-4xl sm:text-5xl text-(--color-brand-primary) tracking-tight">
          Current Residences
        </h1>
        <p class="text-sm sm:text-base text-(--color-brand-secondary) mt-4 leading-relaxed">
          Curated selection of architectural properties under exclusive representation by {{ tenant().branding.agencyName }}.
        </p>
      </div>
      <div class="border-t border-stone-200/80 pt-8">
        <p class="text-xs text-stone-500 uppercase tracking-widest">Listing Pipeline Initialized</p>
      </div>
    </section>
  `
})
export class PropertyCatalogComponent {
  public readonly tenant = input.required<Tenant>();
}
