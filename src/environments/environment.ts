import { EnvironmentConfig } from './environment.interface';

/**
 * Production target, used by `ng build`.
 *
 * The anon key is a publishable credential by design: what protects the data is
 * PostgreSQL row level security plus the `SECURITY DEFINER` functions in
 * `supabase/migrations`. Both values are supplied by the deployment pipeline and
 * must never be left blank in a shipped bundle — `SupabaseService` refuses to
 * build a client and the app reports the missing configuration instead of
 * silently failing every query.
 *
 * `demoAccounts` is empty on purpose: no demo credential reaches the bundle.
 */
export const environment: EnvironmentConfig = {
  production: true,
  useMockData: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
  demoAccounts: []
};