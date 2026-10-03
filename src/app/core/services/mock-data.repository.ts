import { Injectable, inject } from '@angular/core';
import {
  ProfileRow,
  TicketAuditLogRow,
  TicketCommentRow,
  TicketRow,
  TicketStatus
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
import { clearStored, readStoredJson, writeStoredJson } from '../../shared/utils/browser-storage';
import { AuthStateService } from './auth-state.service';
import { DataRepository, TICKET_PAGE_SIZE } from './data-repository.interface';
import {
  MOCK_DATA_KEY,
  assignableMockProfiles,
  buildMockDataset,
  findMockProfileById
} from './mock-fixtures';
import { TicketRealtimeService } from './ticket-realtime.service';

const HISTORY_LIMIT = 6;
const SEARCH_LIMIT = 25;
const UNSOLVED: readonly TicketStatus[] = ['new', 'open', 'pending'];
const REOPENABLE: readonly TicketStatus[] = ['new', 'open'];

interface StoredDataset {
  readonly schemaVersion: 1;
  readonly tickets: TicketRow[];
  readonly comments: TicketCommentRow[];
  readonly auditLogs: TicketAuditLogRow[];
}

/**
 * Offline backend for the `demo` build.
 *
 * It re-implements the rules the database enforces so the showcase behaves like
 * the real product rather than like a toy: closed tickets are terminal, version
 * numbers reject stale writes, customers cannot assign tickets or post internal
 * notes, internal notes are invisible to customers, a customer reply on a solved
 * ticket reopens it, and a comment moves `updatedAt` without consuming a version.
 *
 * Everything lives in the browser. There is no isolation between accounts and no
 * authorization worth the name, which is why this class is only wired up when
 * `environment.useMockData` is true.
 */
@Injectable()
export class MockDataRepository implements DataRepository {
  private readonly authState = inject(AuthStateService);
  private readonly realtime = inject(TicketRealtimeService);

  private tickets: TicketRow[] = [];
  private comments: TicketCommentRow[] = [];
  private auditLogs: TicketAuditLogRow[] = [];

  /** Bytes of files uploaded in this session, so attachments really do open. */
  private readonly uploadedFiles = new Map<string, Blob>();
  private readonly objectUrls = new Map<string, string>();

  constructor() {
    this.load();
  }

  async getTicketsByView(view: TicketViewId, cursor?: TicketCursor): Promise<readonly Ticket[]> {
    const visible = this.visibleTickets().filter((row) => this.matchesView(row, view));
    const ordered = visible.sort((left, right) => this.compareForPagination(left, right));

    const startIndex = cursor
      ? ordered.findIndex(
          (row) =>
            row.created_at === cursor.createdAt ? row.id < cursor.id : row.created_at < cursor.createdAt
        )
      : 0;
    const from = startIndex < 0 ? ordered.length : startIndex;

    return this.decorate(ordered.slice(from, from + TICKET_PAGE_SIZE));
  }

  async getTicketById(id: string): Promise<Ticket> {
    const row = this.requireVisibleTicket(id);
    return this.decorate([row])[0];
  }

  async getComments(ticketId: string): Promise<readonly TicketComment[]> {
    this.requireVisibleTicket(ticketId);
    const canSeeInternal = this.isAgent();

    return this.comments
      .filter((row) => row.ticket_id === ticketId && (canSeeInternal || !row.is_internal))
      .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
      .map((row) => HelpdeskMapper.toTicketComment(row, this.profile(row.author_id)));
  }

  async createTicket(dto: CreateTicketDTO): Promise<Ticket> {
    const author = this.requireCurrentUser();
    const tags = this.assertCreationRules(dto, author);

    const now = new Date().toISOString();
    const row: TicketRow = {
      id: this.newId(),
      ticket_number: this.nextTicketNumber(),
      requester_id: author.id,
      assignee_id: dto.assigneeId ?? null,
      subject: dto.subject.trim(),
      status: 'new',
      priority: dto.priority,
      type: dto.type,
      tags,
      version: 1,
      created_at: now,
      updated_at: now,
      solved_at: null
    };

    this.tickets = [row, ...this.tickets];
    this.comments = [
      ...this.comments,
      {
        id: this.newId(),
        ticket_id: row.id,
        author_id: author.id,
        body: dto.body.trim(),
        is_internal: false,
        attachments: HelpdeskMapper.toAttachmentRowList(dto.attachments),
        created_at: now
      }
    ];
    this.auditLogs = [
      ...this.auditLogs,
      {
        id: this.newId(),
        ticket_id: row.id,
        actor_id: author.id,
        action: 'ticket_created',
        changes: { subject: { from: null, to: row.subject } },
        created_at: now
      }
    ];
    this.persist();

    const ticket = this.decorate([row])[0];
    this.realtime.publishLocalTicket(ticket);
    return ticket;
  }

  async updateTicket(ticketId: string, dto: UpdateTicketDTO): Promise<Ticket> {
    if (!this.isAgent()) {
      throw new CommentForbiddenError('Only agents can change ticket properties.');
    }

    const index = this.tickets.findIndex((row) => row.id === ticketId);
    const current = index >= 0 ? this.tickets[index] : null;
    if (!current) {
      throw new CommentForbiddenError('This ticket does not exist, or it is not visible to your account.');
    }
    this.assertWritable(current);

    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      this.assertAssignable(dto.assigneeId);
    }
    if (dto.version !== current.version) {
      throw new TicketConcurrencyError();
    }

    const now = new Date().toISOString();
    const next: TicketRow = {
      ...current,
      subject: dto.subject?.trim() ?? current.subject,
      status: dto.status ?? current.status,
      priority: dto.priority ?? current.priority,
      type: dto.type ?? current.type,
      assignee_id: dto.assigneeId === undefined ? current.assignee_id : dto.assigneeId,
      tags: dto.tags === undefined ? current.tags : [...dto.tags],
      version: current.version + 1,
      updated_at: now,
      solved_at: (dto.status ?? current.status) === 'solved' ? (current.solved_at ?? now) : null
    };

    this.tickets = [...this.tickets.slice(0, index), next, ...this.tickets.slice(index + 1)];
    this.auditLogs = [...this.auditLogs, this.auditEntry(next, this.requireCurrentUser().id, now, current)];
    this.persist();

    const ticket = this.decorate([next])[0];
    this.realtime.publishLocalTicket(ticket);
    return ticket;
  }

  async claimTicket(ticketId: string, agentId: string, version: number): Promise<Ticket> {
    if (!this.isAgent()) {
      throw new CommentForbiddenError('Only agents can claim tickets.');
    }
    this.assertAssignable(agentId);

    const index = this.tickets.findIndex((row) => row.id === ticketId);
    const current = index >= 0 ? this.tickets[index] : null;
    if (!current) {
      throw new CommentForbiddenError('This ticket is not visible to your account.');
    }
    this.assertWritable(current);

    if (current.assignee_id !== null) {
      throw new TicketConcurrencyError('Somebody else claimed this ticket first.');
    }
    if (current.version !== version) {
      throw new TicketConcurrencyError();
    }

    const now = new Date().toISOString();
    const next: TicketRow = {
      ...current,
      assignee_id: agentId,
      version: current.version + 1,
      updated_at: now
    };

    this.tickets = [...this.tickets.slice(0, index), next, ...this.tickets.slice(index + 1)];
    this.auditLogs = [...this.auditLogs, this.auditEntry(next, agentId, now, current)];
    this.persist();

    const ticket = this.decorate([next])[0];
    this.realtime.publishLocalTicket(ticket);
    return ticket;
  }

  async addComment(dto: CreateCommentDTO): Promise<TicketComment> {
    const author = this.requireCurrentUser();
    const ticketIndex = this.tickets.findIndex((row) => row.id === dto.ticketId);
    const ticket = ticketIndex >= 0 ? this.tickets[ticketIndex] : null;

    if (!ticket || !this.canReadTicket(ticket)) {
      throw new CommentForbiddenError('This ticket is not visible to your account.');
    }
    if (ticket.status === 'closed') {
      throw new TicketClosedError('Cannot comment on a closed ticket.');
    }
    if (dto.isInternal && author.role === 'customer') {
      throw new CommentForbiddenError('Internal notes are only available to agents.');
    }
    this.assertAttachmentOwnership(HelpdeskMapper.toAttachmentRowList(dto.attachments), author.id);

    const now = new Date().toISOString();
    const row: TicketCommentRow = {
      id: this.newId(),
      ticket_id: dto.ticketId,
      author_id: author.id,
      body: dto.body.trim(),
      is_internal: dto.isInternal,
      attachments: HelpdeskMapper.toAttachmentRowList(dto.attachments),
      created_at: now
    };
    this.comments = [...this.comments, row];

    // A comment moves the ticket up the list, but it does not change a property,
    // so the version stays untouched exactly like the trigger does.
    let touched = ticket;
    if (author.role === 'customer' && ticket.status === 'solved' && !dto.isInternal) {
      touched = { ...ticket, status: 'open', solved_at: null, version: ticket.version + 1, updated_at: now };
      this.tickets = [...this.tickets.slice(0, ticketIndex), touched, ...this.tickets.slice(ticketIndex + 1)];
      this.auditLogs = [...this.auditLogs, this.auditEntry(touched, author.id, now, ticket)];
      this.realtime.publishLocalTicket(this.decorate([touched])[0]);
    } else {
      touched = { ...ticket, updated_at: now };
      this.tickets = [...this.tickets.slice(0, ticketIndex), touched, ...this.tickets.slice(ticketIndex + 1)];
    }
    this.persist();

    const comment = HelpdeskMapper.toTicketComment(row, this.profile(author.id));
    this.realtime.publishLocalComment(comment);
    return comment;
  }

  async getViewCounts(): Promise<Readonly<Record<TicketViewId, number>>> {
    const count = (view: TicketViewId): number =>
      this.visibleTickets().filter((row) => this.matchesView(row, view)).length;

    return {
      'my-tickets': count('my-tickets'),
      unassigned: count('unassigned'),
      'all-unsolved': count('all-unsolved'),
      solved: count('solved')
    };
  }

  async searchTickets(query: string, limit = SEARCH_LIMIT): Promise<readonly Ticket[]> {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) {
      return [];
    }

    const matches = this.visibleTickets()
      .filter(
        (row) =>
          row.subject.toLowerCase().includes(needle) ||
          row.tags.some((tag) => tag.toLowerCase().includes(needle))
      )
      .sort((left, right) => this.compareForPagination(left, right));

    return this.decorate(matches.slice(0, limit));
  }

  async getTicketsByRequester(requesterId: string, excludeTicketId?: string): Promise<readonly Ticket[]> {
    const rows = this.visibleTickets()
      .filter((row) => row.requester_id === requesterId && row.id !== excludeTicketId)
      .sort((left, right) => this.compareForPagination(left, right));

    return this.decorate(rows.slice(0, HISTORY_LIMIT));
  }

  async listAssignableProfiles(): Promise<readonly Profile[]> {
    return HelpdeskMapper.toProfileList(assignableMockProfiles());
  }

  async uploadAttachment(file: File): Promise<Attachment> {
    const owner = this.requireCurrentUser();
    const filePath = HelpdeskMapper.attachmentPath(owner.id, file.name);

    this.uploadedFiles.set(filePath, file);
    return { id: filePath, name: file.name, filePath, size: file.size, mimeType: file.type || '' };
  }

  async getAttachmentUrl(filePath: string): Promise<string> {
    const blob = this.uploadedFiles.get(filePath);
    if (!blob) {
      throw new InvalidAttachmentPathError('This file is not available in the offline showcase.');
    }

    const existing = this.objectUrls.get(filePath);
    if (existing) {
      return existing;
    }
    const url = URL.createObjectURL(blob);
    this.objectUrls.set(filePath, url);
    return url;
  }

  resetLocalData(): void {
    clearStored(MOCK_DATA_KEY);
    for (const url of this.objectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
    this.uploadedFiles.clear();
    this.load();
  }

  // Dataset handling ------------------------------------------------------

  private load(): void {
    const stored = readStoredJson<StoredDataset>(MOCK_DATA_KEY);
    if (stored && stored.schemaVersion === 1) {
      this.tickets = [...stored.tickets];
      this.comments = [...stored.comments];
      this.auditLogs = [...stored.auditLogs];
      return;
    }

    const dataset = buildMockDataset();
    this.tickets = [...dataset.tickets];
    this.comments = [...dataset.comments];
    this.auditLogs = [...dataset.auditLogs];
  }

  private persist(): void {
    writeStoredJson(MOCK_DATA_KEY, {
      schemaVersion: 1,
      tickets: this.tickets,
      comments: this.comments,
      auditLogs: this.auditLogs
    });
  }

  // Rules ------------------------------------------------------------------

  private assertCreationRules(dto: CreateTicketDTO, author: Profile): string[] {
    if (dto.assigneeId) {
      if (author.role === 'customer') {
        throw new CustomerAssignmentForbiddenError();
      }
      this.assertAssignable(dto.assigneeId);
    }
    if (author.role === 'customer' && dto.tags.length > 0) {
      throw new CustomerAssignmentForbiddenError('Tags are set by support, not by the customer.');
    }
    this.assertAttachmentOwnership(HelpdeskMapper.toAttachmentRowList(dto.attachments), author.id);
    return author.role === 'customer' ? [] : [...dto.tags];
  }

  private assertWritable(ticket: TicketRow): void {
    if (ticket.status === 'closed') {
      throw new TicketClosedError();
    }
  }

  private assertAssignable(assigneeId: string): void {
    const profile = findMockProfileById(assigneeId);
    if (!profile || profile.role === 'customer') {
      throw new InvalidAssigneeError();
    }
  }

  private assertAttachmentOwnership(attachments: readonly { file_path: string }[], ownerId: string): void {
    for (const attachment of attachments) {
      if (!attachment.file_path.startsWith(`${ownerId}/`)) {
        throw new InvalidAttachmentPathError();
      }
    }
  }

  // Reads ------------------------------------------------------------------

  private visibleTickets(): TicketRow[] {
    const user = this.authState.currentUser();
    if (!user) {
      return [];
    }
    return this.isAgent() ? [...this.tickets] : this.tickets.filter((row) => row.requester_id === user.id);
  }

  private canReadTicket(ticket: TicketRow): boolean {
    const user = this.authState.currentUser();
    return user !== null && (this.isAgent() || ticket.requester_id === user.id);
  }

  private requireVisibleTicket(id: string): TicketRow {
    const row = this.tickets.find((candidate) => candidate.id === id);
    if (!row || !this.canReadTicket(row)) {
      throw new CommentForbiddenError('This ticket does not exist, or it is not visible to your account.');
    }
    return row;
  }

  private matchesView(row: TicketRow, view: TicketViewId): boolean {
    const user = this.authState.currentUser();
    switch (view) {
      case 'my-tickets':
        return user !== null && row.assignee_id === user.id && UNSOLVED.includes(row.status);
      case 'unassigned':
        return row.assignee_id === null && REOPENABLE.includes(row.status);
      case 'all-unsolved':
        return UNSOLVED.includes(row.status);
      case 'solved':
        return row.status === 'solved';
    }
  }

  private decorate(rows: readonly TicketRow[]): readonly Ticket[] {
    return rows.map((row) => {
      // A requester missing from the directory is usually the person using the
      // app right now, because a development target only lists two identities.
      // Falling back to the signed in profile keeps the row attributed instead of
      // rendering as "Unknown requester".
      const requester = this.profile(row.requester_id) ?? this.currentUserAsProfile(row.requester_id);
      return HelpdeskMapper.toTicket(
        row,
        requester,
        row.assignee_id ? (this.profile(row.assignee_id) ?? null) : null
      );
    });
  }

  private currentUserAsProfile(id: string): ProfileRow | undefined {
    const current = this.authState.currentUser();
    if (!current || current.id !== id) {
      return undefined;
    }
    return {
      id: current.id,
      email: current.email,
      full_name: current.fullName,
      avatar_url: current.avatarUrl,
      role: current.role,
      created_at: current.createdAt,
      updated_at: current.updatedAt
    };
  }

  private profile(id: string): ProfileRow | undefined {
    return findMockProfileById(id) ?? undefined;
  }

  private compareForPagination(left: TicketRow, right: TicketRow): number {
    const byDate = Date.parse(right.created_at) - Date.parse(left.created_at);
    return byDate !== 0 ? byDate : right.id.localeCompare(left.id);
  }

  // Identity ---------------------------------------------------------------

  private isAgent(): boolean {
    const role = this.authState.currentUser()?.role;
    return role === 'agent' || role === 'admin';
  }

  private requireCurrentUser(): Profile {
    const user = this.authState.currentUser();
    if (!user) {
      throw new CommentForbiddenError('Sign in before changing a ticket.');
    }
    return user;
  }

  private newId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private nextTicketNumber(): number {
    return this.tickets.reduce((highest, row) => Math.max(highest, row.ticket_number), 1041) + 1;
  }

  private auditEntry(
    ticket: TicketRow,
    actorId: string,
    at: string,
    previous: TicketRow
  ): TicketAuditLogRow {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const record = (field: string, from: unknown, to: unknown): void => {
      if (from !== to) {
        changes[field] = { from, to };
      }
    };

    record('status', previous.status, ticket.status);
    record('priority', previous.priority, ticket.priority);
    record('type', previous.type, ticket.type);
    record('subject', previous.subject, ticket.subject);
    record('assignee_id', previous.assignee_id, ticket.assignee_id);

    return {
      id: this.newId(),
      ticket_id: ticket.id,
      actor_id: actorId,
      action: 'ticket_updated',
      changes,
      created_at: at
    };
  }
}