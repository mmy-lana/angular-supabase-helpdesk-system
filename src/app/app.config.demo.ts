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
 * Bootstrap configuration for the offline showcase.
 *
 * `ng build --configuration demo` replaces `app.config.ts` with this file (see
 * the `fileReplacements` entry in angular.json). The showcase sample data itself
 * lives in `environment.demo.ts`, which is what keeps a production build free of
 * fabricated ticket content; the mock backend is registered here because the
 * resilient proxy needs both backends whichever configuration is running.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
    ),
    SupabaseDataRepository,
    MockDataRepository,
    {
      provide: DataRepository,
      useClass: ResilientDataRepository
    },
    provideAppInitializer(() => inject(AuthStateService).ensureInitialized())
  ]
};