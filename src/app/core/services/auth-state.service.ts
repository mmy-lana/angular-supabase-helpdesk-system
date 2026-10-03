import { computed, inject, Injectable, signal } from '@angular/core';
import type { Subscription, User } from '@supabase/supabase-js';
import { DemoAccount } from '../../../environments/environment.interface';
import { environment } from '../../../environments/environment';
import { ProfileRow, UserRole } from '../models/database.types';
import { HelpdeskMapper } from '../mappers/helpdesk.mapper';
import { Profile } from '../models/helpdesk.models';
import { clearStored, readStoredJson, writeStoredJson } from '../../shared/utils/browser-storage';
import { SupabaseService } from './supabase.service';
import { isTransportFailure } from './transport-failure';

/** Local storage key holding the showcase session address. */
const MOCK_SESSION_KEY = 'MOCK_SESSION_V1';

export type AuthStatus = 'initializing' | 'authenticated' | 'anonymous' | 'misconfigured';

/** Showcase identities have no real join date; a fixed one keeps rendering stable. */
const DEMO_IDENTITY_JOINED_AT = '2026-01-01T00:00:00.000Z';

export interface RegisterOutcome {
  readonly requiresEmailConfirmation: boolean;
}

/**
 * Single source of truth for "who is signed in".
 *
 * Features read `currentUser()`, `userRole()` and `canUseInternalNotes()`; they
 * never talk to Supabase auth directly, which keeps the offline `demo` build on
 * exactly the same code path.
 */
@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private readonly supabase = inject(SupabaseService);

  private readonly profileSignal = signal<Profile | null>(null);
  private readonly statusSignal = signal<AuthStatus>('initializing');
  private readonly errorSignal = signal<string | null>(null);
  private readonly busySignal = signal(false);

  private authSubscription: Subscription | null = null;
  private initialization: Promise<void> | null = null;

  readonly currentUser = this.profileSignal.asReadonly();
  readonly status = this.statusSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();

  readonly isAuthenticated = computed(() => this.profileSignal() !== null);
  readonly userRole = computed<UserRole | null>(() => this.profileSignal()?.role ?? null);
  readonly isAgent = computed(() => this.userRole() === 'agent' || this.userRole() === 'admin');
  readonly canUseInternalNotes = this.isAgent;
  readonly displayName = computed(() => this.profileSignal()?.fullName ?? '');
  readonly demoAccounts = environment.demoAccounts;
  readonly demoSwitchingEnabled = !environment.production && environment.demoAccounts.length > 0;
  readonly usesMockData = environment.useMockData;

  /**
   * True once this browser has concluded that Supabase cannot be reached.
   *
   * The flag starts true for a build configured on mock data and flips the first
   * time a request fails at the transport layer. `ResilientDataRepository` reads
   * it to choose its backend, and `TicketRealtimeService` reads it to stay off
   * the websocket, so neither has to rediscover the outage on its own.
   */
  readonly isOperatingOffline = signal<boolean>(environment.useMockData);

  /** Idempotent: the first caller starts session restoration, later callers await it. */
  ensureInitialized(): Promise<void> {
    this.initialization ??= this.initialize();
    return this.initialization;
  }

  async signIn(email: string, password: string): Promise<void> {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      throw new Error('Enter your email address and password.');
    }

    this.busySignal.set(true);
    this.errorSignal.set(null);
    try {
      if (environment.useMockData) {
        this.signInToMockAccount(trimmedEmail, password);
        return;
      }

      try {
        const { error } = await this.supabase.client.auth.signInWithPassword({
          email: trimmedEmail,
          password
        });
        if (error) {
          if (this.fallBackToDemoIdentityIfOffline(trimmedEmail, password, error.message)) {
            return;
          }
          throw new Error(this.describeAuthError(error.message));
        }
      } catch (failure) {
        // A local container that is not running must not lock a developer out of
        // their own workspace. The raw message is inspected before it is
        // rewritten, because the friendly wording hides whether it was a
        // rejection or a transport failure.
        if (this.fallBackToDemoIdentityIfOffline(trimmedEmail, password, failure)) {
          return;
        }
        throw failure;
      }
      await this.loadAuthenticatedProfile(() => this.supabase.client.auth.getUser());
    } catch (failure) {
      this.errorSignal.set(this.describeAuthError(failure instanceof Error ? failure.message : String(failure)));
      throw failure;
    } finally {
      this.busySignal.set(false);
    }
  }

  async register(email: string, password: string, fullName: string): Promise<RegisterOutcome> {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();
    if (!trimmedEmail || !password) {
      throw new Error('Enter your email address and password.');
    }
    if (trimmedName.length < 2) {
      throw new Error('Enter the name colleagues will see on your tickets.');
    }

    this.busySignal.set(true);
    this.errorSignal.set(null);
    try {
      if (environment.useMockData) {
        throw new Error('Account creation is disabled in the offline showcase. Sign in with a demo account.');
      }

      const { data, error } = await this.supabase.client.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { full_name: trimmedName } }
      });

      if (error) {
        throw new Error(this.describeAuthError(error.message));
      }
      if (!data.session || !data.user) {
        return { requiresEmailConfirmation: true };
      }

      await this.loadAuthenticatedProfile(async () => ({ data: { user: data.user }, error: null }));
      return { requiresEmailConfirmation: false };
    } catch (failure) {
      this.errorSignal.set(this.describeAuthError(failure instanceof Error ? failure.message : String(failure)));
      throw failure;
    } finally {
      this.busySignal.set(false);
    }
  }

  /** Switches the signed in identity to one of the bundled demo accounts. */
  async signInAsDemoAccount(account: DemoAccount): Promise<void> {
    await this.signIn(account.email, account.password);
  }

  async signOut(): Promise<void> {
    this.errorSignal.set(null);
    if (environment.useMockData) {
      clearStored(MOCK_SESSION_KEY);
      this.profileSignal.set(null);
      this.statusSignal.set('anonymous');
      return;
    }

    const { error } = await this.supabase.client.auth.signOut();
    if (error) {
      this.errorSignal.set(this.describeAuthError(error.message));
      return;
    }
    this.profileSignal.set(null);
    this.statusSignal.set('anonymous');
  }

  /** Re-reads the profile row, picking up role and name changes made elsewhere. */
  async refreshProfile(): Promise<void> {
    if (!this.isAuthenticated()) {
      return;
    }
    if (environment.useMockData) {
      return;
    }
    await this.loadAuthenticatedProfile(() => this.supabase.client.auth.getUser());
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  private async initialize(): Promise<void> {
    if (!environment.useMockData && !this.supabase.isConfigured) {
      this.statusSignal.set('misconfigured');
      this.errorSignal.set(
        'This build is not connected to Supabase. Set supabaseUrl and supabaseAnonKey in src/environments/environment.ts.'
      );
      return;
    }

    if (environment.useMockData) {
      const storedEmail = readStoredJson<string>(MOCK_SESSION_KEY);
      const profile = storedEmail ? this.mockProfileFor(storedEmail) : null;
      this.profileSignal.set(profile);
      this.statusSignal.set('anonymous');
      return;
    }

    try {
      const { data } = await this.supabase.client.auth.getSession();
      if (data.session?.user) {
        await this.loadAuthenticatedProfile(() => this.supabase.client.auth.getUser());
      } else {
        this.profileSignal.set(null);
        this.statusSignal.set('anonymous');
      }
      this.listenForAuthChanges();
    } catch (failure) {
      this.profileSignal.set(null);
      if (!environment.production && isTransportFailure(failure)) {
        // Nothing to restore and nowhere to restore it from. Recording the
        // outage switches the data layer to mock repositories as well, so the
        // whole workspace degrades instead of just the login screen.
        this.isOperatingOffline.set(true);
        this.statusSignal.set('anonymous');
        return;
      }
      this.statusSignal.set('anonymous');
      this.errorSignal.set(this.describeAuthError(failure instanceof Error ? failure.message : String(failure)));
    }
  }

  /**
   * Signs a bundled demo identity in when Supabase cannot be reached.
   *
   * Only a transport failure qualifies, and only outside a production build: a
   * wrong password or an unknown account must still be reported. The throw in
   * `signIn` is deliberately never reached on the fallback path, because the
   * account being used is one this build declares itself.
   */
  private fallBackToDemoIdentityIfOffline(email: string, password: string, cause: unknown): boolean {
    if (environment.production || !isTransportFailure(cause) || !this.isDemoAccount(email)) {
      return false;
    }
    console.warn(
      'Supabase container unreachable on port 54321. Seamlessly falling back to local demo mock identity.'
    );
    this.isOperatingOffline.set(true);
    this.signInToMockAccount(email, password);
    return true;
  }

    private isDemoAccount(email: string): boolean {
    return environment.demoAccounts.some((account) => account.email.toLowerCase() === email);
  }

  private listenForAuthChanges(): void {
    if (this.authSubscription) {
      return;
    }
    const { data } = this.supabase.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        this.profileSignal.set(null);
        this.statusSignal.set('anonymous');
        return;
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        void this.loadAuthenticatedProfile(() => this.supabase.client.auth.getUser());
      }
    });
    this.authSubscription = data.subscription;
  }

  private async loadAuthenticatedProfile(
    resolveUser: () => Promise<{ data: { user: User | null }; error: { message: string } | null }>
  ): Promise<void> {
    const { data, error } = await resolveUser();
    if (error) {
      throw new Error(this.describeAuthError(error.message));
    }
    const user = data.user;
    if (!user) {
      this.profileSignal.set(null);
      this.statusSignal.set('anonymous');
      return;
    }

    const { data: profileRow, error: profileError } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Could not read the profile for ${user.email}: ${profileError.message}`);
    }
    if (!profileRow) {
      throw new Error(
        'This account has no help desk profile yet. Ask an administrator to grant access before signing in.'
      );
    }

    this.profileSignal.set(HelpdeskMapper.toProfile(profileRow as ProfileRow));
    this.statusSignal.set('authenticated');
    this.errorSignal.set(null);
  }

  private signInToMockAccount(email: string, password: string): void {
    const account = environment.demoAccounts.find(
      (candidate) => candidate.email.toLowerCase() === email && candidate.password === password
    );
    if (!account) {
      throw new Error('Those demo credentials are not part of this showcase. Pick one of the listed accounts.');
    }
    const profile = this.mockProfileFor(account.email);
    if (!profile) {
      throw new Error(`The offline showcase has no profile for ${account.email}.`);
    }

    writeStoredJson(MOCK_SESSION_KEY, profile.email);
    this.profileSignal.set(profile);
    this.statusSignal.set('authenticated');
  }

  /**
   * Resolves a showcase identity. The directory lives in the demo environment
   * file, so this lookup has nothing to bundle in a production build.
   */
  private mockProfileFor(email: string): Profile | null {
    const identity = environment.demoIdentities.find(
      (candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (!identity) {
      return null;
    }
    return {
      id: identity.id,
      email: identity.email,
      fullName: identity.fullName,
      avatarUrl: null,
      role: identity.role,
      createdAt: DEMO_IDENTITY_JOINED_AT,
      updatedAt: DEMO_IDENTITY_JOINED_AT
    };
  }

  private describeAuthError(message: string): string {
    const lowered = message.toLowerCase();
    if (lowered.includes('invalid login credentials')) {
      return 'That email address and password combination was not recognised.';
    }
    if (lowered.includes('email not confirmed')) {
      return 'Confirm your email address before signing in.';
    }
    if (lowered.includes('already registered') || lowered.includes('already been registered')) {
      return 'An account already exists for that email address. Sign in instead.';
    }
    if (lowered.includes('failed to fetch') || lowered.includes('network')) {
      return 'Could not reach the authentication server. Check your connection and try again.';
    }
    return message;
  }
}