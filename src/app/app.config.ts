import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { appRoutes } from './app.routes';
import { AuthStateService } from './core/services/auth-state.service';
import { DataRepository } from './core/services/data-repository.interface';
import { MockDataRepository } from './core/services/mock-data.repository';
import { ResilientDataRepository } from './core/services/resilient-data.repository';
import { SupabaseDataRepository } from './core/services/supabase-data.repository';

/**
 * Bootstrap configuration for every target that talks to a real backend.
 *
 * The showcase uses `app.config.demo.ts`, which `ng build --configuration demo`
 * substitutes for this file. Keeping them apart is what leaves the mock backend,
 * its fixtures and its sample tickets out of a production bundle: the import
 * graph of this configuration only ever mentions the Supabase repository.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
    ),
    // Both backends are registered so the proxy can move between them at run
    // time: whichever is reachable answers, and neither is constructed twice.
    SupabaseDataRepository,
    MockDataRepository,
    {
      provide: DataRepository,
      useClass: ResilientDataRepository
    },
    // Restores a stored session before the first route resolves, so a reload on a
    // deep link does not bounce through the login screen.
    provideAppInitializer(() => inject(AuthStateService).ensureInitialized())
  ]
};