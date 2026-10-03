import { EnvironmentConfig } from './environment.interface';

export const environment: EnvironmentConfig = {
  production: true,
  useMockData: false,
  supabaseUrl: 'https://placeholder.supabase.co',
  supabaseAnonKey: 'placeholder-anon-key',
  demoAccounts: []
};
