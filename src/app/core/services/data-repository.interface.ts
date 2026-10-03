import { InjectionToken } from '@angular/core';
import {
  Attachment,
  CreateCommentDTO,
  CreateTicketDTO,
  Profile,
  Ticket,
  TicketComment,
  TicketCursor,
  TicketViewId,
  UpdateTicketDTO
} from '../models/helpdesk.models';

/** Rows fetched per page by every view query. Shared so the UI knows when to offer "load more". */
export const TICKET_PAGE_SIZE = 25;

/**
 * Everything the workspace needs from its data source.
 *
 * `SupabaseDataRepository` is backed by PostgreSQL, row level security and the
 * `create_ticket_atomic` RPC. `MockDataRepository` re-implements the same domain
 * rules in memory for the offline showcase. Features depend on this abstraction
 * only, never on a concrete backend.
 */
export abstract class DataRepository {
  /** Keyset paginated page, newest first, already scoped by the caller's role. */
  abstract getTicketsByView(view: TicketViewId, cursor?: TicketCursor): Promise<readonly Ticket[]>;

  abstract getTicketById(id: string): Promise<Ticket>;

  abstract getComments(ticketId: string): Promise<readonly TicketComment[]>;

  abstract createTicket(dto: CreateTicketDTO): Promise<Ticket>;

  /**
   * Optimistic update. Implementations must apply `dto.version` as a condition and
   * reject the write with `TicketConcurrencyError` when the row moved on.
   */
  abstract updateTicket(ticketId: string, dto: UpdateTicketDTO): Promise<Ticket>;

  /** Assigns an unassigned ticket to one agent, or throws `TicketConcurrencyError`. */
  abstract claimTicket(ticketId: string, agentId: string, version: number): Promise<Ticket>;

  abstract addComment(dto: CreateCommentDTO): Promise<TicketComment>;

  /** Badge counters for every saved view, in one round of requests. */
  abstract getViewCounts(): Promise<Readonly<Record<TicketViewId, number>>>;

  abstract searchTickets(query: string, limit?: number): Promise<readonly Ticket[]>;

  /** Earlier tickets from the same person, newest first, used by the requester pane. */
  abstract getTicketsByRequester(requesterId: string, excludeTicketId?: string): Promise<readonly Ticket[]>;

  /** Agents and admins, i.e. the only profiles a ticket may be assigned to. */
  abstract listAssignableProfiles(): Promise<readonly Profile[]>;

  /** Uploads to the caller's own folder in the attachment bucket. */
  abstract uploadAttachment(file: File): Promise<Attachment>;

  /** Short lived download URL for a stored attachment. */
  abstract getAttachmentUrl(filePath: string): Promise<string>;

  /** Drops locally cached demo state. A no-op for backends that hold no client state. */
  abstract resetLocalData(): void;
}

/** Convenience token for tests and for wiring an alternative repository. */
export const DATA_REPOSITORY = new InjectionToken<DataRepository>('DATA_REPOSITORY');