# Real Estate Multi-Tenant Portal

Multi-tenant frontend architecture and storefront portal for architectural real estate agencies. The application partitions branding, theme tokens, agents, listings, floor plans, and lead captures per tenant while running on a unified, high-performance Angular and Tailwind CSS platform.

- Repository: https://github.com/mmy-lana/angular-real-estate-portal
- Live Deployment: https://angular-real-estate-portal.vercel.app

---

## Architectural Highlights

- **Multi-Tenant Isolation**: Strict data partitioning at the storage and routing layers. URL routing (`/t/:tenantSlug`) and hostname resolution dynamically scope catalog queries, agent associations, and inquiry records.
- **Dynamic Runtime Theming**: Dynamic theme tokens (colors, font stacks, surface variables, border radiuses) are injected directly into `:root` styles on tenant resolution without requiring a rebuild or client reload.
- **Zero-Trust Security Baseline**:
  - **SVG Floor Plan Sanitization**: Uses an in-memory XML DOM parser to recursively sanitize vector schematics against script injection, dangerous attributes (`on*`), and unsafe URL protocols before rendering.
  - **Insecure Direct Object Reference (IDOR) Protection**: Booking mutations and cancellations strictly require email ownership verification before updating state.
  - **Inactive Tenant Resolution**: Route resolvers and parent route guards enforce tenant active states, redirecting inactive agency scopes to `/404` before view construction.
- **Tier-1 Financial Calculations**: Mortgage amortization and payment envelope calculations use integer-cent mathematical reconciliation to prevent IEEE 754 floating-point rounding drift across loan lifecycles.
- **Touch-First Responsive Engineering**: Fully tested across viewports (360px, 390px, 430px, 768px, 1024px, 1440px) with minimum 44x44px interactive touch targets, encapsulated touch actions (`touch-action: none` on sliders), and `visualViewport` compensation for mobile virtual keyboards.
- **Privacy & Telephony Compliance**: Synthetic dataset adheres strictly to RFC 2606 reserved domains (`*.example.com`) and North American Numbering Plan (NANP) fictional test exchanges (`555-0100` through `555-0199`).

---

## Technology Stack

- **Framework**: Angular (Standalone Components, Signals, Signal Inputs/Outputs, Control Flow syntax)
- **Styling**: Tailwind CSS (Tailwind v4 `@theme inline` runtime CSS variable integration)
- **Storage**: Client-side IndexedDB with atomic multi-store transactional seeding and in-memory degradation fallback
- **Routing**: Angular Router with component input binding, resolvers, and snapshot hierarchy guards
- **Overlay & Portals**: Angular CDK Overlay for transform-isolated full-screen gallery lightboxes
- **Tooling & Build**: Vite, `@analogjs/vite-plugin-angular`, TypeScript
- **Package Manager**: pnpm

---

## Core Domain Features

- **Editorial Property Catalog**: Asymmetrical architectural grid layout with status badges, price envelopes, area metrics, and lead hero presentation.
- **Faceted Search & Filter Engine**: Signal-based functional filter pipeline supporting full-text query, price range bounds, bedroom/bathroom counts, interior area, and property status.
- **Interactive Floor Plan Viewer**: Multi-level architectural schematic engine with pinch-to-zoom, pan bounds clamping, and coordinate-pinned hotspot markers linked to interior photography.
- **Mortgage Amortization Calculator**: Real-time payment envelope calculation with an SVG donut chart decomposition (principal/interest, taxes, home insurance, HOA dues).
- **Private Tour Scheduling Modal**: Date/slot reservation workflow with input validation, local IndexedDB persistence, agent verification, and automated cancellation protection.
- **In-Place Tenant Switcher**: Floating development and evaluation utility allowing immediate runtime switching between registered agency scopes (*Atelier Living* and *Monolith Real Estate*).

---

## Project Structure

```
src/
+-- main.ts                                  # Application bootstrap
+-- styles.css                               # Global Tailwind v4 inline theme bridge
+-- app/
    +-- app.component.ts                     # Root shell component
    +-- app.config.ts                        # Application providers and routing config
    +-- app.routes.ts                        # Root routes, guards, and resolvers
    +-- core/
    |   +-- data/
    |   |   +-- mock-data.ts                 # Seed dataset conforming to RFC 2606 and NANP
    |   +-- guards/
    |   |   +-- tenant-active.guard.ts       # Route guard preventing inactive tenant access
    |   +-- models/
    |   |   +-- index.ts                     # Pure TypeScript domain models and contracts
    |   +-- resolvers/
    |   |   +-- tenant.resolver.ts           # Hybrid tenant and property detail resolvers
    |   +-- services/
    |   |   +-- dynamic-theme.service.ts     # CSS variable runtime injector and validator
    |   |   +-- indexed-db-storage.service.ts# Atomic IndexedDB persistence singleton
    |   |   +-- property-data.service.ts     # Tenant-partitioned listing read service
    |   |   +-- tenant-context.service.ts    # Tenant resolution and active tenant state
    |   |   +-- tour-booking.service.ts      # Validated booking persistence and IDOR defense
    |   +-- tokens/
    |   |   +-- window-token.ts              # Platform window and visualViewport injection tokens
    |   +-- utils/
    |       +-- floorplan-transform.util.ts  # DOMParser SVG sanitizer and pan/zoom bounds math
    |       +-- format.util.ts               # Currency, area, and architectural formatters
    |       +-- media-resolver.util.ts       # Media sorting and responsive image utilities
    |       +-- mortgage.util.ts             # Financial math and amortization table generator
    |       +-- property-filter.util.ts      # Pure signal listing filtering pipeline
    +-- features/
    |   +-- floor-plan-viewer/               # Interactive vector schematic viewer
    |   +-- mortgage-calculator/             # Financial breakdown widget and donut visualizer
    |   +-- property-filter/                 # Sticky sub-nav filter bar and mobile sheet drawer
    |   +-- tour-booking/                    # Appointment booking dialog
    +-- pages/
    |   +-- not-found/                       # Custom 404 state
    |   +-- property-catalog/                # Tenant listing catalog page
    |   +-- property-detail/                 # Narrative property monograph page
    |   +-- tenant-shell/                    # Root storefront shell with disclaimer banner
    |   +-- ui-preview/                      # Design system surface and runtime invariant runner
    +-- shared/
        +-- compound/
        |   +-- architectural-gallery/       # Swipable carousel with body-level CDK lightbox
        |   +-- property-card/               # Editorial listing card
        |   +-- tenant-footer/               # Multi-column footer with simulation disclaimers
        |   +-- tenant-nav/                  # Responsive navigation header
        |   +-- tenant-switcher/             # Floating tenant context switcher
        +-- ui-primitives/
            +-- badge/                       # Status and spec metadata chips
            +-- button/                      # Accessible 44px min action buttons
            +-- input/                       # Precision editorial input fields
            +-- range-slider/                # Pointer-isolated dual-thumb slider
            +-- select/                      # Native select wrapper with editorial styling
            +-- sheet-modal/                 # Responsive bottom-sheet and modal container
```

---

## Getting Started

### Prerequisites

- Node.js (version 20 or higher recommended)
- pnpm package manager

### Installation

Clone the repository and install dependencies using pnpm:

```bash
git clone https://github.com/mmy-lana/angular-real-estate-portal.git
cd angular-real-estate-portal
pnpm install
```

### Development Server

Start the local Vite development server:

```bash
pnpm run dev
```

Navigate to `http://127.0.0.1:4300`. The bare root URL automatically routes to the default tenant (`/t/atelier-living`).

### Build

Compile the application for production:

```bash
pnpm run build
```

Production output will be generated in the `dist/` directory.

### Preview Production Build

Preview the production build locally:

```bash
pnpm run preview
```

The preview server will be accessible at `http://127.0.0.1:4301`.

---

## Verification & Automated Testing

The repository contains an automated verification suite that runs in a standalone headless Chrome profile. It asserts tenant isolation, SVG sanitization, routing resolution, financial math precision, touch targets, and responsive layouts across all standard viewports (360px, 390px, 430px, 768px, 1024px, 1440px):

```bash
# Build the application first
pnpm run build

# Run the verification test suite
pnpm run verify
```

To run TypeScript type checks:

```bash
pnpm run typecheck
```

---

## Demonstration Notice & Privacy

This application is a demonstration environment created for technical evaluation and architectural showcase purposes:

- All agency names, listings, properties, dimensions, prices, and architectural monographs are entirely synthetic.
- All telephone numbers utilize the North American Numbering Plan (NANP) reserved test range (`+1 (...) 555-0100` through `555-0199`).
- All email addresses use RFC 2606 reserved domains (`*.example.com`).
- Lead captures and appointment submissions are stored strictly in client-side browser storage (IndexedDB) and are never transmitted to external services or real-world agents.

---

## License

This project is open-source under the MIT License.
