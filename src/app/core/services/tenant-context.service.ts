import { Injectable, inject, signal } from '@angular/core';
import { Tenant } from '../models';
import { IndexedDbStorageService } from './indexed-db-storage.service';
import { MOCK_TENANTS } from '../data/mock-data';

@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly storage = inject(IndexedDbStorageService);
  public readonly activeTenant = signal<Tenant | null>(null);

  public async loadTenantBySlug(slug: string): Promise<Tenant | null> {
    try {
      const db = await this.storage.getDatabase();
      const tenant = await new Promise<Tenant | undefined>((resolve, reject) => {
        const tx = db.transaction('tenants', 'readonly');
        const store = tx.objectStore('tenants');
        const index = store.index('slug');
        const req = index.get(slug);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const resolved = tenant ?? MOCK_TENANTS.find(t => t.slug === slug) ?? null;
      if (resolved) {
        this.activeTenant.set(resolved);
      }
      return resolved;
    } catch {
      const fallback = MOCK_TENANTS.find(t => t.slug === slug) ?? null;
      if (fallback) {
        this.activeTenant.set(fallback);
      }
      return fallback;
    }
  }
}
