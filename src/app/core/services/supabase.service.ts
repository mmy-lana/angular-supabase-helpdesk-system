import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Database } from '../models/database.types';

export const SUPABASE_BUCKET = 'ticket-attachments';

/**
 * Owns the single Supabase client instance.
 *
 * The client is built on first access and only when the build is not running on
 * mock data: the `demo` configuration ships empty connection strings, and
 * constructing a client from them would throw during bootstrap.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private instance: SupabaseClient<Database> | null = null;

  /** `false` when the target is misconfigured; surfaced by the auth screen instead of a stack trace. */
  get isConfigured(): boolean {
    if (environment.useMockData) {
      return true;
    }
    return this.url.length > 0 && this.anonKey.length > 0;
  }

  get client(): SupabaseClient<Database> {
    this.instance ??= this.buildClient();
    return this.instance;
  }

  /** Resolves a private bucket object to a short lived signed URL. */
  async createSignedAttachmentUrl(filePath: string, expiresInSeconds = 300): Promise<string> {
    const { data, error } = await this.client.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(filePath, expiresInSeconds);

    if (error) {
      throw new Error(`Could not create a download link for "${filePath}": ${error.message}`);
    }
    return data.signedUrl;
  }

  private buildClient(): SupabaseClient<Database> {
    if (environment.useMockData) {
      throw new Error('SupabaseService.client was requested in a build configured to use mock data.');
    }
    if (!this.isConfigured) {
      throw new Error(
        'Supabase is not configured. Set supabaseUrl and supabaseAnonKey in src/environments/environment.ts.'
      );
    }

    return createClient<Database>(this.url, this.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: { eventsPerSecond: 10 }
      },
      global: {
        headers: { 'x-application-name': 'help-desk-workspace' }
      }
    });
  }

  private get url(): string {
    return environment.supabaseUrl.trim().replace(/\/+$/, '');
  }

  private get anonKey(): string {
    return environment.supabaseAnonKey.trim();
  }
}