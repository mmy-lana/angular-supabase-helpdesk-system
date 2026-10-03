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

export interface DemoCommentSeed {
  readonly authorId: string;
  readonly body: string;
  /** Defaults to the age of the ticket, i.e. the opening message. */
  readonly hoursAgo?: number;
  readonly isInternal?: boolean;
}

export interface DemoTicketSeed {
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly subject: string;
  readonly status: 'new' | 'open' | 'pending' | 'solved' | 'closed';
  readonly priority: 'low' | 'normal' | 'high' | 'urgent';
  readonly type: 'question' | 'incident' | 'problem' | 'task';
  readonly tags: readonly string[];
  readonly createdHoursAgo: number;
  readonly solvedHoursAgo?: number;
  readonly comments: readonly DemoCommentSeed[];
}

export interface EnvironmentConfig {
  readonly production: boolean;
  readonly useMockData: boolean;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly demoAccounts: readonly DemoAccount[];
  /** Empty unless the build runs on mock data. */
  readonly demoIdentities: readonly DemoIdentity[];
  /** Sample tickets for the offline workspace. Empty in a production build. */
  readonly demoTicketSeeds: readonly DemoTicketSeed[];
}