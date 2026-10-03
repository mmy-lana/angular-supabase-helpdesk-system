import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearStored, writeStoredJson } from '../../shared/utils/browser-storage';
import { NEW_TICKET_TAB_ID, WorkspaceTabService, ticketTabId, viewTabId } from './workspace-tab.service';

const DRAFT_KEY = 'WORKSPACE_DRAFTS_V1';

describe('WorkspaceTabService', () => {
  let tabs: WorkspaceTabService;

  beforeEach(() => {
    clearStored(DRAFT_KEY);
    TestBed.configureTestingModule({});
    tabs = TestBed.inject(WorkspaceTabService);
    tabs.clearAll();
  });

  it('opens a tab and puts it in front', () => {
    tabs.openView('my-tickets', 'Your unsolved tickets');

    expect(tabs.tabs()).toHaveLength(1);
    expect(tabs.activeTabId()).toBe(viewTabId('my-tickets'));
  });

  it('focuses an already open tab instead of duplicating it', () => {
    tabs.openTicket('ticket-1', 'Printer on level 3');
    tabs.openView('unassigned', 'Unassigned tickets');
    tabs.openTicket('ticket-1', 'Printer on level 3');

    expect(tabs.tabs()).toHaveLength(2);
    expect(tabs.activeTabId()).toBe(ticketTabId('ticket-1'));
  });

  it('exposes the ticket ids that need a realtime channel', () => {
    tabs.openTicket('ticket-1', 'First');
    tabs.openTicket('ticket-2', 'Second');
    tabs.openView('solved', 'Recently solved tickets');

    expect(tabs.openTicketIds()).toEqual(['ticket-1', 'ticket-2']);
  });

  it('refuses to close a tab that holds a draft until it is confirmed', () => {
    tabs.openTicket('ticket-1', 'Printer on level 3');
    tabs.markDirty(ticketTabId('ticket-1'), true);

    expect(tabs.closeTab(ticketTabId('ticket-1'))).toBe(false);
    expect(tabs.tabs()).toHaveLength(1);

    expect(tabs.closeTab(ticketTabId('ticket-1'), { discardDraft: true })).toBe(true);
    expect(tabs.tabs()).toHaveLength(0);
    expect(tabs.activeTabId()).toBeNull();
  });

  it('focuses the previous tab when the front one closes', () => {
    tabs.openView('my-tickets', 'Your unsolved tickets');
    tabs.openTicket('ticket-1', 'Printer on level 3');

    tabs.closeTab(ticketTabId('ticket-1'));

    expect(tabs.activeTabId()).toBe(viewTabId('my-tickets'));
  });

  it('keeps a draft until the tab is closed deliberately', () => {
    tabs.openTicket('ticket-1', 'Printer on level 3');
    tabs.saveDraft(ticketTabId('ticket-1'), 'Half written reply');

    expect(tabs.draftFor(ticketTabId('ticket-1'))).toBe('Half written reply');

    tabs.closeTab(ticketTabId('ticket-1'), { discardDraft: true });
    expect(tabs.draftFor(ticketTabId('ticket-1'))).toBe('');
  });

  it('restores drafts written by an earlier visit', () => {
    writeStoredJson(DRAFT_KEY, { [NEW_TICKET_TAB_ID]: 'subject line\n\nthe description' });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const restored = TestBed.inject(WorkspaceTabService);

    expect(restored.draftFor(NEW_TICKET_TAB_ID)).toBe('subject line\n\nthe description');
  });

  it('renames a tab when the subject changes', () => {
    tabs.openTicket('ticket-1', 'Printer on level 3');
    tabs.rename(ticketTabId('ticket-1'), 'Printer on level 3 jams');

    expect(tabs.activeTab()?.title).toBe('Printer on level 3 jams');
  });

  it('reports a single tab as not closable', () => {
    tabs.openView('solved', 'Recently solved tickets');
    expect(tabs.canCloseActiveTab()).toBe(false);

    tabs.openTicket('ticket-1', 'Printer on level 3');
    expect(tabs.canCloseActiveTab()).toBe(true);
  });
});