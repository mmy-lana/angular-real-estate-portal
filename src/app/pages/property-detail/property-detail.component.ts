import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgentProfile, MonthlyPaymentBreakdown, Property, Tenant } from '../../core/models';
import { PropertyDataService } from '../../core/services/property-data.service';
import { formatFullAddress, sortMediaByOrder } from '../../core/utils/media-resolver.util';
import {
  formatCeilingHeight,
  formatCurrency,
  formatLotSize,
  formatPropertyStatus,
  formatPropertyType,
  formatSquareFeet
} from '../../core/utils/format.util';
import { resolveCoverImage } from '../../core/utils/property-filter.util';
import { ArchitecturalGalleryComponent } from '../../shared/compound/architectural-gallery/architectural-gallery.component';
import { MortgageCalculatorComponent } from '../../features/mortgage-calculator/mortgage-calculator.component';
import { FloorPlanViewerComponent } from '../../features/floor-plan-viewer/floor-plan-viewer.component';
import { ScheduleTourDialogComponent } from '../../features/tour-booking/schedule-tour-dialog.component';
import { ButtonComponent } from '../../shared/ui-primitives/button/button.component';
import { BadgeComponent } from '../../shared/ui-primitives/badge/badge.component';

/**
 * Listing detail.
 *
 * `tenant` and `propertySlug` are bound from route data and params through
 * `withComponentInputBinding()`; the listing and its agent arrive through the
 * `listing` resolver payload, which already enforces the tenant boundary.
 */
@Component({
  selector: 'app-property-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ArchitecturalGalleryComponent,
    MortgageCalculatorComponent,
    FloorPlanViewerComponent,
    ScheduleTourDialogComponent,
    ButtonComponent,
    BadgeComponent
  ],
  templateUrl: './property-detail.component.html'
})
export class PropertyDetailComponent {
  public readonly tenant = input.required<Tenant>();
  public readonly propertySlug = input.required<string>();
  public readonly listing = input<{ property: Property; agent: AgentProfile | null } | null>(null);

  private readonly propertyData = inject(PropertyDataService);

  protected readonly tourDialogOpen = signal(false);
  protected readonly galleryIndex = signal(0);
  protected readonly payment = signal<MonthlyPaymentBreakdown | null>(null);
  protected readonly featureFlags = computed(() => this.tenant().features);

  protected readonly property = computed<Property | null>(() => {
    const resolved = this.listing()?.property ?? null;
    if (resolved) {
      return resolved;
    }
    return (
      this.propertyData
        .properties()
        .find((entry) => entry.tenantId === this.tenant().id && entry.slug === this.propertySlug()) ?? null
    );
  });

  protected readonly agent = computed<AgentProfile | null>(() => this.listing()?.agent ?? null);
  protected readonly orderedMedia = computed(() => sortMediaByOrder(this.property()?.media ?? []));
  protected readonly coverImage = computed(() => resolveCoverImage(this.property()?.media ?? []));
  protected readonly fullAddress = computed(() => {
    const property = this.property();
    return property ? formatFullAddress(property.address) : '';
  });

  protected readonly listingAgentName = computed(() => this.agent()?.fullName ?? 'Listing agent pending');
  protected readonly mortgageEnabled = computed(() => this.featureFlags().enableMortgageCalculator);
  protected readonly floorPlanEnabled = computed(
    () => this.featureFlags().enableInteractiveFloorPlan && (this.property()?.floorPlans.length ?? 0) > 0
  );
  protected readonly schedulingEnabled = computed(() => this.featureFlags().enableAgentScheduling);
  protected readonly agentCanSchedule = computed(() => {
    const agent = this.agent();
    return Boolean(agent && agent.isActive && agent.tenantId === this.tenant().id);
  });

  protected readonly specs = computed(() => {
    const property = this.property();
    if (!property) {
      return [];
    }
    return [
      { label: 'Bedrooms', value: String(property.specs.bedrooms) },
      { label: 'Bathrooms', value: String(property.specs.bathrooms) },
      { label: 'Powder rooms', value: String(property.specs.powderRooms) },
      { label: 'Interior', value: formatSquareFeet(property.specs.interiorSquareFeet) },
      { label: 'Exterior', value: formatSquareFeet(property.specs.exteriorSquareFeet) },
      { label: 'Lot', value: formatLotSize(property.specs.lotSizeAcres) },
      { label: 'Ceiling height', value: formatCeilingHeight(property.specs.ceilingHeightFeet) },
      { label: 'Parking', value: `${property.specs.parkingSpaces} spaces` },
      { label: 'Completed', value: String(property.specs.yearBuilt) },
      { label: 'Energy', value: property.specs.energyRating ?? 'Not certified' },
      { label: 'Architect', value: property.specs.architectName ?? 'Unattributed' },
      { label: 'Structure', value: property.specs.structuralMaterial.join(', ') }
    ];
  });

  protected readonly amenities = computed(() => this.property()?.amenities ?? []);

  constructor() {
    effect(() => {
      const tenant = this.tenant();
      if (tenant) {
        void this.propertyData.loadPropertiesForTenant(tenant.id);
      }
    });
  }

  protected formatPrice(price: number, currency: string): string {
    return formatCurrency(price, currency);
  }

  protected statusLabel(): string {
    const property = this.property();
    return property ? formatPropertyStatus(property.status) : '';
  }

  protected typeLabel(): string {
    const property = this.property();
    return property ? formatPropertyType(property.type) : '';
  }

  protected agentMailHref(): string {
    const agent = this.agent();
    return agent ? `mailto:${agent.email}` : `mailto:${this.tenant().branding.contactEmail}`;
  }

  protected agentPhoneHref(): string {
    const agent = this.agent();
    const phone = agent?.phone ?? this.tenant().branding.contactPhone;
    return `tel:${phone.replace(/[^\d+]/g, '')}`;
  }

  protected openTourDialog(): void {
    if (this.schedulingEnabled() && this.agentCanSchedule()) {
      this.tourDialogOpen.set(true);
    }
  }
}