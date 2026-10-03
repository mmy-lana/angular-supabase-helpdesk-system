import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { appRoutes } from './app.routes';
import { DataRepository } from './core/services/data-repository.interface';
import { SupabaseDataRepository } from './core/services/supabase-data.repository';
import { MockDataRepository } from './core/services/mock-data.repository';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(appRoutes, withComponentInputBinding()),
    {
      provide: DataRepository,
      useClass: environment.useMockData ? MockDataRepository : SupabaseDataRepository
    }
  ]
};
