import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { TicketCommentRow, TicketRow } from '../models/database.types';
import { Ticket, TicketComment } from '../models/helpdesk.models';
import { HelpdeskMapper } from '../mappers/helpdesk.mapper';
import { SupabaseService } from './supabase.service';

export const GLOBAL_TICKETS_CHANNEL = 'tickets-global-feed';
export const ticketCommentChannel = (ticketId: string): string => `ticket-comments-${ticketId}`;

/** How many recent events are retained per stream. */
const EVENT_BUFFER = 50;

export interface TicketChangeEvent {
  readonly ticket: Ticket;
  readonly origin: 'local' | 'remote';
  readonly at: number;
}

export interface CommentChangeEvent {
  readonly ticketId: string;
  readonly comment: TicketComment;
  readonly origin: 'local' | 'remote';
  readonly at: number;
}

/**
 * Bridge between Postgres changes and the signal state in `TicketService`.
 *
 * Two kinds of subscription exist:
 *  - one global channel on `tickets`, alive for as long as the workspace is open,
 *    feeding the saved view counters and open tables;
 *  - one channel per open ticket for its comments, torn down when the tab closes.
 *
 * Writes made in this browser are published through `publishLocalTicket` and
 * `publishLocalComment`, so the interface reflects the change immediately instead
 * of waiting for the socket round trip. Events carry an `origin` for consumers
 * that need to tell the two apart.
 *
 * On a build configured to use mock data none of this touches the network: the
 * repositories publish locally and `isLive()` reports that the data is in memory.
 */
@Injectable({ providedIn: 'root' })
export class TicketRealtimeService {
  private readonly supabase = inject(SupabaseService);

  private readonly ticketEventsSignal = signal<readonly TicketChangeEvent[]>([]);
  private readonly commentEventsSignal = signal<readonly CommentChangeEvent[]>([]);
  private readonly watchedTicketIds = signal<ReadonlySet<string>>(new Set());

  private globalChannel: RealtimeChannel | null = null;
  private readonly ticketChannels = new Map<string, RealtimeChannel>();

  readonly ticketEvents = this.ticketEventsSignal.asReadonly();
  readonly commentEvents = this.commentEventsSignal.asReadonly();
  readonly isLive = computed(() => environment.useMockData || this.supabase.isConfigured);
  readonly watchedTickets = this.watchedTicketIds.asReadonly();

  constructor() {
    // Channels follow the tabs: opening a ticket subscribes, closing it unsubscribes.
    effect(() => {
      for (const ticketId of this.watchedTicketIds()) {
        this.openTicketChannel(ticketId);
      }
    });
  }

  /** Opens the global feed. Safe to call repeatedly; only the first call subscribes. */
  startGlobalFeed(): void {
    if (this.globalChannel || environment.useMockData) {
      return;
    }

    const channel = this.supabase.client.channel(GLOBAL_TICKETS_CHANNEL).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tickets' },
      (payload) => {
        const row = payload.new as TicketRow | undefined;
        if (!row || typeof row.id !== 'string') {
          return;
        }
        this.pushTicketEvent({ ticket: HelpdeskMapper.toTicket(row), origin: 'remote', at: Date.now() });
      }
    );

    this.globalChannel = channel;
    void channel.subscribe();
  }

  /** Starts streaming comments for a ticket that now has an open tab. */
  watchTicket(ticketId: string): void {
    const watched = new Set(this.watchedTicketIds());
    if (watched.has(ticketId)) {
      return;
    }
    watched.add(ticketId);
    this.watchedTicketIds.set(watched);
  }

  /** Releases the channel opened by `watchTicket`. */
  unwatchTicket(ticketId: string): void {
    const watched = new Set(this.watchedTicketIds());
    if (!watched.delete(ticketId)) {
      return;
    }
    this.watchedTicketIds.set(watched);

    const channel = this.ticketChannels.get(ticketId);
    if (channel) {
      this.ticketChannels.delete(ticketId);
      void this.supabase.client.removeChannel(channel);
    }
  }

  publishLocalTicket(ticket: Ticket): void {
    this.pushTicketEvent({ ticket, origin: 'local', at: Date.now() });
  }

  publishLocalComment(comment: TicketComment): void {
    this.commentEventsSignal.update((events) => [
      ...events.slice(-(EVENT_BUFFER - 1)),
      { ticketId: comment.ticketId, comment, origin: 'local', at: Date.now() }
    ]);
  }

  private pushTicketEvent(event: TicketChangeEvent): void {
    this.ticketEventsSignal.update((events) => [...events.slice(-(EVENT_BUFFER - 1)), event]);
  }

  private openTicketChannel(ticketId: string): void {
    if (this.ticketChannels.has(ticketId) || environment.useMockData) {
      return;
    }

    const channel = this.supabase.client.channel(ticketCommentChannel(ticketId)).on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ticket_comments',
        filter: `ticket_id=eq.${ticketId}`
      },
      (payload) => {
        const row = payload.new as TicketCommentRow | undefined;
        if (!row || typeof row.id !== 'string') {
          return;
        }
        this.commentEventsSignal.update((events) => [
          ...events.slice(-(EVENT_BUFFER - 1)),
          { ticketId, comment: HelpdeskMapper.toTicketComment(row), origin: 'remote', at: Date.now() }
        ]);
      }
    );

    this.ticketChannels.set(ticketId, channel);
    void channel.subscribe();
  }
}