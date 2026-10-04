import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgeComponent } from '../../shared/ui-primitives/badge/badge.component';
import { ButtonComponent } from '../../shared/ui-primitives/button/button.component';
import { InputComponent } from '../../shared/ui-primitives/input/input.component';
import { RangeSliderComponent } from '../../shared/ui-primitives/range-slider/range-slider.component';
import { SelectComponent, SelectOption } from '../../shared/ui-primitives/select/select.component';
import { SheetModalComponent } from '../../shared/ui-primitives/sheet-modal/sheet-modal.component';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { PropertyDataService } from '../../core/services/property-data.service';
import { PropertyFilterCriteria, PropertyMedia } from '../../core/models';
import { formatCompactCurrency } from '../../core/utils/format.util';
import { createDefaultFilterCriteria } from '../../core/utils/property-filter.util';
import { PropertyCardComponent } from '../../shared/compound/property-card/property-card.component';
import { ArchitecturalGalleryComponent } from '../../shared/compound/architectural-gallery/architectural-gallery.component';
import { PropertyFilterBarComponent } from '../../features/property-filter/property-filter-bar.component';
import { MortgageCalculatorComponent } from '../../features/mortgage-calculator/mortgage-calculator.component';
import { FloorPlanViewerComponent } from '../../features/floor-plan-viewer/floor-plan-viewer.component';
import { ScheduleTourDialogComponent } from '../../features/tour-booking/schedule-tour-dialog.component';
import { AgentProfile, FloorPlanHotspot, MonthlyPaymentBreakdown, TourBookingRequest } from '../../core/models';
import { MOCK_AGENTS } from '../../core/data/mock-data';

const PREVIEW_TENANT_ID = 't-1001-atelier';

type PreviewProperty = import('../../core/models').Property;

const SORT_OPTIONS: SelectOption[] = [
  { value: 'date_desc', label: 'Recently listed' },
  { value: 'price_asc', label: 'Price ascending' },
  { value: 'price_desc', label: 'Price descending' },
  { value: 'sqft_desc', label: 'Largest first' }
];

/**
 * Design-system preview surface.
 *
 * Renders every atomic primitive against the active tenant theme with live,
 * interactive state so the design foundation can be reviewed — and verified in
 * headless Chrome — independently of the storefront pages.
 */
@Component({
  selector: 'app-ui-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    RouterLink,
    PropertyCardComponent,
    ArchitecturalGalleryComponent,
    PropertyFilterBarComponent,
    MortgageCalculatorComponent,
    FloorPlanViewerComponent,
    ScheduleTourDialogComponent,
    BadgeComponent,
    ButtonComponent,
    InputComponent,
    RangeSliderComponent,
    SelectComponent,
    SheetModalComponent
  ],
  template: `
    <div class="min-h-screen bg-(--color-brand-bg) text-(--color-brand-text)">
      <header class="border-b border-(--color-brand-line) bg-(--color-brand-surface)">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div class="flex flex-col">
            <span class="editorial-serif text-xl text-(--color-brand-primary)">Design System</span>
            <span class="editorial-label text-(--color-brand-secondary)">Atomic primitives</span>
          </div>
          <a
            routerLink="/t/atelier-living"
            class="inline-flex items-center justify-center min-h-11 px-4 editorial-label border border-(--color-brand-line) hover:border-(--color-brand-primary)"
            >Back to storefront</a
          >
        </div>
      </header>

      <main class="max-w-5xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-12">
        <section class="flex flex-col gap-4">
          <h1 class="text-2xl editorial-serif text-(--color-brand-primary)">Button</h1>
          <div class="flex flex-wrap items-center gap-3">
            <ui-button label="Primary" (clicked)="onButtonClick('primary')" />
            <ui-button label="Secondary" variant="secondary" (clicked)="onButtonClick('secondary')" />
            <ui-button label="Outline" variant="outline" (clicked)="onButtonClick('outline')" />
            <ui-button label="Ghost" variant="ghost" (clicked)="onButtonClick('ghost')" />
            <ui-button label="Loading" [loading]="true" />
            <ui-button label="Disabled" [disabled]="true" />
            <ui-button label="Small" size="sm" variant="outline" />
            <ui-button label="Large" size="lg" />
          </div>
          <p class="text-xs text-(--color-brand-secondary)" data-testid="button-log">
            Last activation: {{ lastButtonActivation() }}
          </p>
        </section>

        <section class="grid gap-6 sm:grid-cols-2">
          <div class="flex flex-col gap-4">
            <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Input</h2>
            <ui-input
              label="Full name"
              placeholder="Elena Rostova"
              [value]="fullName()"
              [hint]="'Used on the tour request form'"
              (valueChange)="fullName.set($event)"
            />
            <ui-input
              label="Email"
              type="email"
              placeholder="you@agency.com"
              [value]="email()"
              [error]="emailError()"
              (valueChange)="onEmailInput($event)"
            />
            <ui-input
              label="Disabled reference"
              value="Read-only field"
              [disabled]="true"
            />
          </div>

          <div class="flex flex-col gap-4">
            <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Select</h2>
            <ui-select
              label="Sort by"
              [options]="sortOptions"
              [value]="sortBy()"
              (valueChange)="sortBy.set($event)"
            />
            <ui-select
              label="Neighborhood"
              [options]="neighborhoods()"
              [value]="neighborhood()"
              placeholder="Any neighborhood"
              (valueChange)="neighborhood.set($event)"
            />
            <div class="flex flex-wrap gap-2 pt-2">
              <ui-badge label="Active" tone="accent" />
              <ui-badge label="Under contract" />
              <ui-badge label="Featured" tone="inverse" />
              <ui-badge label="Archived" tone="outline" />
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-4">
          <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Range slider</h2>
          <ui-range-slider
            label="Price envelope"
            [min]="priceBounds().min"
            [max]="priceBounds().max"
            [step]="250000"
            [currentMin]="priceRange()[0]"
            [currentMax]="priceRange()[1]"
            [formatValue]="formatPrice"
            (rangeChange)="priceRange.set($event)"
          />
          <p class="text-xs text-(--color-brand-secondary)" data-testid="range-log">
            Selected: {{ priceRange()[0] | number }} — {{ priceRange()[1] | number }}
          </p>
          <p class="text-xs text-(--color-brand-secondary)">
            Active tenant: {{ activeTenantLabel() }}
          </p>
        </section>

        <section class="flex flex-col gap-4">
          <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Sheet modal</h2>
          <div class="flex flex-wrap gap-3">
            <ui-button label="Open bottom sheet" (clicked)="openSheet('bottom')" />
            <ui-button label="Open right drawer" variant="outline" (clicked)="openSheet('right')" />
          </div>
        </section>

        <section class="flex flex-col gap-4">
          <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Property card</h2>
          <div class="grid gap-5 sm:grid-cols-2">
            @for (entry of previewProperties(); track entry.id) {
              <app-property-card [property]="entry" [currency]="entry.currency" (selected)="onPropertySelected($event)" />
            }
          </div>
          <p class="text-xs text-(--color-brand-secondary)" data-testid="card-log">
            Selected residence: {{ selectedPropertySlug() }}
          </p>
        </section>

        <section class="flex flex-col gap-4">
          <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Architectural gallery</h2>
          <app-architectural-gallery [media]="galleryMedia()" (indexChange)="galleryIndex.set($event)" />
          <p class="text-xs text-(--color-brand-secondary)" data-testid="gallery-log">
            Active slide: {{ galleryIndex() + 1 }}
          </p>
        </section>

        <section class="flex flex-col gap-4">
          <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Filter bar</h2>
          <app-property-filter-bar
            [activeFilters]="previewCriteria()"
            [properties]="previewProperties()"
            [resultCount]="previewProperties().length"
            (filterChanged)="previewCriteria.set($event)"
          />
          <p class="text-xs text-(--color-brand-secondary)" data-testid="filter-log">
            Active types: {{ previewCriteria().propertyTypes.length }} · sort:
            {{ previewCriteria().sortBy }}
          </p>
        </section>

        @if (previewProperty(); as subject) {
          <section class="flex flex-col gap-4">
            <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Mortgage calculator</h2>
            <div class="border border-(--color-brand-line) p-4 sm:p-6">
              <app-mortgage-calculator
                [initialPrice]="subject.price"
                [currency]="subject.currency"
                (calculationUpdated)="lastBreakdown.set($event)"
              />
            </div>
            <p class="text-xs text-(--color-brand-secondary)" data-testid="mortgage-log">
              Last envelope: {{ lastBreakdown()?.totalMonthlyPayment ?? 'pending' }}
            </p>
          </section>

          <section class="flex flex-col gap-4">
            <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Floor plan viewer</h2>
            <div class="border border-(--color-brand-line) p-4 sm:p-6">
              <app-floor-plan-viewer [levels]="subject.floorPlans" (hotspotClicked)="activeHotspot.set($event)" />
            </div>
            <p class="text-xs text-(--color-brand-secondary)" data-testid="hotspot-log">
              Active hotspot: {{ activeHotspot()?.title ?? 'none' }}
            </p>
          </section>

          <section class="flex flex-col gap-4">
            <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Tour booking</h2>
            <div class="flex flex-wrap gap-3">
              <ui-button label="Schedule a tour" (clicked)="tourDialogOpen.set(true)" />
            </div>
          </section>

          <app-schedule-tour-dialog
            [isOpen]="tourDialogOpen()"
            [property]="subject"
            [agent]="previewAgent()!"
            (closed)="tourDialogOpen.set(false)"
            (bookingCompleted)="confirmedTour.set($event)"
          />
        }
      </main>

      @if (confirmedTour(); as booking) {
        <p class="mx-auto max-w-5xl px-4 pb-8 text-xs text-(--color-brand-secondary)" data-testid="booking-log">
          Booking persisted: {{ booking.id.slice(0, 8) }} · {{ booking.agentIsActive ? 'agent verified' : 'unverified' }}
        </p>
      }

      <ui-sheet-modal
        [isOpen]="sheetOpen()"
        [title]="sheetTitle()"
        description="Review the selection before continuing. The sheet adapts to the on-screen keyboard height."
        [position]="sheetPosition()"
        (closed)="sheetOpen.set(false)"
      >
        <div class="flex flex-col gap-3 text-sm text-(--color-brand-secondary)">
          <p>
            Minimum {{ priceRange()[0] | number }} — maximum {{ priceRange()[1] | number }} across
            {{ neighborhoods().length }} neighborhoods.
          </p>
          <p class="text-xs">Escape closes this dialog and returns focus to the trigger.</p>
        </div>
        <div sheetFooter class="flex gap-3">
          <ui-button label="Confirm" fullWidth (clicked)="sheetOpen.set(false)" />
          <ui-button label="Cancel" variant="outline" fullWidth (clicked)="sheetOpen.set(false)" />
        </div>
      </ui-sheet-modal>
    </div>
  `
})
export class UiPreviewComponent {
  private readonly tenantContext = inject(TenantContextService);
  private readonly propertyData = inject(PropertyDataService);

  protected readonly previewProperties = signal<PreviewProperty[]>([]);
  protected readonly previewCriteria = signal<PropertyFilterCriteria>(createDefaultFilterCriteria());
  protected readonly selectedPropertySlug = signal('none');
  protected readonly galleryIndex = signal(0);
  protected readonly galleryMedia = signal<PropertyMedia[]>([]);
  // The richest plan set exercises the level switcher and clamped hotspots.
  protected readonly previewProperty = computed(
    () =>
      [...this.previewProperties()].sort((a, b) => b.floorPlans.length - a.floorPlans.length)[0] ?? null
  );
  protected readonly previewAgent = computed<AgentProfile | null>(() => {
    const subject = this.previewProperty();
    if (!subject) {
      return null;
    }
    return MOCK_AGENTS.find((agent) => agent.id === subject.listingAgentId && agent.tenantId === subject.tenantId) ?? null;
  });
  protected readonly lastBreakdown = signal<MonthlyPaymentBreakdown | null>(null);
  protected readonly activeHotspot = signal<FloorPlanHotspot | null>(null);
  protected readonly tourDialogOpen = signal(false);
  protected readonly confirmedTour = signal<TourBookingRequest | null>(null);

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly sortBy = signal('date_desc');
  protected readonly neighborhood = signal('');
  protected readonly sheetOpen = signal(false);
  protected readonly sheetPosition = signal<'bottom' | 'right'>('bottom');
  protected readonly lastButtonActivation = signal('none');

  protected readonly priceBounds = signal({ min: 0, max: 15000000 });
  protected readonly priceRange = signal<[number, number]>([0, 15000000]);
  protected readonly neighborhoods = signal<SelectOption[]>([
    { value: 'oakland-hills', label: 'Oakland Hills' },
    { value: 'west-chelsea', label: 'West Chelsea' }
  ]);

  protected readonly emailError = computed(() => {
    const value = this.email();
    if (value === '') return null;
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value) ? null : 'Enter a valid email address.';
  });

  protected readonly activeTenantLabel = computed(() => this.tenantContext.activeTenant()?.branding.agencyName ?? 'none');

  protected readonly sheetTitle = computed(() =>
    this.sheetPosition() === 'right' ? 'Right drawer' : 'Bottom sheet'
  );

  protected readonly formatPrice = (value: number): string => formatCompactCurrency(value, 'USD');

  constructor() {
    void this.propertyData.loadPropertiesForTenant(PREVIEW_TENANT_ID).then((properties) => {
      this.previewProperties.set(properties);
      this.galleryMedia.set(properties.flatMap((property) => property.media).slice(0, 3));
    });
  }

  protected onPropertySelected(slug: string): void {
    this.selectedPropertySlug.set(slug);
  }

  protected onButtonClick(variant: string): void {
    this.lastButtonActivation.set(`${variant}@${Date.now()}`);
  }

  protected onEmailInput(value: string): void {
    this.email.set(value);
  }

  protected openSheet(position: 'bottom' | 'right'): void {
    this.sheetPosition.set(position);
    this.sheetOpen.set(true);
  }
}