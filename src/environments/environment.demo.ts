import { EnvironmentConfig } from './environment.interface';

export const environment: EnvironmentConfig = {
  production: false,
  useMockData: true,
  supabaseUrl: '',
  supabaseAnonKey: '',
  demoAccounts: [
    {
      label: 'Demo Agent',
      email: 'agent@example.com',
      password: 'DemoPassword123!'
    },
    {
      label: 'Demo Customer',
      email: 'customer@example.com',
      password: 'DemoPassword123!'
    }
  ]
};
