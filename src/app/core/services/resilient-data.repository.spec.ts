import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStored, writeStoredJson } from '../../shared/utils/browser-storage';
import { AuthStateService } from './auth-state.service';
import { DataRepository } from './data-repository.interface';
import { MOCK_DATA_KEY, MOCK_SESSION_KEY } from './mock-fixtures';
import { MockDataRepository } from './mock-data.repository';
import { ResilientDataRepository } from './resilient-data.repository';
import { SupabaseDataRepository } from './supabase-data.repository';

/**
 * The proxy only talks to Supabase while the session believes the backend is
 * reachable, so each test states that assumption explicitly. The suite resolves
 * the demo environment, which starts the flag already set; clearing it here is
 * what a build configured for Supabase looks like.
 */
describe('ResilientDataRepository', () => {
  let proxy: ResilientDataRepository;
  let authState: AuthStateService;
  let supabase: SupabaseDataRepository;
  let mock: MockDataRepository;

  beforeEach(async () => {
    clearStored(MOCK_DATA_KEY);
    writeStoredJson(MOCK_SESSION_KEY, 'agent@example.com');

    TestBed.configureTestingModule({
      providers: [
        SupabaseDataRepository,
        MockDataRepository,
        { provide: DataRepository, useClass: ResilientDataRepository }
      ]
    });

    authState = TestBed.inject(AuthStateService);
    await authState.ensureInitialized();
    proxy = TestBed.inject(DataRepository) as ResilientDataRepository;
    supabase = TestBed.inject(SupabaseDataRepository);
    mock = TestBed.inject(MockDataRepository);
    authState.isOperatingOffline.set(false);
  });

  it('uses Supabase while the backend is believed to be reachable', async () => {
    const spy = vi.spyOn(supabase, 'getTicketsByView').mockResolvedValue([]);

    await proxy.getTicketsByView('all-unsolved');

    expect(spy).toHaveBeenCalledOnce();
    expect(authState.isOperatingOffline()).toBe(false);
  });

  it('serves mock data and records the outage when Supabase cannot be reached', async () => {
    vi.spyOn(supabase, 'getTicketsByView').mockRejectedValue(
      new TypeError('TypeError: NetworkError when attempting to fetch resource.')
    );

    const tickets = await proxy.getTicketsByView('all-unsolved');

    expect(tickets.length).toBeGreaterThan(0);
    expect(authState.isOperatingOffline()).toBe(true);
  });

  it('stops probing Supabase once the outage is known', async () => {
    const spy = vi.spyOn(supabase, 'getTicketsByView').mockRejectedValue(
      new TypeError('TypeError: Failed to fetch')
    );

    await proxy.getTicketsByView('all-unsolved');
    await proxy.getTicketsByView('all-unsolved');
    await proxy.getTicketsByView('unassigned');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reports the outage once, however many queries fail', async () => {
    vi.spyOn(supabase, 'getTicketsByView').mockRejectedValue(new TypeError('TypeError: Failed to fetch'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await proxy.getTicketsByView('all-unsolved');
    await proxy.getTicketsByView('unassigned');

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('lets a genuine rejection through untouched', async () => {
    vi.spyOn(supabase, 'getTicketById').mockRejectedValue(
      new Error('This ticket does not exist, or it is not visible to your account.')
    );

    await expect(proxy.getTicketById('missing')).rejects.toThrow(/not visible/);
    expect(authState.isOperatingOffline()).toBe(false);
  });

  it('retries a failed write against the offline backend so the change lands', async () => {
    const write = vi.spyOn(supabase, 'updateTicket').mockRejectedValue(
      new TypeError('TypeError: Failed to fetch')
    );

    const [ticket] = await mock.getTicketsByView('all-unsolved');
    const updated = await proxy.updateTicket(ticket.id, { priority: 'urgent', version: ticket.version });

    expect(write).toHaveBeenCalledOnce();
    expect(updated.priority).toBe('urgent');
    expect(authState.isOperatingOffline()).toBe(true);
  });

  it('clears the offline dataset when it is the backend in use', async () => {
    const offlineSpy = vi.spyOn(mock, 'resetLocalData');
    const liveSpy = vi.spyOn(supabase, 'resetLocalData');

    authState.isOperatingOffline.set(true);
    proxy.resetLocalData();

    expect(offlineSpy).toHaveBeenCalledOnce();
    expect(liveSpy).not.toHaveBeenCalled();

    offlineSpy.mockRestore();
    liveSpy.mockRestore();
  });
});