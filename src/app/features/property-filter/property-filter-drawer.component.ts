import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { Property, PropertyFilterCriteria, PropertyStatus, PropertyType } from '../../core/models';
import { PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS, formatCompactCurrency } from '../../core/utils/format.util';
import {
  clearFilterCriteria,
  cloneFilterCriteria,
  createDefaultFilterCriteria,
  deriveNeighborhoods,
  togglePropertyType
} from '../../core/utils/property-filter.util';
import { SelectComponent, SelectOption } from '../../shared/ui-primitives/select/select.component';
import { RangeSliderComponent } from '../../shared/ui-primitives/range-slider/range-slider.component';
import { ButtonComponent } from '../../shared/ui-primitives/button/button.component';
import { SheetModalComponent } from '../../shared/ui-primitives/sheet-modal/sheet-modal.component';

const STATUS_ORDER: PropertyStatus[] = ['draft', 'active', 'pending', 'under_contract', 'sold', 'archived'];
const TYPE_ORDER: PropertyType[] = [
  'architectural_estate',
  'minimalist_villa',
  'urban_penthouse',
  'historic_renovation',
  'coastal_residence'
];

const BATHROOM_OPTIONS: SelectOption[] = [
  { value: '', label: 'Any bathrooms' },
  { value: '2', label: '2+ bathrooms' },
  { value: '3', label: '3+ bathrooms' },
  { value: '4', label: '4+ bathrooms' }
];

/** Slider granularity: $500 across multi-million portfolios. */
const PRICE_STEP = 500;

/**
 * Full filter surface presented as a bottom sheet on mobile.
 *
 * Edits are staged in a local draft so dismissing the sheet discards changes,
 * while the explicit apply button publishes a new criteria object upward.
 */
@Component({
  selector: 'app-property-filter-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetModalComponent, RangeSliderComponent, SelectComponent, ButtonComponent],
  templateUrl: './property-filter-drawer.component.html'
})
export class PropertyFilterDrawerComponent {
  public readonly isOpen = input<boolean>(false);
  public readonly activeFilters = input.required<PropertyFilterCriteria>();
  public readonly properties = input<Property[]>([]);

  public readonly closed = output<void>();
  public readonly criteriaApplied = output<PropertyFilterCriteria>();

  // Seeded with neutral criteria: required inputs are not readable during
  // construction, so the real draft is adopted by the effect below on open.
  protected readonly draft = signal<PropertyFilterCriteria>(createDefaultFilterCriteria());
  protected readonly priceRange = signal<[number, number]>([0, 0]);
  protected readonly typeLabels = PROPERTY_TYPE_LABELS;
  protected readonly typeOrder = TYPE_ORDER;
  protected readonly statusOrder = STATUS_ORDER;
  protected readonly statusLabels = PROPERTY_STATUS_LABELS;
  protected readonly bathroomOptions = BATHROOM_OPTIONS;
  protected readonly priceStep = PRICE_STEP;
  protected readonly formatPrice = (value: number): string => formatCompactCurrency(value, 'USD');

  protected readonly priceBounds = computed(() => {
    const properties = this.properties();
    if (properties.length === 0) {
      return { min: 0, max: PRICE_STEP };
    }
    const prices = properties.map((property) => property.price);
    const min = Math.floor(Math.min(...prices));
    const max = Math.ceil(Math.max(...prices));
    return { min, max: max === min ? min + PRICE_STEP : max };
  });

  protected readonly neighborhoodOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Any location' },
    ...deriveNeighborhoods(this.properties()).map((neighborhood) => ({ value: neighborhood, label: neighborhood }))
  ]);

  protected readonly maxSquareFeetOptions = computed<SelectOption[]>(() => {
    const properties = this.properties();
    if (properties.length === 0) {
      return [{ value: '', label: 'Any size' }];
    }
    const maxSqft = Math.max(...properties.map((property) => property.specs.interiorSquareFeet));
    return [
      { value: '', label: 'Any size' },
      { value: String(Math.round(maxSqft * 0.5 / 500) * 500), label: `${Math.round(maxSqft * 0.5 / 500) * 500}+ sq ft` },
      { value: String(Math.round(maxSqft * 0.75 / 500) * 500), label: `${Math.round(maxSqft * 0.75 / 500) * 500}+ sq ft` },
      { value: String(Math.round(maxSqft / 500) * 500), label: `${Math.round(maxSqft / 500) * 500}+ sq ft` }
    ];
  });

  constructor() {
    effect(() => {
      if (!this.isOpen()) {
        return;
      }
      const bounds = this.priceBounds();
      const criteria = cloneFilterCriteria(this.activeFilters());
      this.draft.set(criteria);
      this.priceRange.set([criteria.minPrice ?? bounds.min, criteria.maxPrice ?? bounds.max]);
    });
  }

  protected toggleType(type: PropertyType): void {
    this.draft.set(togglePropertyType(this.draft(), type));
  }

  protected toggleStatus(status: PropertyStatus): void {
    const next = cloneFilterCriteria(this.draft());
    next.status = next.status === status ? undefined : status;
    this.draft.set(next);
  }

  protected onPriceChange(range: [number, number]): void {
    const bounds = this.priceBounds();
    const [lower, upper] = range;
    const next = cloneFilterCriteria(this.draft());
    if (lower <= bounds.min) {
      delete next.minPrice;
    } else {
      next.minPrice = lower;
    }
    if (upper >= bounds.max) {
      delete next.maxPrice;
    } else {
      next.maxPrice = upper;
    }
    this.draft.set(next);
  }

  protected onNeighborhoodChange(value: string): void {
    const next = cloneFilterCriteria(this.draft());
    if (value === '') {
      delete next.neighborhood;
    } else {
      next.neighborhood = value;
    }
    this.draft.set(next);
  }

  protected onBedroomsChange(value: string): void {
    const next = cloneFilterCriteria(this.draft());
    if (value === '') {
      delete next.minBedrooms;
    } else {
      next.minBedrooms = Number(value);
    }
    this.draft.set(next);
  }

  protected onBathroomsChange(value: string): void {
    const next = cloneFilterCriteria(this.draft());
    if (value === '') {
      delete next.minBathrooms;
    } else {
      next.minBathrooms = Number(value);
    }
    this.draft.set(next);
  }

  protected onSquareFeetChange(value: string): void {
    const next = cloneFilterCriteria(this.draft());
    if (value === '') {
      delete next.minSquareFeet;
    } else {
      next.minSquareFeet = Number(value);
    }
    this.draft.set(next);
  }

  protected resetDraft(): void {
    const bounds = this.priceBounds();
    this.draft.set(clearFilterCriteria(this.activeFilters()));
    this.priceRange.set([bounds.min, bounds.max]);
  }

  protected apply(): void {
    this.criteriaApplied.emit(cloneFilterCriteria(this.draft()));
    this.closed.emit();
  }
}