import { Routes } from '@angular/router';
import { propertyResolver, tenantResolver } from './core/resolvers/tenant.resolver';
import { tenantActiveGuard } from './core/guards/tenant-active.guard';
import { TenantShellComponent } from './pages/tenant-shell/tenant-shell.component';

/** Slug the bare `/` entry point redirects to. */
export const DEFAULT_TENANT_SLUG = 'atelier-living';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: `/t/${DEFAULT_TENANT_SLUG}`
  },
  {
    path: '404',
    loadComponent: () => import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent)
  },
  {
    path: 't/:tenantSlug',
    component: TenantShellComponent,
    resolve: { tenant: tenantResolver },
    children: [
      {
        path: '',
        canActivate: [tenantActiveGuard],
        loadComponent: () =>
          import('./pages/property-catalog/property-catalog.component').then((m) => m.PropertyCatalogComponent)
      },
      {
        path: 'property/:propertySlug',
        resolve: { listing: propertyResolver },
        canActivate: [tenantActiveGuard],
        loadComponent: () =>
          import('./pages/property-detail/property-detail.component').then((m) => m.PropertyDetailComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: '/404'
  }
];