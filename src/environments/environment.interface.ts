export interface DemoAccount {
  readonly label: string;
  readonly email: string;
  readonly password: string;
}

/**
 * A profile that exists only for the offline showcase.
 *
 * These records live in the environment file rather than in application code so
 * that a production bundle, which replaces that file, carries none of them.
 */
export interface DemoIdentity {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: 'customer' | 'agent' | 'admin';
}

export interface EnvironmentConfig {
  readonly production: boolean;
  readonly useMockData: boolean;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly demoAccounts: readonly DemoAccount[];
  /** Empty unless the build runs on mock data. */
  readonly demoIdentities: readonly DemoIdentity[];
}