import { Routes } from '@angular/router';
import { tenantResolver } from './core/resolvers/tenant.resolver';
import { tenantActiveGuard } from './core/guards/tenant-active.guard';
import { TenantShellComponent } from './pages/tenant-shell/tenant-shell.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 't/atelier-living'
  },
  {
    path: '404',
    loadComponent: () => import('./pages/not-found/not-found.component').then(m => m.NotFoundComponent)
  },
  {
    path: 't/:tenantSlug',
    component: TenantShellComponent,
    resolve: { tenant: tenantResolver },
    canActivate: [tenantActiveGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/property-catalog/property-catalog.component').then(m => m.PropertyCatalogComponent)
      },
      {
        path: 'property/:propertySlug',
        loadComponent: () => import('./pages/property-detail/property-detail.component').then(m => m.PropertyDetailComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: '/404'
  }
];
