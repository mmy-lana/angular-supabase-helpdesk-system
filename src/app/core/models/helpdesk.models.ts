import { IconName, TicketPriority, TicketStatus, TicketType, UserRole } from './database.types';

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly size: number;
  readonly mimeType: string;
}

export interface Profile {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly avatarUrl: string | null;
  readonly role: UserRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Ticket {
  readonly id: string;
  readonly ticketNumber: number;
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly subject: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly type: TicketType;
  readonly tags: readonly string[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly solvedAt: string | null;
  readonly requester?: Profile;
  readonly assignee?: Profile | null;
}

export interface TicketComment {
  readonly id: string;
  readonly ticketId: string;
  readonly authorId: string;
  readonly body: string;
  readonly isInternal: boolean;
  readonly attachments: readonly Attachment[];
  readonly createdAt: string;
  readonly author?: Profile;
}

export interface TicketAuditLog {
  readonly id: string;
  readonly ticketId: string;
  readonly actorId: string;
  readonly action: string;
  readonly changes: Readonly<Record<string, { from: unknown; to: unknown }>>;
  readonly createdAt: string;
  readonly actor?: Profile;
}

export interface WorkspaceTab {
  readonly id: string;
  readonly type: 'ticket' | 'view' | 'new-ticket' | 'search';
  readonly title: string;
  readonly ticketId?: string;
  readonly isDirty: boolean;
  readonly icon: IconName;
}

export interface CreateTicketDTO {
  readonly subject: string;
  readonly body: string;
  readonly priority: TicketPriority;
  readonly type: TicketType;
  readonly tags: readonly string[];
  readonly assigneeId?: string | null;
  readonly attachments?: readonly Attachment[];
}

export interface UpdateTicketDTO {
  readonly subject?: string;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly type?: TicketType;
  readonly assigneeId?: string | null;
  readonly tags?: readonly string[];
  readonly version: number;
}

export interface CreateCommentDTO {
  readonly ticketId: string;
  readonly body: string;
  readonly isInternal: boolean;
  readonly attachments?: readonly Attachment[];
}

export class TicketClosedError extends Error {
  constructor(message = 'Closed tickets cannot be modified or reopened.') {
    super(message);
    this.name = 'TicketClosedError';
  }
}

export class TicketConcurrencyError extends Error {
  constructor(message = 'Ticket could not be updated or access was denied. Refresh and try again.') {
    super(message);
    this.name = 'TicketConcurrencyError';
  }
}

export class InvalidAssigneeError extends Error {
  constructor(message = 'Assignee must have an agent or admin role.') {
    super(message);
    this.name = 'InvalidAssigneeError';
  }
}

export class InvalidAttachmentPathError extends Error {
  constructor(message = 'Invalid attachment path: Access denied.') {
    super(message);
    this.name = 'InvalidAttachmentPathError';
  }
}

export class CustomerAssignmentForbiddenError extends Error {
  constructor(message = 'Customers cannot assign tickets or set tags on creation.') {
    super(message);
    this.name = 'CustomerAssignmentForbiddenError';
  }
}

export class CommentForbiddenError extends Error {
  constructor(message = 'Access denied: You do not have permission to post this comment.') {
    super(message);
    this.name = 'CommentForbiddenError';
  }
}

export const TICKET_VIEW_IDS = ['my-tickets', 'unassigned', 'all-unsolved', 'solved'] as const;
export type TicketViewId = (typeof TICKET_VIEW_IDS)[number];

export function isTicketViewId(value: string): value is TicketViewId {
  return (TICKET_VIEW_IDS as readonly string[]).includes(value);
}

export const TICKET_STATUSES = ['new', 'open', 'pending', 'solved', 'closed'] as const;
export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export function isTicketPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value);
}

export const TICKET_TYPES = ['question', 'incident', 'problem', 'task'] as const;
export function isTicketType(value: string): value is TicketType {
  return (TICKET_TYPES as readonly string[]).includes(value);
}

export const USER_ROLES = ['customer', 'agent', 'admin'] as const;
export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export interface ViewDefinition {
  readonly id: TicketViewId;
  readonly label: string;
  readonly description: string;
  readonly icon: IconName;
}

/** Keyset pagination cursor. List ordering is `created_at DESC, id DESC`. */
export interface TicketCursor {
  readonly createdAt: string;
  readonly id: string;
}

export type TicketSortField = 'ticket_number' | 'subject' | 'status' | 'priority' | 'type' | 'updated_at';
export type SortDirection = 'asc' | 'desc';

export interface TicketSort {
  readonly field: TicketSortField;
  readonly direction: SortDirection;
}

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface AttachableFile {
  readonly file: File;
  readonly previewUrl: string | null;
  readonly state: 'pending' | 'uploaded' | 'failed';
  readonly attachment: Attachment | null;
  readonly error: string | null;
}