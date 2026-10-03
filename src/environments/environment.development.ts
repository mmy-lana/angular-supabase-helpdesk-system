import { EnvironmentConfig } from './environment.interface';

export const environment: EnvironmentConfig = {
  production: false,
  useMockData: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey: 'placeholder-local-anon-key',
  demoAccounts: [
    {
      label: 'Agent (Support)',
      email: 'agent@example.com',
      password: 'DevPassword123!'
    },
    {
      label: 'Customer (User)',
      email: 'customer@example.com',
      password: 'DevPassword123!'
    }
  ]
};
