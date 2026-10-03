import { DEMO_PROFILE_IDS, DEMO_TICKET_SEEDS } from './demo-ticket-seeds';
import { EnvironmentConfig } from './environment.interface';

/**
 * Local Docker target, used by `ng serve`.
 *
 * Starts the Supabase CLI locally (`supabase start`) and applies
 * `supabase/migrations`. The anon key printed by `supabase status` is pasted
 * into `supabaseAnonKey`; it is the local development key, not a secret.
 *
 * Unlike `demo`, this target talks to a real PostgreSQL instance, so every
 * row level security policy and trigger in the migrations is enforced.
 */
export const environment: EnvironmentConfig = {
  production: false,
  useMockData: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  // Publishable key printed by `supabase start`. It is the local development
  // key, not a secret: row level security is what protects the data.
  supabaseAnonKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  demoAccounts: [
    {
      label: 'Agent (Nina Okafor)',
      email: 'agent@example.com',
      password: 'DevPassword123!'
    },
    {
      label: 'Customer (Tomas Eriksen)',
      email: 'customer@example.com',
      password: 'DevPassword123!'
    }
  ],
  // The seeded instance owns the profiles, but these two identities are declared
  // here as well: when the local container is not running, `AuthStateService`
  // falls back to them so `ng serve` stays usable without Docker.
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