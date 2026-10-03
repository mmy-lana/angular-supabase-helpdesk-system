import { describe, expect, it } from 'vitest';
import { HelpdeskMapper } from './helpdesk.mapper';
import { ProfileRow, TicketRow } from '../models/database.types';
import { TicketSort } from '../models/helpdesk.models';

const requester: ProfileRow = {
  id: 'requester-1',
  email: 'customer@example.com',
  full_name: 'Tomas Eriksen',
  avatar_url: null,
  role: 'customer',
  created_at: '2026-01-04T09:00:00.000Z',
  updated_at: '2026-01-04T09:00:00.000Z'
};

const ticket: TicketRow = {
  id: 'ticket-1',
  ticket_number: 41,
  requester_id: 'requester-1',
  assignee_id: null,
  subject: 'Invoice export fails for March',
  status: 'open',
  priority: 'high',
  type: 'incident',
  tags: ['billing', 'export'],
  version: 3,
  created_at: '2026-02-01T10:00:00.000Z',
  updated_at: '2026-02-02T11:30:00.000Z',
  solved_at: null
};

describe('HelpdeskMapper.toTicket', () => {
  it('maps a row into the camelCase domain shape', () => {
    const mapped = HelpdeskMapper.toTicket(ticket);

    expect(mapped.ticketNumber).toBe(41);
    expect(mapped.requesterId).toBe('requester-1');
    expect(mapped.assigneeId).toBeNull();
    expect(mapped.updatedAt).toBe('2026-02-02T11:30:00.000Z');
    expect(mapped.version).toBe(3);
    expect(mapped.tags).toEqual(['billing', 'export']);
  });

  it('attaches the related profiles only when rows are supplied', () => {
    const withoutRelations = HelpdeskMapper.toTicket(ticket);
    expect(withoutRelations.requester).toBeUndefined();
    expect(withoutRelations.assignee).toBeNull();

    const withRequester = HelpdeskMapper.toTicket(ticket, requester);
    expect(withRequester.requester?.fullName).toBe('Tomas Eriksen');
    expect(withRequester.requester?.role).toBe('customer');
  });

  it('does not let callers mutate the tag list of a mapped ticket', () => {
    const mapped = HelpdeskMapper.toTicket(ticket);
    expect(Object.isFrozen(mapped.tags)).toBe(true);
  });
});

describe('HelpdeskMapper attachment paths', () => {
  it('round trips an attachment through its row representation', () => {
    const attachment = { id: 'a1', name: 'invoice.pdf', filePath: 'user-1/invoice.pdf', size: 2048, mimeType: 'application/pdf' };

    expect(HelpdeskMapper.toAttachment(HelpdeskMapper.toAttachmentRow(attachment))).toEqual(attachment);
  });

  it('builds an empty list for missing attachments', () => {
    expect(HelpdeskMapper.toAttachmentRowList()).toEqual([]);
    expect(HelpdeskMapper.toAttachmentRowList([])).toEqual([]);
    expect(HelpdeskMapper.toAttachmentList(undefined)).toEqual([]);
  });

  it('stores every upload under the owning user folder', () => {
    expect(HelpdeskMapper.attachmentPath('user-1', 'Q1 statement (final).pdf')).toBe('user-1/Q1-statement-final-.pdf');
    expect(HelpdeskMapper.attachmentPath('user-1', '../../etc/passwd')).toBe('user-1/passwd');
    expect(HelpdeskMapper.sanitizeFileName('***')).toBe('attachment');
  });
});

describe('HelpdeskMapper.sortTickets', () => {
  const second: TicketRow = { ...ticket, id: 'ticket-2', ticket_number: 42, subject: 'Cannot reset password', priority: 'urgent', status: 'new' };

  it('orders by ticket number and flips direction', () => {
    const ascending = HelpdeskMapper.sortTickets(
      [HelpdeskMapper.toTicket(second), HelpdeskMapper.toTicket(ticket)],
      { field: 'ticket_number', direction: 'asc' }
    );
    expect(ascending.map((item) => item.ticketNumber)).toEqual([41, 42]);

    const descending = HelpdeskMapper.sortTickets(ascending, { field: 'ticket_number', direction: 'desc' });
    expect(descending.map((item) => item.ticketNumber)).toEqual([42, 41]);
  });

  it('ranks priorities with urgent first', () => {
    const byPriority = HelpdeskMapper.sortTickets(
      [HelpdeskMapper.toTicket(ticket), HelpdeskMapper.toTicket(second)],
      { field: 'priority', direction: 'asc' }
    );
    expect(byPriority.map((item) => item.priority)).toEqual(['urgent', 'high']);
  });

  it('toggles direction when the same field is sorted again', () => {
    const first: TicketSort = { field: 'subject', direction: 'asc' };
    expect(HelpdeskMapper.nextSort(first, 'subject').direction).toBe('desc');
    expect(HelpdeskMapper.nextSort({ field: 'subject', direction: 'desc' }, 'subject').direction).toBe('asc');
    expect(HelpdeskMapper.nextSort(first, 'status')).toEqual({ field: 'status', direction: 'asc' });
  });
});