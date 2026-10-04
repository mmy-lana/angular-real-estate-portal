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
import { validateAndSanitizeSvgIngest } from '../../core/utils/floorplan-transform.util';
import { buildAmortizationSummary, computeMonthlyMortgage } from '../../core/utils/mortgage.util';
import { DynamicThemeService } from '../../core/services/dynamic-theme.service';
import { TourBookingService, createBookingId } from '../../core/services/tour-booking.service';
import { BOOKING_STORE, IndexedDbStorageService } from '../../core/services/indexed-db-storage.service';
import { MortgageCalculationInput, TenantThemeTokens } from '../../core/models';

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

          <section class="flex flex-col gap-4" data-testid="invariants">
            <h2 class="text-2xl editorial-serif text-(--color-brand-primary)">Domain invariants</h2>
            <p class="text-xs text-(--color-brand-secondary) text-pretty">
              Runs the security, financial and data-integrity guarantees of the core layer against the live
              runtime and reports the result of each assertion.
            </p>
            <div class="flex flex-wrap gap-3">
              <ui-button label="Run invariant checks" (clicked)="runInvariants()" [loading]="invariantsRunning()" />
            </div>
            @if (invariantResults().length > 0) {
              <ul class="flex flex-col divide-y divide-(--color-brand-line) border border-(--color-brand-line)">
                @for (result of invariantResults(); track result.key) {
                  <li class="flex items-start gap-3 p-3" [attr.data-testid]="'invariant-' + result.key">
                    <span
                      class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                      [class.bg-green-100]="result.ok"
                      [class.text-green-800]="result.ok"
                      [class.bg-red-100]="!result.ok"
                      [class.text-red-800]="!result.ok"
                      aria-hidden="true"
                    >
                      {{ result.ok ? 'OK' : '!' }}
                    </span>
                    <span class="min-w-0">
                      <span class="block text-xs text-(--color-brand-primary)">{{ result.label }}</span>
                      <span class="mt-0.5 block break-words text-[11px] text-(--color-brand-secondary)">
                        {{ result.detail }}
                      </span>
                    </span>
                  </li>
                }
              </ul>
            }
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
  private readonly themeService = inject(DynamicThemeService);
  private readonly bookingService = inject(TourBookingService);
  private readonly storage = inject(IndexedDbStorageService);

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

  protected readonly invariantsRunning = signal(false);
  protected readonly invariantResults = signal<{ key: string; label: string; ok: boolean; detail: string }[]>([]);

  /**
   * Executes the core-layer guarantees in the live runtime.
   *
   * These checks exist because none of the guarantees can be asserted from
   * types alone: the SVG sanitizer depends on DOMParser, the financial rules on
   * cent-level arithmetic, and the booking authorization on real storage.
   */
  protected async runInvariants(): Promise<void> {
    if (this.invariantsRunning()) {
      return;
    }
    this.invariantsRunning.set(true);
    this.invariantResults.set([]);
    const results: { key: string; label: string; ok: boolean; detail: string }[] = [];

    results.push(this.checkSvgSanitizer());
    results.push(...this.checkFinancialReconciliation());
    results.push(this.checkBookingIdentifiers());
    results.push(this.checkThemeValidation());
    results.push(await this.checkBookingAuthorization());

    this.invariantResults.set(results);
    this.invariantsRunning.set(false);
  }

  private checkSvgSanitizer() {
    const vectors: { name: string; payload: string }[] = [
      { name: 'non-whitespace attribute delimiter', payload: '<svg/onload=alert(1)>' },
      {
        name: 'entity-encoded javascript url',
        payload: '<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="jav&#x61;script:alert(1)"><text>x</text></a></svg>'
      },
      {
        name: 'nested script element',
        payload: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>'
      },
      {
        name: 'foreign object escape',
        payload:
          '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>'
      },
      {
        name: 'style attribute url fetch',
        payload: '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(javascript:alert(1))"/></svg>'
      },
      {
        name: 'data uri href',
        payload: '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html;base64,PHNjcmlwdD4="/></svg>'
      }
    ];

    const offenders: string[] = [];
    const rendered: string[] = [];

    for (const vector of vectors) {
      const output = validateAndSanitizeSvgIngest(vector.payload);
      rendered.push(`${vector.name} -> ${output === '' ? '(discarded)' : output.slice(0, 90)}`);
      if (/<script|\son\w+\s*=|javascript:|data:text\/html|<foreignobject/i.test(output)) {
        offenders.push(vector.name);
      }
    }

    const retainedShape = validateAndSanitizeSvgIngest(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>'
    );

    return {
      key: 'svg-sanitizer',
      label: 'SVG sanitization strips executable markup',
      ok: offenders.length === 0 && retainedShape.includes('<path'),
      detail: offenders.length === 0
        ? `All ${vectors.length} adversarial vectors neutralized; path geometry retained. ${rendered.join(' | ')}`
        : `Leaked: ${offenders.join(', ')}`
    };
  }

  private checkFinancialReconciliation() {
    const profiles: MortgageCalculationInput[] = [
      { homePrice: 6850000, downPaymentAmount: 1370000, interestRatePercentage: 6.5, loanTermYears: 30, annualPropertyTaxRatePercentage: 1.1, annualHomeInsuranceRatePercentage: 0.45, monthlyHoaFee: 0 },
      { homePrice: 1234567.89, downPaymentAmount: 123456.79, interestRatePercentage: 5.375, loanTermYears: 15, annualPropertyTaxRatePercentage: 1.234, annualHomeInsuranceRatePercentage: 0.567, monthlyHoaFee: 137.5 },
      { homePrice: 999999.99, downPaymentAmount: 0, interestRatePercentage: 0, loanTermYears: 30, annualPropertyTaxRatePercentage: 0.005, annualHomeInsuranceRatePercentage: 0.111, monthlyHoaFee: 0.01 }
    ];

    const mismatches: string[] = [];
    // Components are compared in whole cents. Binary floating point cannot sum
    // four two-decimal values exactly (0.1 + 0.2 !== 0.3), so the guarantee that
    // actually matters — and that a client reads off the statement — is that the
    // line items reconcile to the cent.
    const toCents = (value: number): number => Math.round(value * 100);

    for (const profile of profiles) {
      const breakdown = computeMonthlyMortgage(profile);
      const sumInCents =
        toCents(breakdown.principalAndInterest) +
        toCents(breakdown.propertyTax) +
        toCents(breakdown.homeownersInsurance) +
        toCents(breakdown.hoaDues);
      if (sumInCents !== toCents(breakdown.totalMonthlyPayment)) {
        mismatches.push(`${sumInCents} cents != ${toCents(breakdown.totalMonthlyPayment)} cents`);
      }

      const schedule = buildAmortizationSummary(profile, breakdown);
      const final = schedule[schedule.length - 1];
      if (schedule.length > 0 && (final.remainingBalance !== 0 || schedule.some((row) => row.remainingBalance < 0))) {
        mismatches.push('amortization did not settle at zero');
      }
    }

    return [{
      key: 'financial-reconciliation',
      label: 'Payment envelope reconciles to the cent',
      ok: mismatches.length === 0,
      detail:
        mismatches.length === 0
          ? `${profiles.length} profiles reconcile exactly and amortization settles at zero.`
          : mismatches.join(' | ')
    }];
  }

  private checkBookingIdentifiers() {
    const original = crypto.randomUUID;
    let produced = '';

    try {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
      produced = createBookingId();
    } catch (error) {
      produced = `threw: ${error instanceof Error ? error.message : 'unknown'}`;
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }

    const isHex32 = /^[0-9a-f]{32}$/.test(produced);
    return {
      key: 'booking-identifier',
      label: 'Booking references use a secure random source',
      ok: isHex32,
      detail: isHex32
        ? `Fallback path produced a 32-character CSPRNG token (${produced.slice(0, 8)}…).`
        : `Unexpected identifier: ${produced}`
    };
  }

  private checkThemeValidation() {
    const hostile: TenantThemeTokens = {
      primaryColor: 'red; background: url("//evil.example")',
      secondaryColor: '#6B6864',
      accentColor: '#B59E7D',
      surfaceColor: '#F5F3EF',
      backgroundColor: '#FAFAF7',
      textColor: '#1A1918',
      fontFamilySerif: '"Playfair Display", serif',
      fontFamilySans: 'system-ui; } body { display:none',
      borderRadiusBase: '2px; } html {'
    };

    const root = document.documentElement.style;
    this.themeService.applyTheme(hostile);
    const primary = root.getPropertyValue('--color-brand-primary').trim();
    const radius = root.getPropertyValue('--radius-brand').trim();
    const fontSans = root.getPropertyValue('--font-sans-brand').trim();

    const activeTheme = this.tenantContext.activeTenant()?.branding.themeTokens;
    if (activeTheme) {
      this.themeService.applyTheme(activeTheme);
    }

    const ok =
      primary.toLowerCase() === '#2c2b29' &&
      radius === '2px' &&
      !fontSans.includes('body {');

    return {
      key: 'theme-validation',
      label: 'Theme tokens are validated before injection',
      ok,
      detail: `primary=${primary} radius=${radius} fontSans=${fontSans}`
    };
  }

  private async checkBookingAuthorization() {
    const subject = this.previewProperty();
    const agent = this.previewAgent();
    if (!subject || !agent) {
      return {
        key: 'booking-authorization',
        label: 'Cancellation requires verified client identity',
        ok: false,
        detail: 'Preview listing or agent unavailable.'
      };
    }

    const email = `probe.${Date.now().toString(16)}@example.com`;
    const created = await this.bookingService.createBooking({
      tenantId: subject.tenantId,
      propertyId: subject.id,
      agentId: agent.id,
      clientName: 'Invariant Probe',
      clientEmail: email,
      clientPhone: '+1 415 555 0100',
      scheduledDateTime: new Date(Date.now() + 86_400_000).toISOString(),
      tourType: 'in_person',
      status: 'requested'
    });

    if (!created.ok) {
      return {
        key: 'booking-authorization',
        label: 'Cancellation requires verified client identity',
        ok: false,
        detail: `Probe booking rejected: ${created.reason}`
      };
    }

    const booking = created.booking;
    const wrongEmail = await this.bookingService.cancelBooking(booking.tenantId, booking.id, 'attacker@example.com');
    const malformedEmail = await this.bookingService.cancelBooking(booking.tenantId, booking.id, 'not-an-email');
    const crossTenant = await this.bookingService.cancelBooking('t-0000-other', booking.id, email);

    const afterAttempts = await this.bookingService.listBookingsForTenant(booking.tenantId);
    const stillActive = afterAttempts.find((entry) => entry.id === booking.id)?.status === 'requested';

    const verified = await this.bookingService.cancelBooking(booking.tenantId, booking.id, email);
    const storage = this.storage;
    await storage.delete(BOOKING_STORE, booking.id);

    const ok =
      !wrongEmail.ok &&
      wrongEmail.reason.includes('email does not match') &&
      !malformedEmail.ok &&
      !crossTenant.ok &&
      stillActive &&
      verified.ok;

    return {
      key: 'booking-authorization',
      label: 'Cancellation requires verified client identity',
      ok,
      detail: ok
        ? 'Wrong email, malformed email and cross-tenant cancellation were all refused; the verified client succeeded.'
        : `wrong=${JSON.stringify(wrongEmail)} malformed=${JSON.stringify(malformedEmail)} crossTenant=${JSON.stringify(crossTenant)} intact=${stillActive} verified=${JSON.stringify(verified)}`
    };
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