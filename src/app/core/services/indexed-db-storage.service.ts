import { Injectable } from '@angular/core';
import { MOCK_TENANTS, MOCK_AGENTS, MOCK_PROPERTIES } from '../data/mock-data';

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

        request.onsuccess = async () => {
          const db = request.result;
          await this.seedDefaultsIfEmpty(db);
          resolve(db);
        };

        request.onerror = () => {
          this.dbInstancePromise = null;
          reject(request.error);
        };
      });
    }
    return this.dbInstancePromise;
  }

  private async seedDefaultsIfEmpty(db: IDBDatabase): Promise<void> {
    return new Promise((resolve) => {
      const tx = db.transaction(['tenants', 'agents', 'properties'], 'readwrite');
      const tenantStore = tx.objectStore('tenants');
      const countReq = tenantStore.count();

      countReq.onsuccess = () => {
        if (countReq.result === 0) {
          const agentStore = tx.objectStore('agents');
          const propertyStore = tx.objectStore('properties');

          for (const tenant of MOCK_TENANTS) {
            tenantStore.add(tenant);
          }
          for (const agent of MOCK_AGENTS) {
            agentStore.add(agent);
          }
          for (const property of MOCK_PROPERTIES) {
            propertyStore.add(property);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}
