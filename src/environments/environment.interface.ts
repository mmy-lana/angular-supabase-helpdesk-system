export interface DemoAccount {
  readonly label: string;
  readonly email: string;
  readonly password: string;
}

export interface EnvironmentConfig {
  readonly production: boolean;
  readonly useMockData: boolean;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly demoAccounts: readonly DemoAccount[];
}
