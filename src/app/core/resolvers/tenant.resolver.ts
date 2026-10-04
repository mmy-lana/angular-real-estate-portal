import { RedirectCommand, ResolveFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AgentProfile, Property, Tenant } from '../models';
import { TenantContextService } from '../services/tenant-context.service';
import { PropertyDataService } from '../services/property-data.service';
import { WINDOW } from '../tokens/window-token';

const NOT_FOUND_PATH = '/404';

/**
 * Resolves the tenant for a `/t/:tenantSlug` scope.
 *
 * Resolution order matches the hybrid strategy: the URL slug first, then the
 * request hostname (subdomain or mapped CNAME). Anything unresolvable is sent
 * to the explicit 404 route rather than rendering an unbranded shell.
 */
export const tenantResolver: ResolveFn<Tenant | RedirectCommand> = async (route) => {
  const context = inject(TenantContextService);
  const router = inject(Router);
  const windowRef = inject(WINDOW);

  const slug = route.paramMap.get('tenantSlug');
  const hostname = windowRef?.location?.hostname ?? null;
  const tenant = await context.resolveTenant(slug, hostname);

  if (!tenant) {
    return new RedirectCommand(router.parseUrl(NOT_FOUND_PATH));
  }

  return tenant;
};

/**
 * Resolves a single residence for the detail route, enforcing the tenant
 * boundary: the slug is only matched inside the already-resolved tenant.
 */
export const propertyResolver: ResolveFn<{ property: Property; agent: AgentProfile | null } | RedirectCommand> =
  async (route) => {
    const router = inject(Router);
    const context = inject(TenantContextService);
    const propertyData = inject(PropertyDataService);

    const tenantSlug = route.paramMap.get('tenantSlug');
    const propertySlug = route.paramMap.get('propertySlug');

    if (!tenantSlug || !propertySlug) {
      return new RedirectCommand(router.parseUrl(NOT_FOUND_PATH));
    }

    const tenant = await context.loadTenantBySlug(tenantSlug);
    if (!tenant) {
      return new RedirectCommand(router.parseUrl(NOT_FOUND_PATH));
    }

    const property = await propertyData.loadPropertyBySlug(tenant.id, propertySlug);
    if (!property) {
      return new RedirectCommand(router.parseUrl(NOT_FOUND_PATH));
    }

    const agent = await propertyData.loadListingAgent(tenant.id, property.listingAgentId);
    return { property, agent };
  };