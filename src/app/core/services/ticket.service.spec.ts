import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearStored, writeStoredJson } from '../../shared/utils/browser-storage';
import { AuthStateService } from './auth-state.service';
import { DataRepository } from './data-repository.interface';
import { MOCK_DATA_KEY, MOCK_SESSION_KEY } from './mock-fixtures';
import { MockDataRepository } from './mock-data.repository';

import { TicketService } from './ticket.service';

describe('TicketService property writes', () => {
  let repository: MockDataRepository;
  let tickets: TicketService;

  beforeEach(async () => {
    clearStored(MOCK_DATA_KEY);
    writeStoredJson(MOCK_SESSION_KEY, 'agent@example.com');

    TestBed.configureTestingModule({
      providers: [{ provide: DataRepository, useClass: MockDataRepository }]
    });

    await TestBed.inject(AuthStateService).ensureInitialized();
    repository = TestBed.inject(DataRepository) as MockDataRepository;
    tickets = TestBed.inject(TicketService);
    await tickets.selectView('all-unsolved');
  });

  it('applies two rapid changes to the same ticket instead of losing the second', async () => {
    const [ticket] = await repository.getTicketsByView('all-unsolved');
    expect(ticket).toBeDefined();

    const [priorityChange, subjectChange] = await Promise.all([
      tickets.updateProperty(ticket.id, { priority: 'urgent' }),
      tickets.updateProperty(ticket.id, { subject: 'Renamed in the same tick' })
    ]);

    expect(priorityChange).toBe(true);
    expect(subjectChange).toBe(true);

    const stored = await repository.getTicketById(ticket.id);
    expect(stored.priority).toBe('urgent');
    expect(stored.subject).toBe('Renamed in the same tick');
    expect(stored.version).toBe(ticket.version + 2);
  });

  it('serialises a burst of three changes', async () => {
    const [ticket] = await repository.getTicketsByView('all-unsolved');

    const results = await Promise.all([
      tickets.updateProperty(ticket.id, { priority: 'high' }),
      tickets.updateProperty(ticket.id, { status: 'pending' }),
      tickets.updateProperty(ticket.id, { type: 'incident' })
    ]);

    expect(results.every(Boolean)).toBe(true);
    const stored = await repository.getTicketById(ticket.id);
    expect(stored.priority).toBe('high');
    expect(stored.status).toBe('pending');
    expect(stored.type).toBe('incident');
    expect(stored.version).toBe(ticket.version + 3);
  });

  it('keeps the queue usable after a change is rejected', async () => {
    // Loading the closed ticket through search puts it in the record map, so the
    // rejection comes from the repository rather than from a missing record.
    await tickets.search('Audit log retention');
    const closed = await repository.searchTickets('Audit log retention');
    const open = (await repository.getTicketsByView('all-unsolved'))[0];
    expect(closed[0].status).toBe('closed');

    const rejected = await tickets.updateProperty(closed[0].id, { priority: 'urgent' });
    expect(rejected).toBe(false);

    const accepted = await tickets.updateProperty(open.id, { priority: 'low' });
    expect(accepted).toBe(true);
    expect((await repository.getTicketById(open.id)).priority).toBe('low');
  });
});