import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Tenant } from '../models';

export const tenantActiveGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  let snapshot = route;
  while (snapshot.parent) {
    if (snapshot.parent.data['tenant']) {
      const tenant = snapshot.parent.data['tenant'] as Tenant;
      return tenant.isActive ? true : router.createUrlTree(['/404']);
    }
    snapshot = snapshot.parent;
  }
  return router.createUrlTree(['/404']);
};
