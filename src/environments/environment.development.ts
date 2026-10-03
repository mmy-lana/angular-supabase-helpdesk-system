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
  // The local instance is seeded by supabase/seed.sql, so no fixture profiles
  // are needed here and none are shipped in this bundle.
  demoIdentities: []
};