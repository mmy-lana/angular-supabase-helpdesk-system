import { EnvironmentConfig } from './environment.interface';

/**
 * Offline showcase target, used by `ng build --configuration demo`.
 *
 * `useMockData` swaps `DataRepository` for `MockDataRepository`, so the Supabase
 * client is never constructed and the empty connection strings below are never
 * read. Everything runs in the browser: there is no cryptographic authorization
 * and no isolation between users, which makes this target unfit for real data.
 *
 * The identity directory below is the only place the showcase knows who its
 * people are. The production and development configurations declare an empty
 * `demoIdentities` list, so none of these addresses reach a shipped bundle.
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
  ],
  demoIdentities: [
    {
      id: '5f2b9c10-0001-4c7a-9a11-000000000001',
      email: 'admin@example.org',
      fullName: 'Priya Raman',
      role: 'admin'
    },
    {
      id: '5f2b9c10-0002-4c7a-9a11-000000000002',
      email: 'agent@example.com',
      fullName: 'Nina Okafor',
      role: 'agent'
    },
    {
      id: '5f2b9c10-0003-4c7a-9a11-000000000003',
      email: 'marcus.feld@example.org',
      fullName: 'Marcus Feld',
      role: 'agent'
    },
    {
      id: '5f2b9c10-0004-4c7a-9a11-000000000004',
      email: 'customer@example.com',
      fullName: 'Tomas Eriksen',
      role: 'customer'
    },
    {
      id: '5f2b9c10-0005-4c7a-9a11-000000000005',
      email: 'aiko.tanaka@example.org',
      fullName: 'Aiko Tanaka',
      role: 'customer'
    },
    {
      id: '5f2b9c10-0006-4c7a-9a11-000000000006',
      email: 'samuel.ortiz@example.org',
      fullName: 'Samuel Ortiz',
      role: 'customer'
    }
  ]
};