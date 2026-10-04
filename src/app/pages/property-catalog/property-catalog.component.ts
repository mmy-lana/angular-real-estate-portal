import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Property, PropertyFilterCriteria, Tenant } from '../../core/models';
import { PropertyDataService } from '../../core/services/property-data.service';
import { createDefaultFilterCriteria, filterAndSortProperties } from '../../core/utils/property-filter.util';
import { formatCurrency, formatListingDate } from '../../core/utils/format.util';
import { resolveCoverImage } from '../../core/utils/property-filter.util';
import { buildResponsiveImageUrl } from '../../core/utils/media-resolver.util';
import { PropertyCardComponent } from '../../shared/compound/property-card/property-card.component';
import { PropertyFilterBarComponent } from '../../features/property-filter/property-filter-bar.component';
import { ButtonComponent } from '../../shared/ui-primitives/button/button.component';

const SKELETON_COUNT = 6;

/**
 * Tenant listing catalog.
 *
 * `tenant` is bound straight from the route's resolved data through
 * `withComponentInputBinding()`. Filtering runs as a pure signal pipeline over
 * the tenant-scoped listings, and the grid is tracked by `property.id` so DOM
 * nodes are reused when criteria change.
 */
@Component({
  selector: 'app-property-catalog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PropertyCardComponent, PropertyFilterBarComponent, ButtonComponent],
  templateUrl: './property-catalog.component.html'
})
export class PropertyCatalogComponent {
  public readonly tenant = input.required<Tenant>();

  private readonly propertyData = inject(PropertyDataService);
  private readonly router = inject(Router);

  protected readonly criteria = signal<PropertyFilterCriteria>(createDefaultFilterCriteria());
  protected readonly skeletonCards = Array.from({ length: SKELETON_COUNT }, (_, index) => index);

  protected readonly isLoading = computed(() => this.propertyData.state() === 'loading');
  protected readonly loadError = this.propertyData.error;

  protected readonly properties = computed(() => {
    const tenant = this.tenant();
    return this.propertyData.properties().filter((property) => property.tenantId === tenant.id);
  });

  protected readonly filteredProperties = computed(() =>
    filterAndSortProperties(this.properties(), this.criteria())
  );

  protected readonly leadProperty = computed(() => {
    const listed = this.properties();
    const featured = listed.find((property) => property.featured && property.status === 'active');
    return featured ?? listed[0] ?? null;
  });

  protected readonly leadImage = computed(() => {
    const lead = this.leadProperty();
    if (!lead) {
      return null;
    }
    const cover = resolveCoverImage(lead.media);
    return cover ? buildResponsiveImageUrl(cover.url, 1600) : null;
  });

  protected readonly remainingProperties = computed(() => {
    const lead = this.leadProperty();
    return this.filteredProperties().filter((property) => property.id !== lead?.id);
  });

  constructor() {
    effect(() => {
      const tenant = this.tenant();
      if (tenant) {
        void this.propertyData.loadPropertiesForTenant(tenant.id);
      }
    });

    effect(() => {
      const tenant = this.tenant();
      if (tenant) {
        this.criteria.set(createDefaultFilterCriteria());
      }
    });
  }

  protected detailLink(property: Property): string[] {
    return ['/t', this.tenant().slug, 'property', property.slug];
  }

  protected formatPrice(price: number, currency: string): string {
    return formatCurrency(price, currency);
  }

  protected formatPublished(value: string | null): string {
    return formatListingDate(value);
  }

  protected onFilterChanged(criteria: PropertyFilterCriteria): void {
    this.criteria.set(criteria);
  }

  protected resetFilters(): void {
    this.criteria.set(createDefaultFilterCriteria());
  }

  protected retryLoad(): void {
    void this.propertyData.loadPropertiesForTenant(this.tenant().id);
  }

  protected async onSelected(slug: string): Promise<void> {
    await this.router.navigate(['/t', this.tenant().slug, 'property', slug]);
  }
}