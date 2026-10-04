# Real Estate Multi-Tenant Portal

Angular 22 + Tailwind CSS 4 multi-tenant storefront for architectural real-estate agencies.
Each agency is an isolated tenant scope with its own branding, runtime theme tokens and
listing set, resolved from `/t/:tenantSlug` or from a mapped hostname.

## Commands

| Command | Purpose |
|---|---|
| `pnpm run dev` | Vite dev server on `http://127.0.0.1:4300` |
| `pnpm run build` | Production build into `dist/` |
| `pnpm run typecheck` | `tsc --noEmit` over the application program |
| `pnpm run verify` | Headless-Chrome verification suite (requires a prior `build`) |

## Routes

| Path | Description |
|---|---|
| `/` | Redirects to the default tenant |
| `/t/:tenantSlug` | Tenant catalog (hero, filter bar, listing grid) |
| `/t/:tenantSlug/property/:propertySlug` | Listing detail (gallery, plans, financing, inquiry rail) |
| `/preview/components` | Design-system surface for primitives and molecules |
| `/404` | Terminal route for unknown, deactivated or cross-tenant targets |

## Architecture notes

- **Tenant isolation** — every storage read is keyed by `tenantId`; the property resolver refuses
  a listing that does not belong to the resolved tenant and redirects to `/404`.
- **Dynamic theming** — `DynamicThemeService` writes CSS custom properties onto `:root`;
  templates consume them exclusively through Tailwind's arbitrary-variable syntax
  (`bg-(--color-brand-bg)`), never the deprecated shorthand.
- **Storage** — `IndexedDbStorageService` owns a single `IDBDatabase` handle, self-heals a stale
  schema, sanitizes every ingested floor plan SVG and degrades to an in-memory store when
  IndexedDB is unavailable.
- **Guards** — `tenantActiveGuard` resolves the tenant through the shared context promise, because
  the router evaluates guards before it subscribes a route's resolvers.

## Verification

`pnpm run verify` boots the production build behind `vite preview`, drives a throw-away headless
Chrome profile (no user browser is touched) and asserts routing, tenant isolation, storage
integrity, primitive accessibility, molecule behaviour, domain calculations, page assembly and
layout from 360px through 1440px.
