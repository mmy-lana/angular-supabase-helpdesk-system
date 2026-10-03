import { EnvironmentConfig } from './environment.interface';

/**
 * Offline showcase target, used by `ng build --configuration demo`.
 *
 * `useMockData` swaps `DataRepository` for `MockDataRepository`, so the Supabase
 * client is never constructed and the empty connection strings below are never
 * read. Everything runs in the browser: there is no cryptographic authorization
 * and no isolation between users, which makes this target unfit for real data.
 */
export const environment: EnvironmentConfig = {
  production: false,
  useMockData: true,
  supabaseUrl: '',
  supabaseAnonKey: '',
  demoAccounts: [
    {
      label: 'Support agent',
      email: 'agent@example.com',
      password: 'DemoPassword123!'
    },
    {
      label: 'Customer',
      email: 'customer@example.com',
      password: 'DemoPassword123!'
    }
  ]
};