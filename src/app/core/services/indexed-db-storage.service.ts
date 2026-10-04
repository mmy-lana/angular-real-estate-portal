import { Injectable, signal } from '@angular/core';
import { AgentProfile, Property, Tenant, TourBookingRequest } from '../models';
import { MOCK_AGENTS, MOCK_PROPERTIES, MOCK_TENANTS } from '../data/mock-data';
import { validateAndSanitizeSvgIngest } from '../utils/floorplan-transform.util';

export const TENANT_STORE = 'tenants';
export const PROPERTY_STORE = 'properties';
export const AGENT_STORE = 'agents';
export const BOOKING_STORE = 'bookings';

export type StoreName = typeof TENANT_STORE | typeof PROPERTY_STORE | typeof AGENT_STORE | typeof BOOKING_STORE;

/** Every store the application requires; used to validate a recovered schema. */
export const REQUIRED_STORES: StoreName[] = [TENANT_STORE, PROPERTY_STORE, AGENT_STORE, BOOKING_STORE];

export type StorageMode = 'indexeddb' | 'memory';

interface KeyedRecord {
  id: string;
}

/**
 * Tenant-partitioned persistence for the portal.
 *
 * Responsibilities:
 * - Owns the single `IDBDatabase` handle for the whole application so concurrent
 *   navigations and deep links can never race each other into a `VersionError`.
 * - Applies the schema migration exactly once inside `onupgradeneeded`.
 * - Seeds the demo portfolio on first boot, piping every floor plan SVG through
 *   {@link validateAndSanitizeSvgIngest} before the record is written.
 * - Degrades to an in-process memory store when IndexedDB is unavailable
 *   (private browsing, hardened enterprise policies) so the storefront keeps
 *   working read-only instead of hard-failing the resolver.
 */
@Injectable({ providedIn: 'root' })
export class IndexedDbStorageService {
  private readonly DB_NAME = 'real_estate_portal_db';
  private readonly DB_VERSION = 1;

  private dbInstancePromise: Promise<IDBDatabase | null> | null = null;
  private seedPromise: Promise<void> | null = null;
  private memoryStores: Map<StoreName, Map<string, unknown>> | null = null;

  /** Active persistence backend, surfaced for diagnostics and the tenant shell. */
  public readonly mode = signal<StorageMode>('indexeddb');
  public readonly isSeeding = signal<boolean>(false);

  /**
   * Resolves the shared database handle. Returns `null` when IndexedDB cannot be
   * used at all; callers must then rely on the memory-backed API below.
   */
  public getDatabase(): Promise<IDBDatabase | null> {
    if (!this.dbInstancePromise) {
      this.dbInstancePromise = this.openWithSchemaRecovery();
    }
    return this.dbInstancePromise;
  }

  /**
   * Opens the database and verifies the schema actually landed.
   *
   * A database can exist at the current version while missing stores — for
   * example when an earlier session created the file without running the
   * upgrade transaction. Opening would then succeed and every subsequent
   * transaction would throw `NotFoundError`. Rather than leaving the app in
   * that state, the stale file is deleted and recreated exactly once.
   */
  private async openWithSchemaRecovery(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      this.activateMemoryMode();
      return null;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const db = await this.openDatabase();
      if (!db) {
        this.activateMemoryMode();
        return null;
      }
      if (this.hasCompleteSchema(db)) {
        this.mode.set('indexeddb');
        return db;
      }
      db.close();
      if (!(await this.deleteDatabase())) {
        this.activateMemoryMode();
        return null;
      }
    }

    this.activateMemoryMode();
    return null;
  }

  private openDatabase(): Promise<IDBDatabase | null> {
    return new Promise<IDBDatabase | null>((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      } catch {
        resolve(null);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TENANT_STORE)) {
          const store = db.createObjectStore(TENANT_STORE, { keyPath: 'id' });
          store.createIndex('slug', 'slug', { unique: true });
          store.createIndex('customDomain', 'customDomain', { unique: false });
        }
        if (!db.objectStoreNames.contains(PROPERTY_STORE)) {
          const store = db.createObjectStore(PROPERTY_STORE, { keyPath: 'id' });
          store.createIndex('tenantId', 'tenantId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('price', 'price', { unique: false });
          store.createIndex('tenantId_status', ['tenantId', 'status'], { unique: false });
        }
        if (!db.objectStoreNames.contains(AGENT_STORE)) {
          const store = db.createObjectStore(AGENT_STORE, { keyPath: 'id' });
          store.createIndex('tenantId', 'tenantId', { unique: false });
        }
        if (!db.objectStoreNames.contains(BOOKING_STORE)) {
          const store = db.createObjectStore(BOOKING_STORE, { keyPath: 'id' });
          store.createIndex('tenantId', 'tenantId', { unique: false });
          store.createIndex('propertyId', 'propertyId', { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          // Another tab requested a version bump: release the handle so this
          // tab never blocks the upgrade in the other tab.
          db.close();
          this.dbInstancePromise = null;
        };
        resolve(db);
      };

      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  private hasCompleteSchema(db: IDBDatabase): boolean {
    return REQUIRED_STORES.every((store) => db.objectStoreNames.contains(store));
  }

  private deleteDatabase(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.deleteDatabase(this.DB_NAME);
      } catch {
        resolve(false);
        return;
      }
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    });
  }

  /**
   * Ensures the demo portfolio exists. Safe to call from multiple resolvers and
   * guards concurrently: the in-flight promise is shared.
   */
  public async seedIfEmpty(): Promise<void> {
    if (this.seedPromise) {
      return this.seedPromise;
    }
    this.isSeeding.set(true);
    this.seedPromise = (async () => {
      try {
        const tenantCount = await this.count(TENANT_STORE);
        if (tenantCount > 0) {
          return;
        }
        await this.putMany(TENANT_STORE, MOCK_TENANTS);
        await this.putMany(AGENT_STORE, MOCK_AGENTS);
        await this.putMany(PROPERTY_STORE, MOCK_PROPERTIES.map(sanitizePropertyForIngest));
      } finally {
        this.isSeeding.set(false);
        this.seedPromise = null;
      }
    })();
    return this.seedPromise;
  }

  /** Removes every record from the four tenant-scoped stores. */
  public async clearAll(): Promise<void> {
    const db = await this.getDatabase();
    if (!db) {
      this.memoryStores?.clear();
      return;
    }
    await this.runTransaction([TENANT_STORE, PROPERTY_STORE, AGENT_STORE, BOOKING_STORE], 'readwrite', (stores) => {
      stores.forEach((store) => store.clear());
    });
  }

  public async getById<T extends KeyedRecord>(storeName: StoreName, id: string): Promise<T | null> {
    const db = await this.getDatabase();
    if (!db) {
      return (this.memoryStores?.get(storeName)?.get(id) as T | undefined) ?? null;
    }
    return new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(id);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}/${id}`));
    });
  }

  public async getAll<T>(storeName: StoreName): Promise<T[]> {
    const db = await this.getDatabase();
    if (!db) {
      return Array.from(this.memoryStores?.get(storeName)?.values() ?? []) as T[];
    }
    return new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error ?? new Error(`Failed to list ${storeName}`));
    });
  }

  /** Index-backed lookup, the tenant-boundary primitive for every query. */
  public async getAllByIndex<T>(storeName: StoreName, indexName: string, value: IDBValidKey): Promise<T[]> {
    const db = await this.getDatabase();
    if (!db) {
      const all = (this.memoryStores?.get(storeName)?.values() ?? []) as Record<string, unknown>[];
      return all.filter((record) => record[indexName] === value) as T[];
    }
    return new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const index = transaction.objectStore(storeName).index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error ?? new Error(`Failed to query ${storeName}.${indexName}`));
    });
  }

  /** Compound index query used by catalog status facets. */
  public async getAllByCompoundIndex<T>(
    storeName: StoreName,
    indexName: string,
    range: IDBKeyRange
  ): Promise<T[]> {
    const db = await this.getDatabase();
    if (!db) {
      return [] as T[];
    }
    return new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const index = transaction.objectStore(storeName).index(indexName);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error ?? new Error(`Failed to range query ${storeName}.${indexName}`));
    });
  }

  public async put<T extends KeyedRecord>(storeName: StoreName, record: T): Promise<T> {
    const db = await this.getDatabase();
    if (!db) {
      this.ensureMemoryStores();
      this.memoryStores?.get(storeName)?.set(record.id, record);
      return record;
    }
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error(`Failed to write ${storeName}`));
      transaction.onabort = () => reject(transaction.error ?? new Error(`Write aborted for ${storeName}`));
    });
    return record;
  }

  public async putMany<T extends KeyedRecord>(storeName: StoreName, records: T[]): Promise<number> {
    if (records.length === 0) {
      return 0;
    }
    const db = await this.getDatabase();
    if (!db) {
      this.ensureMemoryStores();
      const store = this.memoryStores?.get(storeName);
      records.forEach((record) => store?.set(record.id, record));
      return records.length;
    }
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const objectStore = transaction.objectStore(storeName);
      for (const record of records) {
        objectStore.put(record);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error(`Failed to bulk write ${storeName}`));
      transaction.onabort = () => reject(transaction.error ?? new Error(`Bulk write aborted for ${storeName}`));
    });
    return records.length;
  }

  public async delete(storeName: StoreName, id: string): Promise<void> {
    const db = await this.getDatabase();
    if (!db) {
      this.memoryStores?.get(storeName)?.delete(id);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error(`Failed to delete ${storeName}/${id}`));
    });
  }

  public async count(storeName: StoreName): Promise<number> {
    const db = await this.getDatabase();
    if (!db) {
      return this.memoryStores?.get(storeName)?.size ?? 0;
    }
    return new Promise<number>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`Failed to count ${storeName}`));
    });
  }

  // ------------------------------------------------------------------ helpers

  private runTransaction(
    storeNames: StoreName[],
    mode: IDBTransactionMode,
    work: (stores: IDBObjectStore[]) => void
  ): Promise<void> {
    return this.getDatabase().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          if (!db) {
            resolve();
            return;
          }
          const transaction = db.transaction(storeNames, mode);
          work(storeNames.map((name) => transaction.objectStore(name)));
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'));
          transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
        })
    );
  }

  private activateMemoryMode(): void {
    this.ensureMemoryStores();
    this.mode.set('memory');
  }

  private ensureMemoryStores(): void {
    if (this.memoryStores) {
      return;
    }
    this.memoryStores = new Map<StoreName, Map<string, unknown>>([
      [TENANT_STORE, new Map<string, unknown>()],
      [PROPERTY_STORE, new Map<string, unknown>()],
      [AGENT_STORE, new Map<string, unknown>()],
      [BOOKING_STORE, new Map<string, unknown>()]
    ]);
  }
}

/**
 * Contract mandate: every floor plan SVG that enters storage — from seeding or
 * from any future ingest path — is sanitized first, so rendering can trust the
 * stored markup.
 */
export function sanitizePropertyForIngest(property: Property): Property {
  return {
    ...property,
    media: property.media.map((media) => ({ ...media })),
    floorPlans: property.floorPlans.map((level) => ({
      ...level,
      svgContent: validateAndSanitizeSvgIngest(level.svgContent),
      hotspots: level.hotspots.map((hotspot) => ({
        ...hotspot,
        xRatio: Math.min(1, Math.max(0, hotspot.xRatio)),
        yRatio: Math.min(1, Math.max(0, hotspot.yRatio))
      }))
    }))
  };
}

/** Narrow helper used by tenant-scoped services that only accept known agents. */
export function isAgentProfile(value: unknown): value is AgentProfile {
  return typeof value === 'object' && value !== null && 'tenantId' in value && 'licenseCode' in value;
}

/** Narrow helper used by booking persistence assertions. */
export function isTourBookingRequest(value: unknown): value is TourBookingRequest {
  return typeof value === 'object' && value !== null && 'scheduledDateTime' in value && 'tenantId' in value;
}

/** Narrow helper for tenant records read from storage. */
export function isTenant(value: unknown): value is Tenant {
  return typeof value === 'object' && value !== null && 'slug' in value && 'branding' in value;
}