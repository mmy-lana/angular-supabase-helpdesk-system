import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

/**
 * Blocks `/workspace` until a session exists. Restores the stored session first,
 * otherwise a page reload on a deep link would bounce to the login screen even
 * though a valid token is sitting in storage.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  await authState.ensureInitialized();

  if (authState.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps signed in users out of the login and registration screens. */
export const anonymousGuard: CanActivateFn = async () => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  await authState.ensureInitialized();

  if (!authState.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/workspace']);
};