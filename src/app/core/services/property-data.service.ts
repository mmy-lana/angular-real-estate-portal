import { Injectable, computed, inject, signal } from '@angular/core';
import { AgentProfile, Property } from '../models';
import {
  AGENT_STORE,
  IndexedDbStorageService,
  PROPERTY_STORE,
  isAgentProfile
} from './indexed-db-storage.service';
import { MOCK_AGENTS, MOCK_PROPERTIES } from '../data/mock-data';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface PropertyLoadResult {
  properties: Property[];
  state: LoadState;
  error: string | null;
}

/**
 * Tenant-partitioned property reads.
 *
 * Every method takes an explicit `tenantId` and refuses to return rows that
 * belong to a different tenant, so a mis-routed deep link cannot leak another
 * agency's portfolio into the storefront.
 */
@Injectable({ providedIn: 'root' })
export class PropertyDataService {
  private readonly storage = inject(IndexedDbStorageService);

  private readonly propertiesState = signal<Property[]>([]);
  private readonly loadState = signal<LoadState>('idle');
  private readonly errorState = signal<string | null>(null);
  private activeTenantId: string | null = null;
  private inFlight: Promise<Property[]> | null = null;

  /** Properties currently loaded for the active tenant. */
  public readonly properties = this.propertiesState.asReadonly();
  public readonly state = this.loadState.asReadonly();
  public readonly error = this.errorState.asReadonly();
  public readonly isLoading = computed(() => this.loadState() === 'loading');

  /** Listings flagged as featured, newest first — drives the catalog hero. */
  public readonly featuredProperties = computed(() =>
    this.propertiesState()
      .filter((property) => property.featured)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  );

  /** Loads (or returns already-loaded) listings for a tenant. */
  public async loadPropertiesForTenant(tenantId: string): Promise<Property[]> {
    if (this.activeTenantId === tenantId && this.loadState() === 'ready') {
      return this.propertiesState();
    }
    if (this.inFlight && this.activeTenantId === tenantId) {
      return this.inFlight;
    }

    this.activeTenantId = tenantId;
    this.loadState.set('loading');
    this.errorState.set(null);

    const pending = (async () => {
      try {
        await this.storage.seedIfEmpty();
        const stored = await this.storage.getAllByIndex<Property>(PROPERTY_STORE, 'tenantId', tenantId);
        const scoped = stored.filter((property) => property.tenantId === tenantId);
        const source = scoped.length > 0 ? scoped : MOCK_PROPERTIES.filter((property) => property.tenantId === tenantId);
        const ordered = [...source].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.propertiesState.set(ordered);
        this.loadState.set('ready');
        return ordered;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load listings for this agency.';
        this.errorState.set(message);
        this.loadState.set('error');
        this.propertiesState.set([]);
        return [];
      } finally {
        this.inFlight = null;
      }
    })();

    this.inFlight = pending;
    return pending;
  }

  /** Single listing lookup, always constrained to the requesting tenant. */
  public async loadPropertyBySlug(tenantId: string, propertySlug: string): Promise<Property | null> {
    const properties = await this.loadPropertiesForTenant(tenantId);
    const match = properties.find((property) => property.slug === propertySlug);
    return match ?? null;
  }

  /** Listing agent for a property, validated against the tenant boundary. */
  public async loadListingAgent(tenantId: string, agentId: string): Promise<AgentProfile | null> {
    await this.storage.seedIfEmpty();
    const stored = await this.storage.getById<AgentProfile>(AGENT_STORE, agentId);
    const agent = isAgentProfile(stored) ? stored : MOCK_AGENTS.find((entry) => entry.id === agentId) ?? null;
    if (!agent || agent.tenantId !== tenantId) {
      return null;
    }
    return agent;
  }

  /** Every agent belonging to a tenant, used by the inquiry rail and tours. */
  public async loadAgentsForTenant(tenantId: string): Promise<AgentProfile[]> {
    await this.storage.seedIfEmpty();
    const stored = await this.storage.getAllByIndex<AgentProfile>(AGENT_STORE, 'tenantId', tenantId);
    const scoped = stored.filter((agent) => agent.tenantId === tenantId);
    const source = scoped.length > 0 ? scoped : MOCK_AGENTS.filter((agent) => agent.tenantId === tenantId);
    return source.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /** Clears the tenant-scoped cache when navigating out of a tenant scope. */
  public resetTenantScope(): void {
    this.activeTenantId = null;
    this.inFlight = null;
    this.propertiesState.set([]);
    this.loadState.set('idle');
    this.errorState.set(null);
  }
}