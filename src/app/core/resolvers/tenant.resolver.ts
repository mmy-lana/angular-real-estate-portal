import { ResolveFn, Router, RedirectCommand } from '@angular/router';
import { inject } from '@angular/core';
import { Tenant } from '../models';
import { TenantContextService } from '../services/tenant-context.service';

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
