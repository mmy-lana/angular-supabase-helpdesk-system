import { Injectable, computed, inject, signal } from '@angular/core';
import { TicketViewId, WorkspaceTab } from '../models/helpdesk.models';
import { clearStored, readStoredJson, writeStoredJson } from '../../shared/utils/browser-storage';

const DRAFT_STORAGE_KEY = 'WORKSPACE_DRAFTS_V1';

type DraftMap = Record<string, string>;

export function viewTabId(view: TicketViewId): string {
  return `view:${view}`;
}

export function ticketTabId(ticketId: string): string {
  return `ticket:${ticketId}`;
}

export const NEW_TICKET_TAB_ID = 'new-ticket';

/**
 * Open tabs of the workspace and which one is in front.
 *
 * Tabs are the unit a person navigates by, so this service owns three things
 * that have to agree: the tab strip, the pane underneath it, and the realtime
 * subscriptions. Opening a ticket tab subscribes to its comments, closing it
 * unsubscribes, and a draft that would be lost is kept in memory until the tab
 * is closed deliberately.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceTabService {
  private readonly tabsSignal = signal<readonly WorkspaceTab[]>([]);
  private readonly activeIdSignal = signal<string | null>(null);
  private readonly draftsSignal = signal<DraftMap>(readStoredJson<DraftMap>(DRAFT_STORAGE_KEY) ?? {});

  readonly tabs = this.tabsSignal.asReadonly();
  readonly activeTabId = this.activeIdSignal.asReadonly();

  readonly activeTab = computed<WorkspaceTab | null>(
    () => this.tabsSignal().find((tab) => tab.id === this.activeIdSignal()) ?? null
  );

  readonly canCloseActiveTab = computed(() => this.tabsSignal().length > 1);

  /** Ticket tabs currently on screen; the realtime bridge mirrors this set. */
  readonly openTicketIds = computed<readonly string[]>(() =>
    this.tabsSignal()
      .filter((tab) => tab.type === 'ticket' && tab.ticketId !== undefined)
      .map((tab) => tab.ticketId as string)
  );

  openView(view: TicketViewId, label: string): WorkspaceTab {
    return this.open({
      id: viewTabId(view),
      type: 'view',
      title: label,
      isDirty: false,
      icon: 'table'
    });
  }

  openTicket(ticketId: string, title: string): WorkspaceTab {
    return this.open({
      id: ticketTabId(ticketId),
      type: 'ticket',
      title,
      ticketId,
      isDirty: false,
      icon: 'ticket'
    });
  }

  openSearch(query: string): WorkspaceTab {
    // The query lives in the tab id so the search tab survives re-renders and so
    // two searches for different text are two different tabs.
    return this.open({
      id: `search:${query.trim()}`,
      type: 'search',
      title: `Search: ${query.trim()}`,
      isDirty: false,
      icon: 'search'
    });
  }

  openNewTicket(): WorkspaceTab {
    return this.open({
      id: NEW_TICKET_TAB_ID,
      type: 'new-ticket',
      title: 'New ticket',
      isDirty: false,
      icon: 'plus'
    });
  }

  activate(tabId: string): void {
    if (this.tabsSignal().some((tab) => tab.id === tabId)) {
      this.activeIdSignal.set(tabId);
    }
  }

  /** Renames a tab, used when a ticket subject changes or a ticket is created. */
  rename(tabId: string, title: string): void {
    this.tabsSignal.update((tabs) =>
      tabs.map((tab) => (tab.id === tabId ? { ...tab, title } : tab))
    );
  }

  markDirty(tabId: string, isDirty: boolean): void {
    this.tabsSignal.update((tabs) =>
      tabs.map((tab) => (tab.id === tabId && tab.isDirty !== isDirty ? { ...tab, isDirty } : tab))
    );
  }

  /**
   * Closes a tab. Returns `false` when the caller asked to close a tab holding an
   * unsaved draft, so the UI can confirm first and call `closeTab` again.
   */
  closeTab(tabId: string, options: { discardDraft?: boolean } = {}): boolean {
    const tab = this.tabsSignal().find((candidate) => candidate.id === tabId);
    if (!tab) {
      return true;
    }
    if (tab.isDirty && options.discardDraft !== true) {
      return false;
    }

    this.tabsSignal.update((tabs) => tabs.filter((candidate) => candidate.id !== tabId));
    this.clearDraft(tabId);

    if (this.activeIdSignal() === tabId) {
      const remaining = this.tabsSignal();
      this.activeIdSignal.set(remaining.at(-1)?.id ?? null);
    }
    return true;
  }

  // Draft memory ----------------------------------------------------------

  draftFor(tabId: string): string {
    return this.draftsSignal()[tabId] ?? '';
  }

  saveDraft(tabId: string, body: string): void {
    this.draftsSignal.update((drafts) => {
      const next = { ...drafts, [tabId]: body };
      writeStoredJson(DRAFT_STORAGE_KEY, next);
      return next;
    });
  }

  private clearDraft(tabId: string): void {
    this.draftsSignal.update((drafts) => {
      if (!(tabId in drafts)) {
        return drafts;
      }
      const next = { ...drafts };
      delete next[tabId];
      writeStoredJson(DRAFT_STORAGE_KEY, next);
      return next;
    });
  }

  /** Used by the showcase drawer to start from a clean workspace. */
  clearAll(): void {
    this.tabsSignal.set([]);
    this.activeIdSignal.set(null);
    this.draftsSignal.set({});
    clearStored(DRAFT_STORAGE_KEY);
  }

  private open(tab: WorkspaceTab): WorkspaceTab {
    const existing = this.tabsSignal().find((candidate) => candidate.id === tab.id);
    if (existing) {
      this.activeIdSignal.set(existing.id);
      return existing;
    }

    this.tabsSignal.update((tabs) => [...tabs, tab]);
    this.activeIdSignal.set(tab.id);
    return tab;
  }
}