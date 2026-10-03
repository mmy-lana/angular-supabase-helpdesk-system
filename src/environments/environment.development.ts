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
  supabaseAnonKey: 'local-development-anon-key',
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
  demoIdentities: [
    {
      id: '5f2b9c10-0002-4c7a-9a11-000000000002',
      email: 'agent@example.com',
      fullName: 'Nina Okafor',
      role: 'agent'
    },
    {
      id: '5f2b9c10-0004-4c7a-9a11-000000000004',
      email: 'customer@example.com',
      fullName: 'Tomas Eriksen',
      role: 'customer'
    }
  ]
};