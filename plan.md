# Architecture and Implementation Specification: Real Estate Multi-Tenant Portal

## 1. System Overview and Multi-Tenant Architecture

The Real Estate Multi-Tenant Portal is a web application tailored for high-end architectural real estate agencies. The platform isolates data, branding, and domain configurations per tenant while utilizing a shared Angular frontend infrastructure styled with Tailwind CSS.

### Multi-Tenancy Strategy
- **Resolution Strategy**: Hybrid resolution via URL slug path (`/t/:tenantSlug/...`) or hostname resolution (`tenant-subdomain.domain.com` or custom CNAME) mapped via `tenantResolver`.
- **Data Isolation**: IndexedDB storage partitioned by `tenantId`. Every query, mutation, and state slice enforces strict tenant boundary validation.
- **Dynamic Theming Engine**: CSS variables injected into the root DOM element dynamically based on tenant brand palettes (neutral tones, typography scales, border radiuses, and accent hues).

### Aesthetic Identity
- **Palette**: Editorial architectural palette. Muted bone/travertine (`#F7F5F0`), chalk white (`#FFFFFF`), warm slate (`#2A2C2E`), charcoal graphite (`#121314`), and warm bronze accents (`#A38A63`).
- **Typography**: Architectural editorial style with serif headlines paired with clean geometric sans for UI metrics.
- **Layout**: Clean grid systems, hairline borders (`border-stone-200/80`), asymmetric image placement, and expansive whitespace.

---

## 2. Data Schema and Pure TypeScript Interfaces

```typescript
export type UUID = string;
export type ISODateTimeString = string;

export type UserRole = 'super_admin' | 'tenant_admin' | 'agent' | 'client';

export type PropertyStatus = 
  | 'draft' 
  | 'active' 
  | 'pending' 
  | 'under_contract' 
  | 'sold' 
  | 'archived';

export type PropertyType = 
  | 'architectural_estate' 
  | 'minimalist_villa' 
  | 'urban_penthouse' 
  | 'historic_renovation' 
  | 'coastal_residence';

export interface TenantThemeTokens {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  surfaceColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamilySerif: string;
  fontFamilySans: string;
  borderRadiusBase: string;
}

export interface TenantBranding {
  logoUrl: string;
  faviconUrl: string;
  agencyName: string;
  tagline: string;
  legalEntityName: string;
  contactEmail: string;
  contactPhone: string;
  licenseNumber: string;
  themeTokens: TenantThemeTokens;
}

export interface TenantFeatureFlags {
  enableMortgageCalculator: boolean;
  enableInteractiveFloorPlan: boolean;
  enableVirtualTours: boolean;
  enableAgentScheduling: boolean;
  enableValuationEstimator: boolean;
}

export interface Tenant {
  id: UUID;
  slug: string;
  customDomain: string | null;
  isActive: boolean;
  branding: TenantBranding;
  features: TenantFeatureFlags;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface AgentProfile {
  id: UUID;
  tenantId: UUID;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string;
  bio: string;
  avatarUrl: string;
  licenseCode: string;
  socialLinks: {
    linkedin?: string;
    instagram?: string;
  };
  isActive: boolean;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PropertyAddress {
  streetAddress: string;
  unit?: string;
  neighborhood: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  coordinates: Coordinates;
}

export interface ArchitecturalSpecs {
  bedrooms: number;
  bathrooms: number;
  powderRooms: number;
  interiorSquareFeet: number;
  exteriorSquareFeet: number;
  lotSizeAcres: number;
  yearBuilt: number;
  architectName?: string;
  structuralMaterial: string[];
  ceilingHeightFeet: number;
  parkingSpaces: number;
  energyRating?: string;
}

export interface PropertyMedia {
  id: UUID;
  url: string;
  caption: string;
  order: number;
  isCover: boolean;
  type: 'interior' | 'exterior' | 'aerial' | 'floorplan' | 'detail';
}

export interface FloorPlanHotspot {
  id: UUID;
  xRatio: number; // Invariant: must clamp to [0.0, 1.0]
  yRatio: number; // Invariant: must clamp to [0.0, 1.0]
  title: string;
  description: string;
  associatedMediaId?: UUID;
}

export interface FloorPlanLevel {
  id: UUID;
  levelName: string;
  levelIndex: number;
  svgContent: string; // Pre-sanitized inline vector SVG markup to eliminate CSP origin violations
  width: number;
  height: number;
  hotspots: FloorPlanHotspot[];
}

export interface Property {
  id: UUID;
  tenantId: UUID;
  title: string;
  slug: string;
  tagline: string;
  description: string;
  price: number;
  currency: string;
  status: PropertyStatus;
  type: PropertyType;
  featured: boolean;
  address: PropertyAddress;
  specs: ArchitecturalSpecs;
  amenities: string[];
  media: PropertyMedia[];
  floorPlans: FloorPlanLevel[];
  listingAgentId: UUID;
  publishedAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface MortgageCalculationInput {
  homePrice: number;
  downPaymentAmount: number;
  interestRatePercentage: number;
  loanTermYears: number;
  annualPropertyTaxRatePercentage: number;
  annualHomeInsuranceRatePercentage: number;
  monthlyHoaFee: number;
}

export interface MonthlyPaymentBreakdown {
  principalAndInterest: number;
  propertyTax: number;
  homeownersInsurance: number;
  hoaDues: number;
  totalMonthlyPayment: number;
}

export interface PropertyFilterCriteria {
  searchQuery?: string;
  propertyTypes: PropertyType[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  minSquareFeet?: number;
  neighborhood?: string;
  status?: PropertyStatus;
  sortBy: 'price_asc' | 'price_desc' | 'date_desc' | 'sqft_desc';
}

export interface TourBookingRequest {
  id: UUID;
  tenantId: UUID;
  propertyId: UUID;
  agentId: UUID;
  agentIsActive: boolean;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  scheduledDateTime: ISODateTimeString;
  tourType: 'in_person' | 'virtual_live';
  notes?: string;
  status: 'requested' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: ISODateTimeString;
}
```

---

## 3. Component Architecture (Angular Standalone)

```
src/app/
+-- core/
|   +-- guards/
|   |   +-- tenant-active.guard.ts
|   |   +-- auth.guard.ts
|   +-- resolvers/
|   |   +-- tenant.resolver.ts
|   +-- services/
|   |   +-- tenant-context.service.ts
|   |   +-- dynamic-theme.service.ts
|   |   +-- indexed-db-storage.service.ts
|   |   +-- property-data.service.ts
|   |   +-- tour-booking.service.ts
|   +-- tokens/
|   |   +-- window-token.ts
|   +-- utils/
|       +-- mortgage.util.ts
|       +-- property-filter.util.ts
|       +-- floorplan-transform.util.ts
|       +-- media-resolver.util.ts
+-- shared/
|   +-- ui-primitives/
|   |   +-- button/
|   |   |   +-- button.component.ts
|   |   +-- input/
|   |   |   +-- input.component.ts
|   |   +-- badge/
|   |   |   +-- badge.component.ts
|   |   +-- range-slider/
|   |   |   +-- range-slider.component.ts
|   |   |   +-- range-slider.component.css
|   |   +-- sheet-modal/
|   |   |   +-- sheet-modal.component.ts
|   |   +-- select/
|   |       +-- select.component.ts
|   +-- compound/
|       +-- architectural-gallery/
|       |   +-- architectural-gallery.component.ts
|       +-- property-card/
|       |   +-- property-card.component.ts
|       +-- tenant-nav/
|       |   +-- tenant-nav.component.ts
|       +-- tenant-footer/
|           +-- tenant-footer.component.ts
+-- features/
|   +-- mortgage-calculator/
|   |   +-- mortgage-calculator.component.ts
|   +-- floor-plan-viewer/
|   |   +-- floor-plan-viewer.component.ts
|   +-- property-filter/
|   |   +-- property-filter-bar.component.ts
|   |   +-- property-filter-drawer.component.ts
|   +-- tour-booking/
|       +-- schedule-tour-dialog.component.ts
+-- pages/
|   +-- tenant-shell/
|   |   +-- tenant-shell.component.ts
|   +-- property-catalog/
|   |   +-- property-catalog.component.ts
|   +-- property-detail/
|   |   +-- property-detail.component.ts
|   +-- not-found/
|       +-- not-found.component.ts
```

### Component Hierarchy Matrix

| Layer | Component Name | Inputs / Signals | Outputs / Events |
|---|---|---|---|
| UI Primitive | `ButtonComponent` | `variant = input<'primary' \| 'secondary' \| 'outline' \| 'ghost'>('primary')`, `size = input<'sm' \| 'md' \| 'lg'>('md')`, `disabled = input<boolean>(false)`, `loading = input<boolean>(false)` | `clicked = output<MouseEvent>()` |
| UI Primitive | `InputComponent` | `label = input<string>('')`, `error = input<string \| null>(null)`, `type = input<string>('text')`, `value = input<string>('')` | `valueChange = output<string>()` |
| UI Primitive | `RangeSliderComponent` | `min = input<number>(0)`, `max = input<number>(100)`, `step = input<number>(1)`, `currentMin = input<number>(0)`, `currentMax = input<number>(100)` | `rangeChange = output<[number, number]>()` |
| UI Primitive | `SheetModalComponent` | `isOpen = input<boolean>(false)`, `title = input<string>('')`, `position = input<'bottom' \| 'right'>('bottom')` | `closed = output<void>()` |
| Compound | `PropertyCardComponent` | `property = input.required<Property>()`, `currency = input<string>('USD')` | `selected = output<string>()` |
| Compound | `ArchitecturalGalleryComponent`| `media = input.required<PropertyMedia[]>()`, `initialIndex = input<number>(0)` | `indexChange = output<number>()` |
| Feature | `MortgageCalculatorComponent` | `initialPrice = input.required<number>()`, `currency = input<string>('USD')` | `calculationUpdated = output<MonthlyPaymentBreakdown>()` |
| Feature | `FloorPlanViewerComponent` | `levels = input.required<FloorPlanLevel[]>()` | `hotspotClicked = output<FloorPlanHotspot>()` |
| Feature | `PropertyFilterBarComponent` | `activeFilters = input.required<PropertyFilterCriteria>()` | `filterChanged = output<PropertyFilterCriteria>()` |
| Feature | `ScheduleTourDialogComponent` | `property = input.required<Property>()`, `agent = input.required<AgentProfile>()` | `bookingCompleted = output<TourBookingRequest>()` |

---

## 4. Core Feature Logic and Algorithms

### A. Dynamic Theming Logic (`DynamicThemeService`)
Updates CSS variables at runtime when resolving tenants.

```typescript
import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TenantThemeTokens } from '../models';

@Injectable({ providedIn: 'root' })
export class DynamicThemeService {
  private readonly document = inject(DOCUMENT);

  public applyTheme(tokens: TenantThemeTokens): void {
    const rootStyle = this.document.documentElement.style;
    rootStyle.setProperty('--color-brand-primary', tokens.primaryColor);
    rootStyle.setProperty('--color-brand-secondary', tokens.secondaryColor);
    rootStyle.setProperty('--color-brand-accent', tokens.accentColor);
    rootStyle.setProperty('--color-brand-surface', tokens.surfaceColor);
    rootStyle.setProperty('--color-brand-bg', tokens.backgroundColor);
    rootStyle.setProperty('--color-brand-text', tokens.textColor);
    rootStyle.setProperty('--font-serif-brand', tokens.fontFamilySerif);
    rootStyle.setProperty('--font-sans-brand', tokens.fontFamilySans);
    rootStyle.setProperty('--radius-brand', tokens.borderRadiusBase);
  }
}
```

### B. Mortgage Amortization Algorithm (`core/utils/mortgage.util.ts`)
Calculates monthly principal, interest, taxes, and insurance payments with numerical domain safety.

```typescript
import { MortgageCalculationInput, MonthlyPaymentBreakdown } from '../models';

export function computeMonthlyMortgage(input: MortgageCalculationInput): MonthlyPaymentBreakdown {
  if (input.loanTermYears <= 0 || input.homePrice <= 0) {
    throw new RangeError('Loan term years and home price must be strictly positive numbers');
  }

  const principal = Math.max(0, input.homePrice - Math.max(0, input.downPaymentAmount));
  const monthlyRate = Math.max(0, input.interestRatePercentage / 100) / 12;
  const numberOfPayments = input.loanTermYears * 12;

  let monthlyPrincipalAndInterest = 0;
  if (monthlyRate > 0 && numberOfPayments > 0) {
    const compoundFactor = Math.pow(1 + monthlyRate, numberOfPayments);
    monthlyPrincipalAndInterest = principal * (monthlyRate * compoundFactor) / (compoundFactor - 1);
  } else if (numberOfPayments > 0) {
    monthlyPrincipalAndInterest = principal / numberOfPayments;
  }

  const propertyTaxRate = Math.max(0, input.annualPropertyTaxRatePercentage);
  const insuranceRate = Math.max(0, input.annualHomeInsuranceRatePercentage);
  const hoaFee = Math.max(0, input.monthlyHoaFee);

  const monthlyPropertyTax = (input.homePrice * (propertyTaxRate / 100)) / 12;
  const monthlyInsurance = (input.homePrice * (insuranceRate / 100)) / 12;
  const total = monthlyPrincipalAndInterest + monthlyPropertyTax + monthlyInsurance + hoaFee;

  return {
    principalAndInterest: Number(monthlyPrincipalAndInterest.toFixed(2)),
    propertyTax: Number(monthlyPropertyTax.toFixed(2)),
    homeownersInsurance: Number(monthlyInsurance.toFixed(2)),
    hoaDues: Number(hoaFee.toFixed(2)),
    totalMonthlyPayment: Number(total.toFixed(2))
  };
}
```

### C. Signal-Based Property Filtering and Sorting Pipeline (`core/utils/property-filter.util.ts`)
Pure functional pipeline that filters and sorts property listings within Angular Signals.

```typescript
import { Property, PropertyMedia, PropertyFilterCriteria } from '../models';

export function resolveCoverImage(media: PropertyMedia[]): PropertyMedia | null {
  if (!media || media.length === 0) return null;
  const covers = media.filter(m => m.isCover);
  return covers[0] ?? media[0];
}

export function filterAndSortProperties(
  properties: Property[],
  criteria: PropertyFilterCriteria
): Property[] {
  return properties
    .filter(property => {
      if (property.status === 'active' && !property.publishedAt) {
        return false;
      }
      if (criteria.status && property.status !== criteria.status) {
        return false;
      }
      if (criteria.propertyTypes.length > 0 && !criteria.propertyTypes.includes(property.type)) {
        return false;
      }
      if (criteria.minPrice !== undefined && property.price < criteria.minPrice) {
        return false;
      }
      if (criteria.maxPrice !== undefined && property.price > criteria.maxPrice) {
        return false;
      }
      if (criteria.minBedrooms !== undefined && property.specs.bedrooms < criteria.minBedrooms) {
        return false;
      }
      if (criteria.minBathrooms !== undefined && property.specs.bathrooms < criteria.minBathrooms) {
        return false;
      }
      if (criteria.minSquareFeet !== undefined && property.specs.interiorSquareFeet < criteria.minSquareFeet) {
        return false;
      }
      if (criteria.neighborhood && criteria.neighborhood.trim() !== '') {
        const query = criteria.neighborhood.toLowerCase();
        const matchesNeighborhood = property.address.neighborhood.toLowerCase().includes(query);
        const matchesCity = property.address.city.toLowerCase().includes(query);
        if (!matchesNeighborhood && !matchesCity) {
          return false;
        }
      }
      if (criteria.searchQuery && criteria.searchQuery.trim() !== '') {
        const query = criteria.searchQuery.toLowerCase();
        const matchesTitle = property.title.toLowerCase().includes(query);
        const matchesDesc = property.description.toLowerCase().includes(query);
        const matchesStreet = property.address.streetAddress.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesStreet) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      switch (criteria.sortBy) {
        case 'price_asc':
          return a.price - b.price;
        case 'price_desc':
          return b.price - a.price;
        case 'sqft_desc':
          return b.specs.interiorSquareFeet - a.specs.interiorSquareFeet;
        case 'date_desc':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
}
```

### D. Floorplan Transform, Hotspot Clamping, and Ingest Sanitization (`core/utils/floorplan-transform.util.ts`)

```typescript
export interface ViewportTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export function clampHotspotCoordinate(ratio: number): number {
  return Math.min(1.0, Math.max(0.0, ratio));
}

/**
 * Strips script tags, inline event listeners, and javascript: links from raw SVG strings.
 * Scope note: Used exclusively for controlled seed and ingest data. If opening system
 * to untrusted user-uploaded SVGs, upgrade to DOMPurify with { USE_PROFILES: { svg: true } }.
 */
export function validateAndSanitizeSvgIngest(rawSvg: string): string {
  if (!rawSvg) return '';
  return rawSvg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/(\son\w+\s*=\s*["'][^"']*["'])|(\son\w+\s*=\s*[^\s>]+)/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    .trim();
}

export function calculateBoundedTransform(
  current: ViewportTransform,
  deltaScale: number,
  deltaX: number,
  deltaY: number,
  containerWidth: number,
  containerHeight: number,
  minScale = 1.0,
  maxScale = 4.0
): ViewportTransform {
  const nextScale = Math.min(Math.max(current.scale * deltaScale, minScale), maxScale);
  const maxTranslateX = (containerWidth * (nextScale - 1)) / 2;
  const maxTranslateY = (containerHeight * (nextScale - 1)) / 2;

  const unclampedX = current.translateX + deltaX;
  const unclampedY = current.translateY + deltaY;

  const nextTranslateX = Math.min(Math.max(unclampedX, -maxTranslateX), maxTranslateX);
  const nextTranslateY = Math.min(Math.max(unclampedY, -maxTranslateY), maxTranslateY);

  return {
    scale: Number(nextScale.toFixed(4)),
    translateX: Number(nextTranslateX.toFixed(2)),
    translateY: Number(nextTranslateY.toFixed(2))
  };
}
```

### E. IndexedDB Singleton Storage Service Implementation (`core/services/indexed-db-storage.service.ts`)
Prevents `VersionError` race conditions across concurrent navigations and deep links.

```typescript
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class IndexedDbStorageService {
  private readonly DB_NAME = 'real_estate_portal_db';
  private readonly DB_VERSION = 1;
  private dbInstancePromise: Promise<IDBDatabase> | null = null;

  public getDatabase(): Promise<IDBDatabase> {
    if (!this.dbInstancePromise) {
      this.dbInstancePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('tenants')) {
            const store = db.createObjectStore('tenants', { keyPath: 'id' });
            store.createIndex('slug', 'slug', { unique: true });
          }
          if (!db.objectStoreNames.contains('properties')) {
            const store = db.createObjectStore('properties', { keyPath: 'id' });
            store.createIndex('tenantId', 'tenantId', { unique: false });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('price', 'price', { unique: false });
          }
          if (!db.objectStoreNames.contains('agents')) {
            const store = db.createObjectStore('agents', { keyPath: 'id' });
            store.createIndex('tenantId', 'tenantId', { unique: false });
          }
          if (!db.objectStoreNames.contains('bookings')) {
            const store = db.createObjectStore('bookings', { keyPath: 'id' });
            store.createIndex('tenantId', 'tenantId', { unique: false });
            store.createIndex('propertyId', 'propertyId', { unique: false });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          this.dbInstancePromise = null;
          reject(request.error);
        };
      });
    }
    return this.dbInstancePromise;
  }
}
```

### F. Tour Booking Agent Validation Logic (`core/services/tour-booking.service.ts`)
Enforces agent activity checks and cross-tenant boundary isolation prior to persisting inquiries.

```typescript
import { Injectable, inject } from '@angular/core';
import { IndexedDbStorageService } from './indexed-db-storage.service';
import { TourBookingRequest, AgentProfile } from '../models';

@Injectable({ providedIn: 'root' })
export class TourBookingService {
  private readonly storage = inject(IndexedDbStorageService);

  public async createBooking(booking: Omit<TourBookingRequest, 'id' | 'createdAt' | 'agentIsActive'>): Promise<TourBookingRequest> {
    const db = await this.storage.getDatabase();

    const agent = await new Promise<AgentProfile | undefined>((resolve, reject) => {
      const tx = db.transaction('agents', 'readonly');
      const store = tx.objectStore('agents');
      const request = store.get(booking.agentId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!agent || !agent.isActive) {
      throw new Error('Cannot schedule tour: assigned agent is invalid or inactive');
    }

    if (agent.tenantId !== booking.tenantId) {
      throw new Error('Security violation: assigned agent does not belong to the target tenant');
    }

    const newBooking: TourBookingRequest = {
      ...booking,
      id: crypto.randomUUID(),
      agentIsActive: true,
      createdAt: new Date().toISOString()
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('bookings', 'readwrite');
      const store = tx.objectStore('bookings');
      const request = store.add(newBooking);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    return newBooking;
  }
}
```

### G. Routing Configuration, Resolver, Guard, and Shell Assembly (`app.routes.ts`)

```typescript
import { Routes, ResolveFn, CanActivateFn, Router, RedirectCommand } from '@angular/router';
import { inject } from '@angular/core';
import { Tenant } from './core/models';
import { TenantContextService } from './core/services/tenant-context.service';
import { TenantShellComponent } from './pages/tenant-shell/tenant-shell.component';

export const tenantResolver: ResolveFn<Tenant | RedirectCommand> = async (route) => {
  const slug = route.paramMap.get('tenantSlug');
  const context = inject(TenantContextService);
  const router = inject(Router);

  if (!slug) {
    return new RedirectCommand(router.parseUrl('/404'));
  }

  const tenant = await context.loadTenantBySlug(slug);
  if (!tenant) {
    return new RedirectCommand(router.parseUrl('/404'));
  }

  return tenant;
};

export const tenantActiveGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  let snapshot = route;
  while (snapshot.parent) {
    if (snapshot.parent.data['tenant']) {
      const tenant = snapshot.parent.data['tenant'] as Tenant;
      return tenant.isActive ? true : router.createUrlTree(['/404']);
    }
    snapshot = snapshot.parent;
  }
  return router.createUrlTree(['/404']);
};

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 't/atelier-living'
  },
  {
    path: '404',
    loadComponent: () => import('./pages/not-found/not-found.component').then(m => m.NotFoundComponent)
  },
  {
    path: 't/:tenantSlug',
    component: TenantShellComponent,
    resolve: { tenant: tenantResolver },
    canActivate: [tenantActiveGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/property-catalog/property-catalog.component').then(m => m.PropertyCatalogComponent)
      },
      {
        path: 'property/:propertySlug',
        loadComponent: () => import('./pages/property-detail/property-detail.component').then(m => m.PropertyDetailComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: '/404'
  }
];
```

In `TenantShellComponent` (`src/app/pages/tenant-shell/tenant-shell.component.ts`):
```typescript
import { Component, input, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Tenant } from '../../core/models';
import { DynamicThemeService } from '../../core/services/dynamic-theme.service';
import { TenantNavComponent } from '../../shared/compound/tenant-nav/tenant-nav.component';
import { TenantFooterComponent } from '../../shared/compound/tenant-footer/tenant-footer.component';

@Component({
  selector: 'app-tenant-shell',
  standalone: true,
  imports: [RouterOutlet, TenantNavComponent, TenantFooterComponent],
  template: `
    <div class="min-h-screen flex flex-col bg-(--color-brand-bg) text-(--color-brand-text)">
      <app-tenant-nav [tenant]="tenant()" />
      <main class="flex-1">
        <router-outlet />
      </main>
      <app-tenant-footer [tenant]="tenant()" />
    </div>
  `
})
export class TenantShellComponent {
  private readonly themeService = inject(DynamicThemeService);
  public readonly tenant = input.required<Tenant>();

  constructor() {
    effect(() => {
      this.themeService.applyTheme(this.tenant().branding.themeTokens);
    });
  }
}
```

---

## 5. Five-Phase Sequential Implementation Queue

### Phase 1: Types, Storage/API Client Config, and Base Utilities

- [x] **1.1 Multi-Tenant Core Interfaces**
  - Implement full TypeScript contracts: `Tenant`, `Property`, `AgentProfile`, `TourBookingRequest`, and `MortgageCalculationInput`.
  - Validate zero-null ambiguity for tenant IDs across models.

- [x] **1.2 IndexedDB Database Schema Configuration & Seeding**
  - Implement storage service (`IndexedDbStorageService`) wrapping native IndexedDB with singleton initialization promise.
  - Setup object stores: `tenants` (index: `slug`), `properties` (indexes: `tenantId`, `status`, `type`, `price`), `agents` (index: `tenantId`), and `bookings` (indexes: `tenantId`, `propertyId`).
  - Seed dataset containing at least 2 distinct luxury architectural tenants: *Atelier Living* and *Monolith Real Estate*.
  - Contract mandate: When seeding `FloorPlanLevel` records into IndexedDB, pipe all `svgContent` values through `validateAndSanitizeSvgIngest` before executing the `store.add()` call.

- [x] **1.3 Tenant Context, Router Providers, and Resolver Architecture**
  - Configure root application providers in `app.config.ts` using `provideRouter(routes, withComponentInputBinding())` and `provideHttpClient()`.
  - Implement `tenantResolver` returning `ResolveFn<Tenant | RedirectCommand>`.
  - Implement `tenantActiveGuard` traversing route snapshots and returning `router.createUrlTree(['/404'])` on inactive tenants.
  - Define explicit `/404` route and `**` wildcard redirect in `app.routes.ts`.

- [x] **1.4 Currency, Unit, and Architectural Formatters**
  - Create pure utility functions in `core/utils/`: `computeMonthlyMortgage`, `filterAndSortProperties`, `resolveCoverImage`, `calculateBoundedTransform`, `clampHotspotCoordinate`, and `validateAndSanitizeSvgIngest`.

---

### Phase 2: Design Foundation and Atomic UI Primitives

- [x] **2.1 Tailwind CSS Theme Tokens**
  - Configure `@theme inline` block in `src/styles.css` to declare dynamic utility tokens without circular variable self-reference:
    ```css
    @theme inline {
      --color-brand-primary: initial;
      --color-brand-secondary: initial;
      --color-brand-accent: initial;
      --color-brand-surface: initial;
      --color-brand-bg: initial;
      --color-brand-text: initial;
      --font-serif-brand: initial;
      --font-sans-brand: initial;
    }
    ```
  - Syntax convention mandate: all component templates must strictly use the Tailwind arbitrary variable syntax (e.g. `bg-(--color-brand-bg)`, `text-(--color-brand-text)`, `border-(--color-brand-accent)`). The deprecated shorthand syntax (`bg-brand-bg`) is strictly forbidden across all templates.
  - Mobile-first breakpoints: `360px`, `390px`, `430px`, `768px`, `1024px`, `1440px`.

- [x] **2.2 Atomic Component: `ButtonComponent`**
  - Implement standalone button with signal inputs `variant = input<'primary' | 'secondary' | 'outline' | 'ghost'>('primary')` and `loading = input<boolean>(false)`.
  - Accessible states: Focus visible outlines, tactile tap feedback, min 44x44px touch targets on mobile viewports.

- [x] **2.3 Atomic Component: `InputComponent` and `SelectComponent`**
  - High-precision editorial inputs using signal inputs: `value = input<string>('')`, `valueChange = output<string>()`.
  - Uppercase tracking labels (`text-[10px] tracking-widest uppercase`).
  - Strict validation error states, accessible ARIA attributes (`aria-invalid`, `aria-describedby`).

- [x] **2.4 Atomic Component: `RangeSliderComponent`**
  - Dual-thumb or single-thumb touch-ready slider using `rangeChange = output<[number, number]>()`.
  - Encapsulated touch isolation: declare `.slider-track { touch-action: none; }` inside `range-slider.component.css` targeting only the inner track container `div`. Never bind `touch-action` on `:host`.

- [x] **2.5 Atomic Component: `SheetModalComponent`**
  - Responsive dialog: Bottom-sheet behavior on mobile (`< 768px`).
  - Listen to `window.visualViewport.addEventListener('resize', ...)` and update dynamic property `--sheet-max-height: ${visualViewport.height * 0.85}px` on the sheet inner container, preventing iOS Safari keyboard expansion collapse.
  - Native keyboard escape handling and focus trapping.

---

### Phase 3: Compound Molecules and Feature Components

- [x] **3.1 Editorial Architectural Navigation (`TenantNavComponent`)**
  - Agency wordmark and branding fetched from `tenant()` input signal.
  - Desktop: Minimal horizontal links with inline contact hotline and tenant selector switch.
  - Mobile: Fixed top bar with bottom-sheet hamburger drawer menu.

- [x] **3.2 Property Card Component (`PropertyCardComponent`)**
  - Aspect ratio 4:3 or 16:10 for photography with resolved single cover image via `resolveCoverImage`.
  - Specs row (beds · baths · sqft) styled with `truncate max-w-full`. Architect credit rendered on dedicated secondary line on desktop, hidden on viewports `< 390px` to prevent overflow.
  - Output binding: `selected = output<string>()`. Actions always touch-accessible.

- [x] **3.3 Architectural Gallery (`ArchitecturalGalleryComponent`)**
  - High-resolution imagery carousel. Lightbox rendered directly to `document.body` via Angular CDK `Overlay` portal to prevent clipping from parent CSS transforms on iOS Safari.
  - Horizontal drag and touch swipe gestures via pointer events.
  - Thumbnail track navigation with current slide index indicator.

- [x] **3.4 Search and Filter Bar (`PropertyFilterBarComponent`)**
  - Sticky sub-nav header with quick filters: Property Type, Price Bounds, Bedroom count.
  - Trigger for mobile bottom-sheet filter panel (`PropertyFilterDrawerComponent`).
  - Reactive Signal outputs bound to catalog state.

- [x] **3.5 Tenant Footer (`TenantFooterComponent`)**
  - Multi-column footer displaying agency licensing, broker credentials, address, and tenant switch utility.

---

### Phase 4: Domain Logic, Reactive State, and Specialized APIs

- [x] **4.1 Mortgage Calculator Feature (`MortgageCalculatorComponent`)**
  - Interactive pricing breakdown with real-time recalculation using `computeMonthlyMortgage()`.
  - SVG donut chart visualizer showing ratio of Principal/Interest vs. Property Tax vs. Insurance vs. HOA.
  - Preset defaults populated automatically from current property listing price.

- [x] **4.2 Interactive Floor Plan Viewer (`FloorPlanViewerComponent`)**
  - Render floor plans via inline SVG bound to `[innerHTML]="trustedSvg()"`. Compute `trustedSvg` via `this.sanitizer.bypassSecurityTrustHtml(this.level().svgContent)`. All SVG content stored in IndexedDB is pre-sanitized through `validateAndSanitizeSvgIngest` at ingest/seed time.
  - Pan and pinch-to-zoom engine using `calculateBoundedTransform`.
  - Hotspot coordinates strictly validated and clamped via `clampHotspotCoordinate` within `[0.0, 1.0]`.
  - Level switcher (e.g., "Ground Floor", "Upper Terrace", "Subterranean Cellar").

- [x] **4.3 Schedule Tour Feature (`ScheduleTourDialogComponent`)**
  - Interactive appointment booking workflow.
  - Validation check in `TourBookingService.createBooking()` to verify `listingAgent.isActive === true` and `listingAgent.tenantId === booking.tenantId` before persisting.
  - Lead capture form (Name, Email, Phone, Tour Type) with automatic validation.
  - Persists directly into IndexedDB `bookings` store with tenant isolation and denormalized `agentIsActive: true`.

- [x] **4.4 Tenant Switcher Utility**
  - Floating minimal selector allowing instantaneous switching between demo tenants to verify context isolation, branding, and listings.

---

### Phase 5: Complete Page Assembly and Responsive Shell

- [x] **5.1 Root Tenant Shell Layout (`TenantShellComponent`)**
  - Coordinate header, dynamic main container, and footer.
  - Apply tenant CSS theme tokens inside `effect()` without signal write collisions.

- [x] **5.2 Property Catalog View (`PropertyCatalogComponent`)**
  - Explicit component input binding contract: `readonly tenant = input.required<Tenant>();` bound directly from parent route resolve data via `withComponentInputBinding()`.
  - Hero section highlighting tenant agency statement and lead property.
  - Editorial grid for listings with `@for (property of filteredProperties(); track property.id)` to guarantee DOM node reuse and avoid frame drops.
  - Empty state with clear filter reset triggers.
  - Skeleton loaders matching architectural image aspect ratios during state transitions.

- [x] **5.3 Property Detail View (`PropertyDetailComponent`)**
  - Explicit component input binding contract: `readonly tenant = input.required<Tenant>();` and `readonly propertySlug = input.required<string>();` bound directly from parent resolve data and route params via `withComponentInputBinding()`.
  - Split layout on desktop (`>= 768px`): Left-side expansive imagery narrative and floor plans; sticky right-side inquiry rail.
  - Stacked mobile layout (`< 768px`): Bottom fixed CTA bar mounted as a distinct DOM node (`fixed bottom-0 inset-x-0 z-40 bg-(--color-brand-surface) border-t p-4`) outside parent scroll containers to prevent sticky context collapse.
  - Full integration of `ArchitecturalGalleryComponent`, `FloorPlanViewerComponent`, and `MortgageCalculatorComponent`.

- [x] **5.4 Comprehensive Viewport and Touch Verification**
  - Validate layout behavior at 360px (small devices), 390px (standard mobile), 430px (large mobile), 768px (tablet portrait), and 1024px+ (desktop).
  - Guarantee all interactive elements have 44px minimum touch targets and that no data or actions are locked behind hover states.

---

## 6. Seed Dataset

```typescript
import { Tenant, Property, AgentProfile } from './core/models';
import { validateAndSanitizeSvgIngest } from './core/utils/floorplan-transform.util.ts';

export const MOCK_TENANTS: Tenant[] = [
  {
    id: 't-1001-atelier',
    slug: 'atelier-living',
    customDomain: null,
    isActive: true,
    branding: {
      agencyName: 'Atelier Living',
      tagline: 'Pure Architectural Residences',
      legalEntityName: 'Atelier Living Real Estate LLC',
      logoUrl: '/assets/tenants/atelier/logo.svg',
      faviconUrl: '/assets/tenants/atelier/favicon.ico',
      contactEmail: 'concierge@atelierliving.com',
      contactPhone: '+1 (415) 890-2100',
      licenseNumber: 'CA-DRE #02194831',
      themeTokens: {
        primaryColor: '#2C2B29',
        secondaryColor: '#6B6864',
        accentColor: '#B59E7D',
        surfaceColor: '#F5F3EF',
        backgroundColor: '#FAFAF7',
        textColor: '#1A1918',
        fontFamilySerif: '"Playfair Display", Georgia, serif',
        fontFamilySans: '"Plus Jakarta Sans", system-ui, sans-serif',
        borderRadiusBase: '2px'
      }
    },
    features: {
      enableMortgageCalculator: true,
      enableInteractiveFloorPlan: true,
      enableVirtualTours: true,
      enableAgentScheduling: true,
      enableValuationEstimator: false
    },
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z'
  },
  {
    id: 't-2002-monolith',
    slug: 'monolith-properties',
    customDomain: null,
    isActive: true,
    branding: {
      agencyName: 'Monolith Real Estate',
      tagline: 'Brutalist & Minimalist Masterpieces',
      legalEntityName: 'Monolith Realty Group Corp',
      logoUrl: '/assets/tenants/monolith/logo.svg',
      faviconUrl: '/assets/tenants/monolith/favicon.ico',
      contactEmail: 'acquisitions@monolith.com',
      contactPhone: '+1 (212) 555-0199',
      licenseNumber: 'NY-REB #1094032',
      themeTokens: {
        primaryColor: '#111213',
        secondaryColor: '#4A4D50',
        accentColor: '#9E8872',
        surfaceColor: '#EBEBEB',
        backgroundColor: '#F2F2F2',
        textColor: '#0A0A0B',
        fontFamilySerif: '"Cormorant Garamond", Garamond, serif',
        fontFamilySans: '"Inter", system-ui, sans-serif',
        borderRadiusBase: '0px'
      }
    },
    features: {
      enableMortgageCalculator: true,
      enableInteractiveFloorPlan: true,
      enableVirtualTours: false,
      enableAgentScheduling: true,
      enableValuationEstimator: true
    },
    createdAt: '2026-01-15T10:30:00.000Z',
    updatedAt: '2026-01-15T10:30:00.000Z'
  }
];

export const MOCK_AGENTS: AgentProfile[] = [
  {
    id: 'ag-101-elena',
    tenantId: 't-1001-atelier',
    email: 'elena.rostova@atelierliving.com',
    fullName: 'Elena Rostova',
    role: 'agent',
    phone: '+1 (415) 890-2101',
    bio: 'Specialist in mid-century Japanese post-and-beam masterworks.',
    avatarUrl: '/assets/agents/elena.jpg',
    licenseCode: 'CA-DRE #01994821',
    socialLinks: { linkedin: 'https://linkedin.com' },
    isActive: true,
    createdAt: '2026-01-10T08:30:00.000Z',
    updatedAt: '2026-01-10T08:30:00.000Z'
  },
  {
    id: 'ag-201-marcus',
    tenantId: 't-2002-monolith',
    email: 'marcus.vance@monolith.com',
    fullName: 'Marcus Vance',
    role: 'agent',
    phone: '+1 (212) 555-0205',
    bio: 'Authority on board-formed concrete and urban architectural penthouses.',
    avatarUrl: '/assets/agents/marcus.jpg',
    licenseCode: 'NY-REB #1088412',
    socialLinks: { linkedin: 'https://linkedin.com' },
    isActive: true,
    createdAt: '2026-01-15T11:00:00.000Z',
    updatedAt: '2026-01-15T11:00:00.000Z'
  }
];

const RAW_FLOORPLAN_ATELIER = `
<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
  <rect x="50" y="50" width="700" height="500" fill="none" stroke="#2C2B29" stroke-width="2"/>
  <line x1="250" y1="50" x2="250" y2="550" stroke="#2C2B29" stroke-width="1.5"/>
  <line x1="550" y1="50" x2="550" y2="550" stroke="#2C2B29" stroke-width="1.5"/>
  <text x="100" y="300" font-family="sans-serif" font-size="14" fill="#6B6864">Primary Pavilion</text>
  <text x="350" y="300" font-family="sans-serif" font-size="14" fill="#6B6864">Central Courtyard</text>
  <text x="600" y="300" font-family="sans-serif" font-size="14" fill="#6B6864">Tea Gallery</text>
</svg>
`;

export const MOCK_PROPERTIES: Property[] = [
  {
    id: 'p-101-kura-house',
    tenantId: 't-1001-atelier',
    title: 'The Kura Residence',
    slug: 'the-kura-residence',
    tagline: 'Cedar, basalt, and light woven into an architectural sanctuary.',
    description: 'An expansive modernist sanctuary inspired by traditional Japanese storehouse aesthetics. Features charred cedar cladding, floor-to-ceiling glass corridors, and an interior moss courtyard.',
    price: 6850000,
    currency: 'USD',
    status: 'active',
    type: 'architectural_estate',
    featured: true,
    address: {
      streetAddress: '1420 Skyline Ridge Road',
      neighborhood: 'Oakland Hills',
      city: 'Oakland',
      stateProvince: 'CA',
      postalCode: '94611',
      country: 'USA',
      coordinates: { latitude: 37.8421, longitude: -122.2045 }
    },
    specs: {
      bedrooms: 4,
      bathrooms: 4,
      powderRooms: 1,
      interiorSquareFeet: 5200,
      exteriorSquareFeet: 1800,
      lotSizeAcres: 1.4,
      yearBuilt: 2024,
      architectName: 'Shinohara Associates',
      structuralMaterial: ['Charred Cedar', 'Board-Formed Concrete', 'Basalt'],
      ceilingHeightFeet: 12.5,
      parkingSpaces: 3,
      energyRating: 'LEED Platinum'
    },
    amenities: [
      'Zen Courtyard',
      'Geothermal Radiant Heating',
      'Saltwater Soaking Pool',
      'Wine Vault',
      'Smart Acoustic Insulation'
    ],
    media: [
      {
        id: 'm-101-1',
        url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
        caption: 'Exterior facade at twilight',
        order: 1,
        isCover: true,
        type: 'exterior'
      },
      {
        id: 'm-101-2',
        url: 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1600&q=80',
        caption: 'Main living gallery facing west',
        order: 2,
        isCover: false,
        type: 'interior'
      }
    ],
    floorPlans: [
      {
        id: 'fp-101-level-1',
        levelName: 'Main Residence Level',
        levelIndex: 1,
        svgContent: validateAndSanitizeSvgIngest(RAW_FLOORPLAN_ATELIER),
        width: 800,
        height: 600,
        hotspots: [
          {
            id: 'hs-101-1',
            xRatio: 0.31,
            yRatio: 0.5,
            title: 'Central Atrium',
            description: 'Double-height volume framing morning sunlight.',
            associatedMediaId: 'm-101-2'
          }
        ]
      }
    ],
    listingAgentId: 'ag-101-elena',
    publishedAt: '2026-02-01T09:00:00.000Z',
    createdAt: '2026-01-20T12:00:00.000Z',
    updatedAt: '2026-02-01T09:00:00.000Z'
  },
  {
    id: 'p-201-monolith-one',
    tenantId: 't-2002-monolith',
    title: 'The Brutalist Vault Penthouse',
    slug: 'the-brutalist-vault-penthouse',
    tagline: 'Raw concrete geometry suspended above Manhattan.',
    description: 'A bespoke triplex penthouse crafted from monolithic cast concrete, hand-hammered steel, and acoustic bronze glazing overlooking the skyline.',
    price: 14500000,
    currency: 'USD',
    status: 'active',
    type: 'urban_penthouse',
    featured: true,
    address: {
      streetAddress: '540 West 24th Street',
      unit: 'Penthouse A',
      neighborhood: 'West Chelsea',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10011',
      country: 'USA',
      coordinates: { latitude: 40.7495, longitude: -74.0048 }
    },
    specs: {
      bedrooms: 3,
      bathrooms: 4,
      powderRooms: 1,
      interiorSquareFeet: 6400,
      exteriorSquareFeet: 2100,
      lotSizeAcres: 0,
      yearBuilt: 2025,
      architectName: 'Studio Grauwacke',
      structuralMaterial: ['Cast Concrete', 'Raw Bronze', 'Smoked Oak'],
      ceilingHeightFeet: 14.0,
      parkingSpaces: 2,
      energyRating: 'Energy Star Certified'
    },
    amenities: [
      'Private Elevator Vestibule',
      'Panoramic Rooftop Terrace',
      'Bronze Reflecting Pool',
      'Art Storage Vault',
      '24-Hour Attended Lobby'
    ],
    media: [
      {
        id: 'm-201-1',
        url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80',
        caption: 'Cantilevered salon and terrace',
        order: 1,
        isCover: true,
        type: 'exterior'
      }
    ],
    floorPlans: [],
    listingAgentId: 'ag-201-marcus',
    publishedAt: '2026-02-10T14:00:00.000Z',
    createdAt: '2026-02-05T10:00:00.000Z',
    updatedAt: '2026-02-10T14:00:00.000Z'
  }
];