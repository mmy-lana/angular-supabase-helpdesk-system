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
import { SupabaseDataRepository } from './core/services/supabase-data.repository';
import { MockDataRepository } from './core/services/mock-data.repository';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
    ),
    {
      // The whole application talks to this token. `demo` swaps in the in-memory
      // backend, every other target talks to Supabase.
      provide: DataRepository,
      useClass: environment.useMockData ? MockDataRepository : SupabaseDataRepository
    },
    // Restores a stored session before the first route resolves, so a reload on a
    // deep link does not bounce through the login screen.
    provideAppInitializer(() => inject(AuthStateService).ensureInitialized())
  ]
};