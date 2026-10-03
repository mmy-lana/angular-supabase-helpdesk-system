import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { UserRole } from '../models/database.types';
import { AuthStateService } from '../services/auth-state.service';

/**
 * Functional guard factory. Reads the role from `AuthStateService`, never from
 * storage, so a revoked role takes effect on the next navigation.
 *
 * Denied users land on the workspace they are allowed to see rather than on a
 * dead end; role checks in the UI mirror the same rules, and PostgreSQL row
 * level security enforces them regardless of what the client sends.
 */
export function roleGuard(allowedRoles: readonly UserRole[]): CanActivateFn {
  return async (): Promise<true | UrlTree> => {
    const authState = inject(AuthStateService);
    const router = inject(Router);

    await authState.ensureInitialized();

    const role = authState.userRole();
    if (!role) {
      return router.createUrlTree(['/login']);
    }
    if (allowedRoles.includes(role)) {
      return true;
    }
    return router.createUrlTree(['/workspace']);
  };
}

/** Anything support facing: internal notes, assignment, ticket properties. */
export const agentGuard: CanActivateFn = roleGuard(['agent', 'admin']);

/** Administration only. */
export const adminGuard: CanActivateFn = roleGuard(['admin']);