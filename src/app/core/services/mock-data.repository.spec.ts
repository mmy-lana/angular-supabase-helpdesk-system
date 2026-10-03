import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { writeStoredJson, clearStored } from '../../shared/utils/browser-storage';
import { AuthStateService } from './auth-state.service';
import { DataRepository } from './data-repository.interface';
import { MOCK_DATA_KEY, MOCK_PROFILE_IDS, MOCK_SESSION_KEY } from './mock-fixtures';
import { MockDataRepository } from './mock-data.repository';
import { TicketRealtimeService } from './ticket-realtime.service';
import { Attachment, Ticket } from '../models/helpdesk.models';

describe('MockDataRepository', () => {
  let repository: MockDataRepository;

  beforeEach(() => {
    clearStored(MOCK_DATA_KEY);
    clearStored(MOCK_SESSION_KEY);
    TestBed.configureTestingModule({
      providers: [{ provide: DataRepository, useClass: MockDataRepository }]
    });
    repository = TestBed.inject(DataRepository) as MockDataRepository;
  });

  describe('as an agent', () => {
    beforeEach(async () => {
      writeStoredJson(MOCK_SESSION_KEY, 'agent@example.com');
      const authState = TestBed.inject(AuthStateService);
      await authState.ensureInitialized();
      repository = TestBed.inject(DataRepository) as MockDataRepository;
    });

    it('sees the whole workspace, internal notes included', async () => {
      const allUnsolved = await repository.getTicketsByView('all-unsolved');
      const withNote = allUnsolved.find((ticket) => ticket.subject.includes('4 MB'));
      expect(withNote).toBeDefined();

      const comments = await repository.getComments(withNote!.id);
      expect(comments.some((comment) => comment.isInternal)).toBe(true);
    });

    it('rejects a stale version with a concurrency error', async () => {
      const [ticket] = await repository.getTicketsByView('all-unsolved');
      await repository.updateTicket(ticket.id, { priority: 'urgent', version: ticket.version });

      await expect(repository.updateTicket(ticket.id, { priority: 'low', version: ticket.version })).rejects.toThrow(
        /could not be updated or access was denied/i
      );
    });

    it('increments the version once per accepted change', async () => {
      const [ticket] = await repository.getTicketsByView('all-unsolved');
      const updated = await repository.updateTicket(ticket.id, { status: 'pending', version: ticket.version });

      expect(updated.version).toBe(ticket.version + 1);
      expect(updated.status).toBe('pending');
    });

    it('refuses to assign a ticket to somebody without an agent role', async () => {
      const [ticket] = await repository.getTicketsByView('all-unsolved');

      await expect(
        repository.updateTicket(ticket.id, { assigneeId: MOCK_PROFILE_IDS.customer, version: ticket.version })
      ).rejects.toThrow(/agent or admin/i);
    });

    it('claims an unassigned ticket and refuses a second claim', async () => {
      const [ticket] = await repository.getTicketsByView('unassigned');
      const claimed = await repository.claimTicket(ticket.id, MOCK_PROFILE_IDS.agent, ticket.version);

      expect(claimed.assigneeId).toBe(MOCK_PROFILE_IDS.agent);
      await expect(repository.claimTicket(ticket.id, MOCK_PROFILE_IDS.agent, claimed.version)).rejects.toThrow(
        /claimed this ticket/i
      );
    });

    it('publishes what it wrote to the realtime bridge', async () => {
      const realtime = TestBed.inject(TicketRealtimeService);
      const ticket = await repository.createTicket({
        subject: 'Realtime round trip',
        body: 'Checking that the bridge sees local writes.',
        priority: 'normal',
        type: 'question',
        tags: []
      });

      const published = realtime.ticketEvents().at(-1);
      expect(published?.ticket.id).toBe(ticket.id);
      expect(published?.origin).toBe('local');
    });
  });

  describe('as a customer', () => {
    beforeEach(async () => {
      writeStoredJson(MOCK_SESSION_KEY, 'customer@example.com');
      const authState = TestBed.inject(AuthStateService);
      await authState.ensureInitialized();
      repository = TestBed.inject(DataRepository) as MockDataRepository;
    });

    it('only sees tickets they raised', async () => {
      const visible = await repository.getTicketsByView('all-unsolved');
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.every((ticket) => ticket.requesterId === MOCK_PROFILE_IDS.customer)).toBe(true);
    });

    it('never receives internal notes', async () => {
      const visible = await repository.getTicketsByView('all-unsolved');
      for (const ticket of visible) {
        const comments = await repository.getComments(ticket.id);
        expect(comments.every((comment) => !comment.isInternal)).toBe(true);
      }
    });

    it('cannot assign or tag a ticket at creation', async () => {
      const base = {
        subject: 'Please help with an export',
        body: 'The export produces nothing at all.',
        priority: 'normal',
        type: 'question'
      } as const;

      await expect(
        repository.createTicket({ ...base, tags: [], assigneeId: MOCK_PROFILE_IDS.agent })
      ).rejects.toThrow(/cannot assign/i);

      await expect(repository.createTicket({ ...base, tags: ['billing'] })).rejects.toThrow(
        /set by support/i
      );
    });

    it('reopens a solved ticket when they reply', async () => {
      const [solved] = await repository.searchTickets('Password reset');
      expect(solved.status).toBe('solved');

      await repository.addComment({ ticketId: solved.id, body: 'It is happening again.', isInternal: false });

      const reopened = await repository.getTicketById(solved.id);
      expect(reopened.status).toBe('open');
      expect(reopened.version).toBe(solved.version + 1);
    });

    it('leaves the version alone when they comment on an open ticket', async () => {
      const [ticket] = await repository.getTicketsByView('all-unsolved');
      await repository.addComment({ ticketId: ticket.id, body: 'Any update on this one?', isInternal: false });

      const after = await repository.getTicketById(ticket.id);
      expect(after.version).toBe(ticket.version);
      expect(Date.parse(after.updatedAt)).toBeGreaterThanOrEqual(Date.parse(ticket.createdAt));
    });

    it('cannot post an internal note', async () => {
      const [ticket] = await repository.getTicketsByView('all-unsolved');

      await expect(
        repository.addComment({ ticketId: ticket.id, body: 'Secret', isInternal: true })
      ).rejects.toThrow(/agents/i);
    });

    it('cannot change ticket properties', async () => {
      const [ticket] = await repository.getTicketsByView('all-unsolved');

      await expect(repository.updateTicket(ticket.id, { priority: 'urgent', version: ticket.version })).rejects.toThrow(
        /only agents/i
      );
    });
  });

  describe('closed tickets', () => {
    beforeEach(async () => {
      writeStoredJson(MOCK_SESSION_KEY, 'agent@example.com');
      const authState = TestBed.inject(AuthStateService);
      await authState.ensureInitialized();
      repository = TestBed.inject(DataRepository) as MockDataRepository;
    });

    it('are terminal for updates, claims and comments', async () => {
      const closed = (await repository.searchTickets('Audit log retention'))[0];
      expect(closed.status).toBe('closed');

      await expect(
        repository.updateTicket(closed.id, { status: 'open', version: closed.version })
      ).rejects.toThrow(/closed tickets cannot be modified/i);

      await expect(repository.claimTicket(closed.id, MOCK_PROFILE_IDS.agent, closed.version)).rejects.toThrow(
        /closed tickets cannot be modified/i
      );

      await expect(
        repository.addComment({ ticketId: closed.id, body: 'Reopening this', isInternal: false })
      ).rejects.toThrow(/closed/i);
    });
  });

  describe('keyset pagination', () => {
    beforeEach(async () => {
      writeStoredJson(MOCK_SESSION_KEY, 'agent@example.com');
      const authState = TestBed.inject(AuthStateService);
      await authState.ensureInitialized();
      repository = TestBed.inject(DataRepository) as MockDataRepository;
    });

    it('never returns a ticket twice across pages', async () => {
      const firstPage = await repository.getTicketsByView('all-unsolved');
      const last = firstPage.at(-1)!;

      const secondPage = await repository.getTicketsByView('all-unsolved', {
        createdAt: last.createdAt,
        id: last.id
      });

      const firstIds = new Set(firstPage.map((ticket: Ticket) => ticket.id));
      expect(secondPage.every((ticket) => !firstIds.has(ticket.id))).toBe(true);
    });
  });
});

describe('MockDataRepository attachment rules', () => {
  let repository: MockDataRepository;

  beforeEach(async () => {
    clearStored(MOCK_DATA_KEY);
    writeStoredJson(MOCK_SESSION_KEY, 'agent@example.com');
    TestBed.configureTestingModule({
      providers: [{ provide: DataRepository, useClass: MockDataRepository }]
    });
    const authState = TestBed.inject(AuthStateService);
    await authState.ensureInitialized();
    repository = TestBed.inject(DataRepository) as MockDataRepository;
  });

  it('stores uploads in the author folder and serves them back', async () => {
    const file = new File(['invoice contents'], 'invoice.pdf', { type: 'application/pdf' });
    const attachment = await repository.uploadAttachment(file);

    expect(attachment.filePath).toBe(`${MOCK_PROFILE_IDS.agent}/invoice.pdf`);

    const url = await repository.getAttachmentUrl(attachment.filePath);
    expect(url.startsWith('blob:')).toBe(true);
  });

  it('refuses an attachment path that belongs to somebody else', async () => {
    const forged: Attachment = {
      id: 'forged',
      name: 'invoice.pdf',
      filePath: `${MOCK_PROFILE_IDS.customer}/invoice.pdf`,
      size: 10,
      mimeType: 'application/pdf'
    };

    await expect(
      repository.addComment({
        ticketId: (await repository.getTicketsByView('all-unsolved'))[0].id,
        body: 'Look at this',
        isInternal: false,
        attachments: [forged]
      })
    ).rejects.toThrow(/access denied/i);
  });
});