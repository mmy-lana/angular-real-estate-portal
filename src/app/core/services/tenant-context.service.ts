import { Injectable, computed, inject, signal } from '@angular/core';
import { Tenant } from '../models';
import { IndexedDbStorageService, TENANT_STORE, isTenant } from './indexed-db-storage.service';
import { MOCK_TENANTS } from '../data/mock-data';

/**
 * Single source of truth for "which agency is being browsed".
 *
 * Resolution is hybrid, matching the routing contract:
 * 1. Explicit `/t/:tenantSlug` path segment.
 * 2. Hostname lookup against `customDomain` (subdomain or mapped CNAME).
 *
 * Every lookup is answered from storage first; the seed catalog is the
 * resilience floor when persistence is unavailable, never the primary path.
 */
@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly storage = inject(IndexedDbStorageService);
  private readonly inFlight = new Map<string, Promise<Tenant | null>>();

  private readonly tenantState = signal<Tenant | null>(null);
  private readonly resolutionState = signal<'idle' | 'resolving' | 'resolved' | 'error'>('idle');

  /** Tenant backing the current route, or `null` outside a tenant scope. */
  public readonly activeTenant = this.tenantState.asReadonly();
  public readonly status = this.resolutionState.asReadonly();
  public readonly isResolved = computed(() => this.resolutionState() === 'resolved' && this.tenantState() !== null);

  private readonly tenantsState = signal<Tenant[]>([]);
  /** Every active tenant, powering the tenant switcher utility. */
  public readonly availableTenants = this.tenantsState.asReadonly();

  /** Seeds storage on first read, then returns the active tenant catalog. */
  public async loadAvailableTenants(): Promise<Tenant[]> {
    const cached = this.tenantsState();
    if (cached.length > 0) {
      return cached;
    }
    await this.storage.seedIfEmpty();
    const stored = await this.storage.getAll<Tenant>(TENANT_STORE);
    const tenants = stored.filter(isTenant).sort((a, b) => a.branding.agencyName.localeCompare(b.branding.agencyName));
    const resolved = tenants.length > 0 ? tenants : MOCK_TENANTS;
    this.tenantsState.set(resolved);
    return resolved;
  }

  /** Resolves a tenant by its URL slug. Returns `null` for unknown slugs. */
  public async loadTenantBySlug(slug: string): Promise<Tenant | null> {
    const normalized = slug.trim().toLowerCase();
    if (normalized === '') {
      return null;
    }
    return this.resolveCached(normalized, async () => {
      await this.storage.seedIfEmpty();
      const stored = await this.storage
        .getAllByIndex<Tenant>(TENANT_STORE, 'slug', normalized)
        .then((matches) => matches.find(isTenant) ?? null);
      return stored ?? MOCK_TENANTS.find((tenant) => tenant.slug === normalized) ?? null;
    });
  }

  /** Resolves a tenant by its primary key, used by tenant-scoped data loads. */
  public async loadTenantById(tenantId: string): Promise<Tenant | null> {
    const stored = await this.storage.getById<Tenant>(TENANT_STORE, tenantId);
    const tenant = isTenant(stored) ? stored : null;
    return tenant ?? MOCK_TENANTS.find((entry) => entry.id === tenantId) ?? null;
  }

  /**
   * Hostname resolution for bespoke domains: strips the port and lowercases the
   * host, then matches `customDomain` before falling back to a subdomain slug.
   */
  public async loadTenantByHostname(hostname: string): Promise<Tenant | null> {
    const host = hostname.trim().toLowerCase().split(':')[0];
    if (host === '') {
      return null;
    }
    return this.resolveCached(`host:${host}`, async () => {
      const tenants = await this.loadAvailableTenants();
      const byDomain = tenants.find((tenant) => tenant.customDomain?.toLowerCase() === host);
      if (byDomain) {
        return byDomain;
      }
      const subdomain = host.split('.')[0];
      return tenants.find((tenant) => tenant.slug === subdomain) ?? null;
    });
  }

  /** Convenience resolver for the router: slug first, then hostname. */
  public async resolveTenant(slug: string | null, hostname: string | null): Promise<Tenant | null> {
    if (slug && slug.trim() !== '') {
      const bySlug = await this.loadTenantBySlug(slug);
      if (bySlug) {
        return bySlug;
      }
    }
    if (hostname) {
      const byHost = await this.loadTenantByHostname(hostname);
      if (byHost) {
        return byHost;
      }
    }
    return null;
  }

  /** Clears the active tenant when the router leaves a tenant scope. */
  public clearActiveTenant(): void {
    this.tenantState.set(null);
    this.resolutionState.set('idle');
  }

  private async resolveCached(key: string, loader: () => Promise<Tenant | null>): Promise<Tenant | null> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const pending = (async () => {
      this.resolutionState.set('resolving');
      try {
        const tenant = await loader();
        if (tenant) {
          this.tenantState.set(tenant);
          this.resolutionState.set('resolved');
        } else {
          this.resolutionState.set('error');
        }
        return tenant;
      } catch {
        this.resolutionState.set('error');
        return null;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, pending);
    return pending;
  }
}