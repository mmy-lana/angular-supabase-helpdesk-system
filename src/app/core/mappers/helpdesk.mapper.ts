import {
  AttachmentRow,
  ProfileRow,
  TicketAuditLogRow,
  TicketCommentRow,
  TicketPriority,
  TicketRow,
  TicketStatus
} from '../models/database.types';
import {
  Attachment,
  Profile,
  SortDirection,
  Ticket,
  TicketAuditLog,
  TicketComment,
  TicketSort,
  TicketSortField
} from '../models/helpdesk.models';

const STATUS_RANK: Readonly<Record<TicketStatus, number>> = {
  new: 0,
  open: 1,
  pending: 2,
  solved: 3,
  closed: 4
};

const PRIORITY_RANK: Readonly<Record<TicketPriority, number>> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
};

export class HelpdeskMapper {
  static toProfile(row: ProfileRow): Profile {
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  static toProfileList(rows: readonly ProfileRow[]): readonly Profile[] {
    return Object.freeze(rows.map((row) => this.toProfile(row)));
  }

  static toAttachment(row: AttachmentRow): Attachment {
    return {
      id: row.id,
      name: row.name,
      filePath: row.file_path,
      size: row.size,
      mimeType: row.mime_type
    };
  }

  static toAttachmentRow(att: Attachment): AttachmentRow {
    return {
      id: att.id,
      name: att.name,
      file_path: att.filePath,
      size: att.size,
      mime_type: att.mimeType
    };
  }

  static toAttachmentRowList(attachments?: readonly Attachment[]): AttachmentRow[] {
    if (!attachments || attachments.length === 0) {
      return [];
    }
    return attachments.map((att) => this.toAttachmentRow(att));
  }

  static toAttachmentList(rows?: readonly AttachmentRow[]): readonly Attachment[] {
    return Object.freeze((rows ?? []).map((row) => this.toAttachment(row)));
  }

  static toTicket(row: TicketRow, requesterRow?: ProfileRow, assigneeRow?: ProfileRow | null): Ticket {
    return {
      id: row.id,
      ticketNumber: row.ticket_number,
      requesterId: row.requester_id,
      assigneeId: row.assignee_id,
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      type: row.type,
      tags: Object.freeze([...(row.tags ?? [])]),
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      solvedAt: row.solved_at,
      requester: requesterRow ? this.toProfile(requesterRow) : undefined,
      assignee: assigneeRow ? this.toProfile(assigneeRow) : null
    };
  }

  static toTicketComment(row: TicketCommentRow, authorRow?: ProfileRow): TicketComment {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      authorId: row.author_id,
      body: row.body,
      isInternal: row.is_internal,
      attachments: this.toAttachmentList(row.attachments),
      createdAt: row.created_at,
      author: authorRow ? this.toProfile(authorRow) : undefined
    };
  }

  static toAuditLog(row: TicketAuditLogRow, actorRow?: ProfileRow): TicketAuditLog {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      actorId: row.actor_id,
      action: row.action,
      changes: Object.freeze({ ...row.changes }),
      createdAt: row.created_at,
      actor: actorRow ? this.toProfile(actorRow) : undefined
    };
  }

  /**
   * Row payload for `ticket_comments` inserts, and the shape the
   * `attachments` JSONB column expects.
   */
  static toCreateCommentRow(ticketId: string, authorId: string, dto: {
    readonly body: string;
    readonly isInternal: boolean;
    readonly attachments?: readonly Attachment[];
  }): {
    ticket_id: string;
    author_id: string;
    body: string;
    is_internal: boolean;
    attachments: AttachmentRow[];
  } {
    return {
      ticket_id: ticketId,
      author_id: authorId,
      body: dto.body,
      is_internal: dto.isInternal,
      attachments: this.toAttachmentRowList(dto.attachments)
    };
  }

  /**
   * Storage object path for an uploaded attachment. Every author owns exactly one
   * folder, and the `handle_comment_before_insert` trigger rejects any comment
   * referencing a path outside `<author uuid>/`.
   */
  static attachmentPath(userId: string, fileName: string): string {
    return `${userId}/${this.sanitizeFileName(fileName)}`;
  }

  static sanitizeFileName(fileName: string): string {
    const leaf = fileName.trim().split(/[\\/]/).filter(Boolean).pop() ?? '';
    const cleaned = leaf
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/\.{2,}/g, '.')
      .replace(/^[-.]+/, '')
      .replace(/-+$/, '');
    return cleaned.length > 0 ? cleaned.slice(0, 120) : 'attachment';
  }

  static nextSort(current: TicketSort, field: TicketSortField): TicketSort {
    const direction: SortDirection = current.field === field && current.direction === 'asc' ? 'desc' : 'asc';
    return { field, direction };
  }

  static sortTickets(tickets: readonly Ticket[], sort: TicketSort): readonly Ticket[] {
    const factor = sort.direction === 'asc' ? 1 : -1;
    return Object.freeze(
      [...tickets].sort((left, right) => {
        const comparison = this.compareBy(left, right, sort.field);
        return comparison === 0 ? left.ticketNumber - right.ticketNumber : comparison * factor;
      })
    );
  }

  private static compareBy(left: Ticket, right: Ticket, field: TicketSortField): number {
    switch (field) {
      case 'ticket_number':
        return left.ticketNumber - right.ticketNumber;
      case 'subject':
        return left.subject.localeCompare(right.subject);
      case 'status':
        return STATUS_RANK[left.status] - STATUS_RANK[right.status];
      case 'priority':
        return PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      case 'type':
        return left.type.localeCompare(right.type);
      case 'updated_at':
        return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
    }
  }
}