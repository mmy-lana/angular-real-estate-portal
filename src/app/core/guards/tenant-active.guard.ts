import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Tenant } from '../models';
import { TenantContextService } from '../services/tenant-context.service';
import { WINDOW } from '../tokens/window-token';

function readTenant(value: unknown): Tenant | null {
  return typeof value === 'object' && value !== null && 'isActive' in value && 'slug' in value
    ? (value as Tenant)
    : null;
}

/**
 * Blocks navigation into a deactivated or unknown tenant.
 *
 * The Angular router evaluates the guard chain of a route tree before it
 * subscribes to that tree's resolvers, so a guard that only reads
 * `snapshot.data['tenant']` runs before the tenant record exists. The guard
 * therefore resolves the tenant itself through `TenantContextService`, which
 * shares one in-flight promise with `tenantResolver`, and only then validates
 * the resolved record. An already-resolved snapshot short-circuits the lookup.
 */
export const tenantActiveGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const tenantContext = inject(TenantContextService);
  const windowRef = inject(WINDOW);

  let snapshot: typeof route | null = route;
  while (snapshot) {
    const tenant = readTenant(snapshot.data['tenant']);
    if (tenant) {
      return tenant.isActive ? true : router.createUrlTree(['/404']);
    }
    snapshot = snapshot.parent;
  }

  const slug = route.paramMap.get('tenantSlug') ?? route.parent?.paramMap.get('tenantSlug') ?? null;
  const hostname = windowRef?.location?.hostname ?? null;
  const tenant = await tenantContext.resolveTenant(slug, hostname);

  return tenant && tenant.isActive ? true : router.createUrlTree(['/404']);
};