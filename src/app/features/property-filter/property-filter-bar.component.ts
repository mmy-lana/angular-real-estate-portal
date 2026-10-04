import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal
} from '@angular/core';
import { Property, PropertyFilterCriteria, PropertyType } from '../../core/models';
import { PROPERTY_TYPE_LABELS } from '../../core/utils/format.util';
import {
  clearFilterCriteria,
  cloneFilterCriteria,
  togglePropertyType
} from '../../core/utils/property-filter.util';
import { formatCompactCurrency } from '../../core/utils/format.util';
import { BadgeComponent } from '../../shared/ui-primitives/badge/badge.component';
import { ButtonComponent } from '../../shared/ui-primitives/button/button.component';
import { SelectComponent, SelectOption } from '../../shared/ui-primitives/select/select.component';
import { PropertyFilterDrawerComponent } from './property-filter-drawer.component';

const SORT_OPTIONS: SelectOption[] = [
  { value: 'date_desc', label: 'Recently listed' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'sqft_desc', label: 'Largest interior' }
];

const TYPE_ENTRIES: { value: PropertyType; label: string }[] = [
  { value: 'architectural_estate', label: 'Estate' },
  { value: 'minimalist_villa', label: 'Villa' },
  { value: 'urban_penthouse', label: 'Penthouse' },
  { value: 'historic_renovation', label: 'Renovation' },
  { value: 'coastal_residence', label: 'Coastal' }
];

const BEDROOM_OPTIONS: SelectOption[] = [
  { value: '', label: 'Any bedrooms' },
  { value: '2', label: '2+ bedrooms' },
  { value: '3', label: '3+ bedrooms' },
  { value: '4', label: '4+ bedrooms' },
  { value: '5', label: '5+ bedrooms' }
];

/**
 * Sticky catalog sub-navigation.
 *
 * Desktop exposes the primary facets inline; below 768px the facets collapse
 * into a bottom-sheet drawer so the listing grid keeps the full viewport.
 */
@Component({
  selector: 'app-property-filter-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BadgeComponent,
    ButtonComponent,
    SelectComponent,
    PropertyFilterDrawerComponent
  ],
  templateUrl: './property-filter-bar.component.html'
})
export class PropertyFilterBarComponent {
  public readonly activeFilters = input.required<PropertyFilterCriteria>();
  public readonly properties = input<Property[]>([]);
  public readonly resultCount = input<number>(0);

  public readonly filterChanged = output<PropertyFilterCriteria>();
  public readonly drawerOpened = output<void>();

  protected readonly drawerOpen = signal(false);
  protected readonly searchDraft = signal('');
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly typeEntries = TYPE_ENTRIES;
  protected readonly bedroomOptions = BEDROOM_OPTIONS;
  protected readonly typeLabels = PROPERTY_TYPE_LABELS;

  protected readonly criteria = computed(() => cloneFilterCriteria(this.activeFilters()));
  protected readonly priceBounds = computed(() => {
    const properties = this.properties();
    if (properties.length === 0) {
      return { min: 0, max: 0 };
    }
    const prices = properties.map((property) => property.price);
    const min = Math.floor(Math.min(...prices));
    const max = Math.ceil(Math.max(...prices));
    return { min, max: max === min ? min + 1 : max };
  });

  protected readonly activeTypeLabels = computed(() =>
    this.criteria()
      .propertyTypes.map((type) => PROPERTY_TYPE_LABELS[type])
      .join(', ')
  );

  protected readonly hasActiveFilters = computed(() => {
    const criteria = this.criteria();
    return (
      criteria.propertyTypes.length > 0 ||
      criteria.minPrice !== undefined ||
      criteria.maxPrice !== undefined ||
      criteria.minBedrooms !== undefined ||
      criteria.status !== undefined ||
      (criteria.searchQuery ?? '').trim() !== ''
    );
  });

  protected readonly formatPrice = (value: number): string => formatCompactCurrency(value, 'USD');

  constructor() {
    effect(() => {
      this.searchDraft.set(this.activeFilters().searchQuery ?? '');
    });
  }

  protected toggleType(type: PropertyType): void {
    this.emit(togglePropertyType(this.activeFilters(), type));
  }

  protected onSortChange(value: string): void {
    const next = cloneFilterCriteria(this.activeFilters());
    next.sortBy = (SORT_OPTIONS.find((option) => option.value === value)?.value ??
      'date_desc') as PropertyFilterCriteria['sortBy'];
    this.emit(next);
  }

  protected onBedroomsChange(value: string): void {
    const next = cloneFilterCriteria(this.activeFilters());
    if (value === '') {
      delete next.minBedrooms;
    } else {
      next.minBedrooms = Number(value);
    }
    this.emit(next);
  }

  protected onSearchInput(value: string): void {
    this.searchDraft.set(value);
  }

  protected onSearchCommit(): void {
    const next = cloneFilterCriteria(this.activeFilters());
    next.searchQuery = this.searchDraft();
    this.emit(next);
  }

  protected onDrawerCriteria(next: PropertyFilterCriteria): void {
    this.emit(next);
  }

  protected openDrawer(): void {
    this.drawerOpen.set(true);
    this.drawerOpened.emit();
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  protected reset(): void {
    this.searchDraft.set('');
    this.emit(clearFilterCriteria(this.activeFilters()));
  }

  private emit(criteria: PropertyFilterCriteria): void {
    this.filterChanged.emit(criteria);
  }
}