import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { TicketStatus } from '../models/database.types';
import {
  Attachment,
  CreateCommentDTO,
  CreateTicketDTO,
  LoadState,
  Profile,
  Ticket,
  TicketComment,
  TicketConcurrencyError,
  TicketCursor,
  TicketSort,
  TicketSortField,
  TicketViewId,
  ViewDefinition
} from '../models/helpdesk.models';
import { HelpdeskMapper } from '../mappers/helpdesk.mapper';
import { AuthStateService } from './auth-state.service';
import { DataRepository, TICKET_PAGE_SIZE } from './data-repository.interface';
import { NotificationService } from './notification.service';
import { CommentChangeEvent, TicketChangeEvent, TicketRealtimeService } from './ticket-realtime.service';

export interface ViewListState {
  /** Ids only: the ticket itself always comes from the shared record map. */
  readonly ticketIds: readonly string[];
  readonly state: LoadState;
  readonly error: string | null;
  readonly cursor: TicketCursor | null;
  readonly hasMore: boolean;
  readonly sort: TicketSort;
  readonly loaded: boolean;
}

export interface TicketDetailState {
  readonly ticket: Ticket | null;
  readonly comments: readonly TicketComment[];
  readonly state: LoadState;
  readonly error: string | null;
  readonly posting: boolean;
  readonly uploading: boolean;
}

export interface SearchState {
  readonly query: string;
  readonly results: readonly Ticket[];
  readonly state: LoadState;
}

export interface RequesterHistoryState {
  readonly requesterId: string | null;
  readonly tickets: readonly Ticket[];
  readonly state: LoadState;
}

export interface TicketPropertyPatch {
  readonly subject?: string;
  readonly status?: TicketStatus;
  readonly priority?: Ticket['priority'];
  readonly type?: Ticket['type'];
  readonly assigneeId?: string | null;
  readonly tags?: readonly string[];
}

export const TICKET_VIEWS: readonly ViewDefinition[] = Object.freeze([
  {
    id: 'my-tickets',
    label: 'Your unsolved tickets',
    description: 'Assigned to you and still open',
    icon: 'user'
  },
  {
    id: 'unassigned',
    label: 'Unassigned tickets',
    description: 'Waiting for an agent to pick them up',
    icon: 'customers'
  },
  {
    id: 'all-unsolved',
    label: 'All unsolved tickets',
    description: 'Everything still open across the workspace',
    icon: 'ticket'
  },
  {
    id: 'solved',
    label: 'Recently solved tickets',
    description: 'Resolved, newest first',
    icon: 'check'
  }
]);

const DEFAULT_SORT: TicketSort = { field: 'updated_at', direction: 'desc' };

function emptyViewList(): ViewListState {
  return {
    ticketIds: [],
    state: 'idle',
    error: null,
    cursor: null,
    hasMore: false,
    sort: DEFAULT_SORT,
    loaded: false
  };
}

function emptyViews(): Record<TicketViewId, ViewListState> {
  return {
    'my-tickets': emptyViewList(),
    unassigned: emptyViewList(),
    'all-unsolved': emptyViewList(),
    solved: emptyViewList()
  };
}

function describe(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/**
 * Reactive state for everything ticket shaped.
 *
 * One record map holds every ticket that has been loaded; saved views, the open
 * ticket and search results are all derived from it. A change arriving over
 * realtime therefore lands in every list at once, which is what keeps the view
 * counters honest when a colleague answers a ticket.
 *
 * Components call intent methods (`updateProperty`, `postComment`, `claimTicket`)
 * and read signals. None of them touches a repository directly.
 */
@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly repository = inject(DataRepository);
  private readonly authState = inject(AuthStateService);
  private readonly notifications = inject(NotificationService);
  private readonly realtime = inject(TicketRealtimeService);

  private readonly records = signal<ReadonlyMap<string, Ticket>>(new Map());
  private readonly views = signal<Record<TicketViewId, ViewListState>>(emptyViews());
  private readonly counts = signal<Readonly<Record<TicketViewId, number>>>({
    'my-tickets': 0,
    unassigned: 0,
    'all-unsolved': 0,
    solved: 0
  });

  private readonly activeViewId = signal<TicketViewId>('my-tickets');
  private readonly detail = signal<TicketDetailState>({
    ticket: null,
    comments: [],
    state: 'idle',
    error: null,
    posting: false,
    uploading: false
  });
  private readonly searchSignal = signal<SearchState>({ query: '', results: [], state: 'idle' });
  private readonly assignableProfiles = signal<readonly Profile[]>([]);
  private readonly requesterHistory = signal<RequesterHistoryState>({
    requesterId: null,
    tickets: [],
    state: 'idle'
  });

  private readonly handledTicketEvents = new Set<string>();
  private readonly handledCommentEvents = new Set<string>();

  readonly viewDefinitions = TICKET_VIEWS;
  readonly activeView = this.activeViewId.asReadonly();
  readonly viewLists = this.views.asReadonly();
  readonly viewCounts = this.counts.asReadonly();
  readonly detailState = this.detail.asReadonly();
  readonly searchState = this.searchSignal.asReadonly();
  readonly agents = this.assignableProfiles.asReadonly();
  readonly history = this.requesterHistory.asReadonly();

  readonly currentUser = this.authState.currentUser;
  readonly canUseInternalNotes = this.authState.canUseInternalNotes;

  /** Tickets of the active view, filtered against the view rule and sorted for the table. */
  readonly activeTickets = computed(() => {
    const view = this.views()[this.activeViewId()];
    const records = this.records();
    const tickets = view.ticketIds
      .map((id) => records.get(id))
      .filter((ticket): ticket is Ticket => ticket !== undefined)
      .filter((ticket) => this.belongsToView(ticket, this.activeViewId()));

    return HelpdeskMapper.sortTickets(tickets, view.sort);
  });

  readonly activeListState = computed<LoadState>(() => this.views()[this.activeViewId()].state);
  readonly activeListError = computed(() => this.views()[this.activeViewId()].error);
  readonly hasMore = computed(() => this.views()[this.activeViewId()].hasMore);
  readonly activeSort = computed(() => this.views()[this.activeViewId()].sort);

  constructor() {
    effect(() => this.mergeRealtimeTickets(this.realtime.ticketEvents()));
    effect(() => this.mergeRealtimeComments(this.realtime.commentEvents()));
  }

  // Saved views -------------------------------------------------------------

  async selectView(view: TicketViewId): Promise<void> {
    this.activeViewId.set(view);
    if (!this.views()[view].loaded) {
      await this.loadView(view, 'replace');
    }
  }

  async refresh(): Promise<void> {
    await Promise.all([this.loadView(this.activeViewId(), 'replace'), this.refreshCounts()]);
  }

  async loadMore(): Promise<void> {
    const view = this.activeViewId();
    const state = this.views()[view];
    if (!state.hasMore || state.state === 'loading') {
      return;
    }
    await this.loadView(view, 'append');
  }

  /** The same column flips direction; a new column starts ascending. */
  toggleSort(field: TicketSortField): void {
    const view = this.activeViewId();
    this.views.update((current) => ({
      ...current,
      [view]: { ...current[view], sort: HelpdeskMapper.nextSort(current[view].sort, field) }
    }));
  }

  async refreshCounts(): Promise<void> {
    try {
      this.counts.set(await this.repository.getViewCounts());
    } catch (failure) {
      this.notifications.warning('Ticket counts are out of date', describe(failure));
    }
  }

  // Ticket detail -----------------------------------------------------------

  async openTicket(ticketId: string): Promise<void> {
    const known = this.records().get(ticketId) ?? null;
    this.detail.set({
      ticket: known,
      comments: [],
      state: 'loading',
      error: null,
      posting: false,
      uploading: false
    });
    this.realtime.watchTicket(ticketId);

    try {
      const [ticket, comments] = await Promise.all([
        this.repository.getTicketById(ticketId),
        this.repository.getComments(ticketId)
      ]);
      this.store(ticket);
      this.detail.set({ ticket, comments, state: 'ready', error: null, posting: false, uploading: false });
    } catch (failure) {
      this.detail.set({
        ticket: known,
        comments: [],
        state: 'error',
        error: describe(failure),
        posting: false,
        uploading: false
      });
    }
  }

  /** Called when a ticket tab closes so its comment channel can be released. */
  releaseTicket(ticketId: string): void {
    this.realtime.unwatchTicket(ticketId);
    if (this.detail().ticket?.id === ticketId) {
      this.detail.set({
        ticket: null,
        comments: [],
        state: 'idle',
        error: null,
        posting: false,
        uploading: false
      });
    }
  }

  async reloadTicket(): Promise<void> {
    const ticketId = this.detail().ticket?.id;
    if (ticketId) {
      await this.openTicket(ticketId);
    }
  }

  // Writes ------------------------------------------------------------------

  async createTicket(dto: CreateTicketDTO): Promise<Ticket | null> {
    try {
      const ticket = await this.repository.createTicket(dto);
      this.store(ticket);
      await this.refreshCounts();
      this.notifications.success('Ticket created', `#${ticket.ticketNumber} is in the queue.`);
      return ticket;
    } catch (failure) {
      this.notifications.error('The ticket was not created', describe(failure));
      return null;
    }
  }

  /**
   * Property write with optimistic concurrency. The version the change is based
   * on travels with the request; if the row moved on, the ticket is reloaded
   * instead of overwriting somebody else's decision.
   */
  async updateProperty(ticketId: string, patch: TicketPropertyPatch): Promise<boolean> {
    const current = this.records().get(ticketId) ?? this.detail().ticket;
    if (!current || current.id !== ticketId) {
      return false;
    }

    const version = current.version;
    this.applyOptimistic(current, patch);

    try {
      const updated = await this.repository.updateTicket(ticketId, { ...patch, version });
      this.store(updated);
      await this.refreshCounts();
      return true;
    } catch (failure) {
      this.store(current);
      if (failure instanceof TicketConcurrencyError) {
        this.notifications.warning(
          'Somebody changed this ticket first',
          'The latest version is loaded again. Apply your change once more if it still makes sense.'
        );
        await this.openTicket(ticketId);
        return false;
      }
      this.notifications.error('The ticket was not updated', describe(failure));
      return false;
    }
  }

  async claimTicket(ticketId: string): Promise<boolean> {
    const user = this.authState.currentUser();
    const current = this.records().get(ticketId) ?? this.detail().ticket;
    if (!user || !current || current.assigneeId !== null) {
      return false;
    }

    try {
      const claimed = await this.repository.claimTicket(ticketId, user.id, current.version);
      this.store(claimed);
      await this.refreshCounts();
      this.notifications.success('Ticket assigned to you');
      return true;
    } catch (failure) {
      this.notifications.error('The ticket was not assigned', describe(failure));
      return false;
    }
  }

  async postComment(dto: CreateCommentDTO): Promise<boolean> {
    this.detail.update((state) => ({ ...state, posting: true }));
    try {
      await this.repository.addComment(dto);
      this.detail.update((state) => ({ ...state, posting: false }));
      // The new message arrives through the realtime bridge. Only the ticket
      // header has to be re-read, because a customer reply can reopen it.
      await this.refreshTicket(dto.ticketId);
      await this.refreshCounts();
      return true;
    } catch (failure) {
      this.detail.update((state) => ({ ...state, posting: false }));
      this.notifications.error('Your reply was not sent', describe(failure));
      return false;
    }
  }

  // Search and reference data ----------------------------------------------

  async search(query: string): Promise<void> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      this.searchSignal.set({ query: trimmed, results: [], state: 'idle' });
      return;
    }

    this.searchSignal.set({ query: trimmed, results: [], state: 'loading' });
    try {
      const results = await this.repository.searchTickets(trimmed);
      results.forEach((ticket) => this.store(ticket));
      this.searchSignal.set({ query: trimmed, results, state: 'ready' });
    } catch {
      this.searchSignal.set({ query: trimmed, results: [], state: 'error' });
    }
  }

  clearSearch(): void {
    this.searchSignal.set({ query: '', results: [], state: 'idle' });
  }

  async loadAssignableProfiles(): Promise<void> {
    if (this.assignableProfiles().length > 0) {
      return;
    }
    try {
      this.assignableProfiles.set(await this.repository.listAssignableProfiles());
    } catch (failure) {
      this.notifications.error('Agents could not be loaded', describe(failure));
    }
  }

  async loadRequesterHistory(requesterId: string, excludeTicketId?: string): Promise<void> {
    this.requesterHistory.set({ requesterId, tickets: [], state: 'loading' });
    try {
      const tickets = await this.repository.getTicketsByRequester(requesterId, excludeTicketId);
      tickets.forEach((ticket) => this.store(ticket));
      this.requesterHistory.set({ requesterId, tickets, state: 'ready' });
    } catch {
      this.requesterHistory.set({ requesterId, tickets: [], state: 'error' });
    }
  }

  async attachmentUrl(filePath: string): Promise<string | null> {
    try {
      return await this.repository.getAttachmentUrl(filePath);
    } catch (failure) {
      this.notifications.warning('Attachment unavailable', describe(failure));
      return null;
    }
  }

  async uploadFile(file: File): Promise<Attachment | null> {
    this.detail.update((state) => ({ ...state, uploading: true }));
    try {
      const attachment = await this.repository.uploadAttachment(file);
      this.detail.update((state) => ({ ...state, uploading: false }));
      return attachment;
    } catch (failure) {
      this.detail.update((state) => ({ ...state, uploading: false }));
      this.notifications.error('The file could not be attached', describe(failure));
      return null;
    }
  }

  // Internals ---------------------------------------------------------------

  private async loadView(view: TicketViewId, mode: 'replace' | 'append'): Promise<void> {
    const cursor = mode === 'append' ? (this.views()[view].cursor ?? undefined) : undefined;
    this.views.update((current) => ({
      ...current,
      [view]: { ...current[view], state: 'loading', error: null, ticketIds: mode === 'replace' ? [] : current[view].ticketIds }
    }));

    try {
      const page = await this.repository.getTicketsByView(view, cursor);
      page.forEach((ticket) => this.store(ticket));

      const last = page.at(-1);
      const ids = page.map((ticket) => ticket.id);
      this.views.update((current) => ({
        ...current,
        [view]: {
          ...current[view],
          state: 'ready',
          error: null,
          loaded: true,
          ticketIds: mode === 'replace' ? ids : [...current[view].ticketIds, ...ids],
          cursor: page.length === TICKET_PAGE_SIZE && last ? { createdAt: last.createdAt, id: last.id } : null,
          hasMore: page.length === TICKET_PAGE_SIZE
        }
      }));
      await this.refreshCounts();
    } catch (failure) {
      this.views.update((current) => ({
        ...current,
        [view]: { ...current[view], state: 'error', error: describe(failure), loaded: true }
      }));
    }
  }

  private async refreshTicket(ticketId: string): Promise<void> {
    if (this.detail().ticket?.id !== ticketId) {
      return;
    }
    try {
      const ticket = await this.repository.getTicketById(ticketId);
      this.store(ticket);
      this.detail.update((state) => ({ ...state, ticket }));
    } catch {
      // A failed header refresh leaves the conversation readable; the next
      // realtime event or manual reload brings the header back.
    }
  }

  private store(ticket: Ticket): void {
    this.records.update((records) => {
      const next = new Map(records);
      next.set(ticket.id, ticket);
      return next;
    });
  }

  private applyOptimistic(ticket: Ticket, patch: TicketPropertyPatch): void {
    const assigneeId = patch.assigneeId === undefined ? ticket.assigneeId : patch.assigneeId;
    const assignee =
      patch.assigneeId === undefined
        ? ticket.assignee
        : (this.assignableProfiles().find((profile) => profile.id === assigneeId) ?? null);

    this.store({
      ...ticket,
      subject: patch.subject ?? ticket.subject,
      status: patch.status ?? ticket.status,
      priority: patch.priority ?? ticket.priority,
      type: patch.type ?? ticket.type,
      assigneeId,
      assignee,
      tags: patch.tags === undefined ? ticket.tags : Object.freeze([...patch.tags])
    });
  }

  private belongsToView(ticket: Ticket, view: TicketViewId): boolean {
    const userId = this.authState.currentUser()?.id ?? null;
    const unsolved = ticket.status === 'new' || ticket.status === 'open' || ticket.status === 'pending';

    switch (view) {
      case 'my-tickets':
        return userId !== null && ticket.assigneeId === userId && unsolved;
      case 'unassigned':
        return ticket.assigneeId === null && (ticket.status === 'new' || ticket.status === 'open');
      case 'all-unsolved':
        return unsolved;
      case 'solved':
        return ticket.status === 'solved';
    }
  }

  private mergeRealtimeTickets(events: readonly TicketChangeEvent[]): void {
    const fresh = this.takeUnseen(
      events,
      this.handledTicketEvents,
      (change) => `${change.ticket.id}:${change.ticket.version}:${change.origin}:${change.at}`
    );
    if (fresh.length === 0) {
      return;
    }

    for (const event of fresh) {
      const known = this.records().get(event.ticket.id);
      if (!known || event.ticket.version >= known.version) {
        this.store(event.ticket);
      }
    }

    if (fresh.some((event) => event.origin === 'remote')) {
      void this.refreshCounts();
    }
  }

  private mergeRealtimeComments(events: readonly CommentChangeEvent[]): void {
    const fresh = this.takeUnseen(
      events,
      this.handledCommentEvents,
      (change) => `${change.comment.id}:${change.origin}:${change.at}`
    );
    if (fresh.length === 0) {
      return;
    }

    const openTicketId = this.detail().ticket?.id;
    if (!openTicketId) {
      return;
    }

    const additions = fresh
      .map((event) => event.comment)
      .filter((comment) => comment.ticketId === openTicketId)
      .filter((comment) => !this.detail().comments.some((existing) => existing.id === comment.id));

    if (additions.length === 0) {
      return;
    }

    this.detail.update((state) => ({
      ...state,
      comments: [...state.comments, ...additions].sort(
        (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
      )
    }));
  }

  /** Keeps realtime events from being applied twice when a signal re-emits. */
  private takeUnseen<T>(events: readonly T[], seen: Set<string>, keyOf: (item: T) => string): T[] {
    const unseen = events.filter((item) => {
      const id = keyOf(item);
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });

    if (seen.size > 400) {
      for (const id of seen) {
        seen.delete(id);
        if (seen.size <= 200) {
          break;
        }
      }
    }
    return unseen;
  }
}