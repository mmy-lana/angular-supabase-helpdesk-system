import { Routes } from '@angular/router';
import { anonymousGuard, authGuard } from './core/guards/auth.guard';

export const appRoutes: Routes = [
  {
    path: 'login',
    canActivate: [anonymousGuard],
    title: 'Sign in · Help desk',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'register',
    canActivate: [anonymousGuard],
    title: 'Create an account · Help desk',
    loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent)
  },
  {
    path: 'workspace',
    canActivate: [authGuard],
    title: 'Workspace · Help desk',
    loadComponent: () => import('./features/workspace/workspace-shell.component').then(
      (m) => m.WorkspaceShellComponent
    )
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'workspace'
  },
  {
    path: '**',
    redirectTo: 'workspace'
  }
];