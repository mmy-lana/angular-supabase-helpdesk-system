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

/**
 * Bootstrap configuration for the offline showcase.
 *
 * `ng build --configuration demo` replaces `app.config.ts` with this file (see
 * the `fileReplacements` entry in angular.json). Keeping the showcase wiring in
 * its own module is what lets a production build leave the entire mock backend,
 * its fixtures and its sample tickets out of the bundle.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
    ),
    {
      provide: DataRepository,
      useClass: MockDataRepository
    },
    provideAppInitializer(() => inject(AuthStateService).ensureInitialized())
  ]
};