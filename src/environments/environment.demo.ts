import { DEMO_PROFILE_IDS, DEMO_TICKET_SEEDS } from './demo-ticket-seeds';
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
  demoTicketSeeds: DEMO_TICKET_SEEDS,
  demoIdentities: [
    {
      id: DEMO_PROFILE_IDS.admin,
      email: 'admin@example.org',
      fullName: 'Priya Raman',
      role: 'admin'
    },
    {
      id: DEMO_PROFILE_IDS.agent,
      email: 'agent@example.com',
      fullName: 'Nina Okafor',
      role: 'agent'
    },
    {
      id: DEMO_PROFILE_IDS.secondAgent,
      email: 'marcus.feld@example.org',
      fullName: 'Marcus Feld',
      role: 'agent'
    },
    {
      id: DEMO_PROFILE_IDS.customer,
      email: 'customer@example.com',
      fullName: 'Tomas Eriksen',
      role: 'customer'
    },
    {
      id: DEMO_PROFILE_IDS.secondCustomer,
      email: 'aiko.tanaka@example.org',
      fullName: 'Aiko Tanaka',
      role: 'customer'
    },
    {
      id: DEMO_PROFILE_IDS.thirdCustomer,
      email: 'samuel.ortiz@example.org',
      fullName: 'Samuel Ortiz',
      role: 'customer'
    }
  ]
};