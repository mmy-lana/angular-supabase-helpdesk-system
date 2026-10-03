import { Injectable, inject } from '@angular/core';
import {
  Database,
  ProfileRow,
  TicketCommentRow,
  TicketRow,
  TicketStatus,
  TicketWithProfilesRow
} from '../models/database.types';
import {
  Attachment,
  CommentForbiddenError,
  CreateCommentDTO,
  CreateTicketDTO,
  CustomerAssignmentForbiddenError,
  InvalidAttachmentPathError,
  InvalidAssigneeError,
  Profile,
  Ticket,
  TicketComment,
  TicketConcurrencyError,
  TicketCursor,
  TicketClosedError,
  TicketViewId,
  UpdateTicketDTO
} from '../models/helpdesk.models';
import { HelpdeskMapper } from '../mappers/helpdesk.mapper';
import { AuthStateService } from './auth-state.service';
import { DataRepository, TICKET_PAGE_SIZE } from './data-repository.interface';
import { SUPABASE_BUCKET, SupabaseService } from './supabase.service';
import { TicketRealtimeService } from './ticket-realtime.service';

const HISTORY_LIMIT = 6;
const SEARCH_LIMIT = 25;
const PROFILE_COLUMNS = 'id, email, full_name, avatar_url, role, created_at, updated_at';
const TICKET_SELECT = `*, requester:profiles!requester_id(${PROFILE_COLUMNS}), assignee:profiles!assignee_id(${PROFILE_COLUMNS})`;

const UNSOLVED: readonly TicketStatus[] = ['new', 'open', 'pending'];

type TicketUpdatePayload = Database['public']['Tables']['tickets']['Update'];

/** Maps a Postgres SQLSTATE raised by a trigger to the matching domain error. */
function translateError(error: { code?: string; message: string }, context: string): Error {
  switch (error.code) {
    case 'HD001':
      return new TicketClosedError();
    case 'HD002':
      return new InvalidAssigneeError();
    case 'HD003':
      return new InvalidAttachmentPathError();
    case 'HD004':
      return new CustomerAssignmentForbiddenError();
    case 'HD005':
      return new TicketClosedError('Cannot comment on a closed ticket.');
    case '42501':
      return new CommentForbiddenError();
    case 'PGRST116':
      return new TicketConcurrencyError('Ticket could not be updated or access was denied. Refresh and try again.');
    default:
      return new Error(`${context}: ${error.message}`);
  }
}

/**
 * Postgres backed repository.
 *
 * Every read is shaped for the relation select the workspace needs, every write
 * carries the `version` it was based on, and every database rule is enforced by
 * the server: this class reports what Postgres decided, it does not decide.
 */
@Injectable()
export class SupabaseDataRepository implements DataRepository {
  private readonly supabase = inject(SupabaseService);
  private readonly authState = inject(AuthStateService);
  private readonly realtime = inject(TicketRealtimeService);

  async getTicketsByView(view: TicketViewId, cursor?: TicketCursor): Promise<readonly Ticket[]> {
    const currentUser = this.authState.currentUser();

    let query = this.supabase.client
      .from('tickets')
      .select(TICKET_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(TICKET_PAGE_SIZE);

    switch (view) {
      case 'my-tickets':
        query = currentUser
          ? query.eq('assignee_id', currentUser.id).in('status', [...UNSOLVED])
          : query;
        break;
      case 'unassigned':
        query = query.is('assignee_id', null).in('status', ['new', 'open']);
        break;
      case 'all-unsolved':
        query = query.in('status', [...UNSOLVED]);
        break;
      case 'solved':
        query = query.eq('status', 'solved');
        break;
    }

    if (cursor) {
      // Keyset pagination: strictly older than the last row of the previous page.
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Could not load tickets: ${error.message}`);
    }
    return this.mapTicketRows(data as unknown as TicketWithProfilesRow[] | null);
  }

  async getTicketById(id: string): Promise<Ticket> {
    const { data, error } = await this.supabase.client
      .from('tickets')
      .select(TICKET_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not load ticket: ${error.message}`);
    }
    if (!data) {
      throw new Error('This ticket does not exist, or it is not visible to your account.');
    }

    const rows = data as unknown as TicketWithProfilesRow;
    return HelpdeskMapper.toTicket(rows, rows.requester, rows.assignee);
  }

  async getComments(ticketId: string): Promise<readonly TicketComment[]> {
    const { data, error } = await this.supabase.client
      .from('ticket_comments')
      .select(`*, author:profiles!author_id(${PROFILE_COLUMNS})`)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Could not load the conversation: ${error.message}`);
    }

    return ((data ?? []) as unknown as (TicketCommentRow & { author: ProfileRow })[]).map((row) =>
      HelpdeskMapper.toTicketComment(row, row.author)
    );
  }

  async createTicket(dto: CreateTicketDTO): Promise<Ticket> {
    const { data, error } = await this.supabase.client.rpc('create_ticket_atomic', {
      p_subject: dto.subject,
      p_body: dto.body,
      p_priority: dto.priority,
      p_type: dto.type,
      p_tags: [...dto.tags],
      p_assignee_id: dto.assigneeId ?? null,
      p_attachments: HelpdeskMapper.toAttachmentRowList(dto.attachments)
    });

    if (error) {
      throw translateError(error, 'Could not create the ticket');
    }
    if (!data) {
      throw new Error('The ticket was created but the database returned no record.');
    }

    const ticket = HelpdeskMapper.toTicket(data as TicketRow);
    this.realtime.publishLocalTicket(ticket);
    return ticket;
  }

  async updateTicket(ticketId: string, dto: UpdateTicketDTO): Promise<Ticket> {
    const payload: TicketUpdatePayload = {};
    if (dto.subject !== undefined) payload.subject = dto.subject;
    if (dto.status !== undefined) payload.status = dto.status;
    if (dto.priority !== undefined) payload.priority = dto.priority;
    if (dto.type !== undefined) payload.type = dto.type;
    if (dto.assigneeId !== undefined) payload.assignee_id = dto.assigneeId;
    if (dto.tags !== undefined) payload.tags = [...dto.tags];

    const { data, error } = await this.supabase.client
      .from('tickets')
      .update(payload)
      .eq('id', ticketId)
      .eq('version', dto.version)
      .select(TICKET_SELECT)
      .maybeSingle();

    if (error) {
      throw translateError(error, 'Could not update the ticket');
    }
    if (!data) {
      // No row matched: either somebody else changed the ticket first, or the
      // change is not allowed. Both mean the client has to reload.
      throw new TicketConcurrencyError();
    }

    const rows = data as unknown as TicketWithProfilesRow;
    const ticket = HelpdeskMapper.toTicket(rows, rows.requester, rows.assignee);
    this.realtime.publishLocalTicket(ticket);
    return ticket;
  }

  async claimTicket(ticketId: string, agentId: string, version: number): Promise<Ticket> {
    const { data, error } = await this.supabase.client
      .from('tickets')
      .update({ assignee_id: agentId })
      .eq('id', ticketId)
      .eq('version', version)
      .is('assignee_id', null)
      .select(TICKET_SELECT)
      .maybeSingle();

    if (error) {
      throw translateError(error, 'Could not claim the ticket');
    }
    if (!data) {
      throw new TicketConcurrencyError(
        'This ticket was claimed by somebody else while you were looking at it.'
      );
    }

    const rows = data as unknown as TicketWithProfilesRow;
    const ticket = HelpdeskMapper.toTicket(rows, rows.requester, rows.assignee);
    this.realtime.publishLocalTicket(ticket);
    return ticket;
  }

  async addComment(dto: CreateCommentDTO): Promise<TicketComment> {
    const author = this.authState.currentUser();
    if (!author) {
      throw new CommentForbiddenError('Sign in before replying to a ticket.');
    }

    const { data, error } = await this.supabase.client
      .from('ticket_comments')
      .insert(HelpdeskMapper.toCreateCommentRow(dto.ticketId, author.id, dto))
      .select(`*, author:profiles!author_id(${PROFILE_COLUMNS})`)
      .single();

    if (error) {
      throw translateError(error, 'Could not post the comment');
    }

    const row = data as unknown as TicketCommentRow & { author: ProfileRow };
    const comment = HelpdeskMapper.toTicketComment(row, row.author);
    this.realtime.publishLocalComment(comment);
    return comment;
  }

  async getViewCounts(): Promise<Readonly<Record<TicketViewId, number>>> {
    const currentUser = this.authState.currentUser();

    const countFor = async (view: TicketViewId): Promise<number> => {
      let query = this.supabase.client.from('tickets').select('id', { count: 'exact', head: true });

      switch (view) {
        case 'my-tickets':
          query = currentUser
            ? query.eq('assignee_id', currentUser.id).in('status', [...UNSOLVED])
            : query;
          break;
        case 'unassigned':
          query = query.is('assignee_id', null).in('status', ['new', 'open']);
          break;
        case 'all-unsolved':
          query = query.in('status', [...UNSOLVED]);
          break;
        case 'solved':
          query = query.eq('status', 'solved');
          break;
      }

      const { count, error } = await query;
      if (error) {
        throw new Error(`Could not count tickets: ${error.message}`);
      }
      return count ?? 0;
    };

    const [myTickets, unassigned, allUnsolved, solved] = await Promise.all([
      countFor('my-tickets'),
      countFor('unassigned'),
      countFor('all-unsolved'),
      countFor('solved')
    ]);

    return { 'my-tickets': myTickets, unassigned, 'all-unsolved': allUnsolved, solved };
  }

  async searchTickets(query: string, limit = SEARCH_LIMIT): Promise<readonly Ticket[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }

    // Escape the wildcards PostgREST would otherwise interpret inside `ilike`.
    const escaped = trimmed.replace(/[%_,()\\]/g, (character) => `\\${character}`);
    const { data, error } = await this.supabase.client
      .from('tickets')
      .select(TICKET_SELECT)
      .ilike('subject', `%${escaped}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
    return this.mapTicketRows(data as unknown as TicketWithProfilesRow[] | null);
  }

  async getTicketsByRequester(requesterId: string, excludeTicketId?: string): Promise<readonly Ticket[]> {
    let query = this.supabase.client
      .from('tickets')
      .select(TICKET_SELECT)
      .eq('requester_id', requesterId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);

    if (excludeTicketId) {
      query = query.neq('id', excludeTicketId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Could not load ticket history: ${error.message}`);
    }
    return this.mapTicketRows(data as unknown as TicketWithProfilesRow[] | null);
  }

  async listAssignableProfiles(): Promise<readonly Profile[]> {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .in('role', ['agent', 'admin'])
      .order('full_name', { ascending: true });

    if (error) {
      throw new Error(`Could not load agents: ${error.message}`);
    }
    return HelpdeskMapper.toProfileList((data ?? []) as ProfileRow[]);
  }

  async uploadAttachment(file: File): Promise<Attachment> {
    const owner = this.authState.currentUser();
    if (!owner) {
      throw new CommentForbiddenError('Sign in before attaching a file.');
    }

    const filePath = HelpdeskMapper.attachmentPath(owner.id, file.name);
    const { error } = await this.supabase.client.storage.from(SUPABASE_BUCKET).upload(filePath, file, {
      cacheControl: '3600',
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });

    if (error) {
      throw new InvalidAttachmentPathError(`The file could not be stored: ${error.message}`);
    }

    return { id: filePath, name: file.name, filePath, size: file.size, mimeType: file.type || 'application/octet-stream' };
  }

  async getAttachmentUrl(filePath: string): Promise<string> {
    return this.supabase.createSignedAttachmentUrl(filePath);
  }

  resetLocalData(): void {
    // Nothing about the ticket data is cached in the browser by this repository.
  }

  private mapTicketRows(rows: TicketWithProfilesRow[] | null): readonly Ticket[] {
    return (rows ?? []).map((row) => HelpdeskMapper.toTicket(row, row.requester, row.assignee));
  }
}