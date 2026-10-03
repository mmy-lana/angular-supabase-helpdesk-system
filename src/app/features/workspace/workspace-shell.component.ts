import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { map } from 'rxjs';
import { TicketViewId } from '../../core/models/helpdesk.models';
import { AuthStateService } from '../../core/services/auth-state.service';
import { TicketRealtimeService } from '../../core/services/ticket-realtime.service';
import { TicketService } from '../../core/services/ticket.service';
import { NEW_TICKET_TAB_ID, WorkspaceTabService } from '../../core/services/workspace-tab.service';
import { MobileBottomNavComponent, MobileNavItem } from './mobile-nav/mobile-bottom-nav.component';
import { MobileDrawerComponent } from './mobile-nav/mobile-drawer.component';
import { GlobalNavRailComponent, RailItem } from './left-rail/global-nav-rail.component';
import { TabBarComponent } from './top-nav/tab-bar.component';
import { WorkspaceHeaderComponent } from './top-nav/workspace-header.component';
import { TicketCreateModalComponent } from '../ticket-workspace/ticket-create-modal.component';
import { TicketDetailComponent } from '../ticket-workspace/ticket-detail.component';
import { Ticket } from '../../core/models/helpdesk.models';
import { ToastContainerComponent } from '../../shared/ui/toast/toast-container.component';
import { ViewsContainerComponent } from '../views/views-container.component';

/**
 * The workspace shell.
 *
 * It owns the navigation frame (rail, header, tab strip, phone dock, account
 * drawer) and decides what the outlet underneath renders: a saved view, a
 * search result set, a ticket, or the new ticket dialog. Everything it needs
 * comes from the core services, so switching tabs is a signal update rather than
 * a route change and no state is lost when somebody comes back to a tab.
 */
@Component({
  selector: 'app-workspace-shell',
  standalone: true,
  imports: [
    GlobalNavRailComponent,
    MobileBottomNavComponent,
    MobileDrawerComponent,
    TabBarComponent,
    TicketCreateModalComponent,
    TicketDetailComponent,
    ToastContainerComponent,
    ViewsContainerComponent,
    WorkspaceHeaderComponent
  ],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspaceShellComponent {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly authState = inject(AuthStateService);
  private readonly realtime = inject(TicketRealtimeService);
  private readonly tickets = inject(TicketService);
  private readonly tabs = inject(WorkspaceTabService);

  protected readonly tabsState = this.tabs.tabs;
  protected readonly activeTab = this.tabs.activeTab;
  protected readonly activeTabId = this.tabs.activeTabId;

  protected readonly newTicketTabId = NEW_TICKET_TAB_ID;
  protected readonly drawerOpen = signal(false);
  protected readonly viewsSidebarOpen = signal(false);
  protected readonly propertiesOpen = signal(false);
  protected readonly contextOpen = signal(false);
  protected readonly pendingCloseTabId = signal<string | null>(null);

  protected readonly isPhone = toSignal(
    this.breakpoints.observe(Breakpoints.Handset).pipe(map((state) => state.matches)),
    { initialValue: false }
  );

  protected readonly headerTitle = computed(() => {
    const tab = this.activeTab();
    if (!tab) {
      return 'Help desk';
    }
    return tab.type === 'view'
      ? (this.tickets.viewDefinitions.find((view) => view.id === this.viewIdOf(tab.id))?.label ?? tab.title)
      : tab.title;
  });

  protected readonly headerSubtitle = computed(() => {
    const tab = this.activeTab();
    return tab?.type === 'ticket' ? 'Ticket conversation' : 'Tickets';
  });

  protected readonly searchQuery = computed(() => {
    const tab = this.activeTab();
    return tab?.type === 'search' ? tab.id.slice('search:'.length) : '';
  });

  protected readonly railItem = computed<RailItem>(() => {
    const tab = this.activeTab();
    if (tab?.type === 'search') {
      return 'search';
    }
    return tab?.type === 'new-ticket' ? 'new-ticket' : 'views';
  });

  protected readonly dockItem = computed<MobileNavItem | null>(() => {
    const tab = this.activeTab();
    if (!tab) {
      return null;
    }
    if (tab.type === 'search') {
      return 'search';
    }
    if (tab.type === 'new-ticket') {
      return 'new-ticket';
    }
    return 'views';
  });

  constructor() {
    void this.startWorkspace();
  }

  private async startWorkspace(): Promise<void> {
    await this.authState.ensureInitialized();

    if (this.tabs.tabs().length === 0) {
      const defaultView: TicketViewId = this.authState.canUseInternalNotes() ? 'my-tickets' : 'all-unsolved';
      this.openView(defaultView);
    }

    this.realtime.startGlobalFeed();
    await this.tickets.refreshCounts();
  }

  // Navigation -------------------------------------------------------------

  protected openView(view: TicketViewId): void {
    const definition = this.tickets.viewDefinitions.find((candidate) => candidate.id === view);
    this.tabs.openView(view, definition?.label ?? 'Tickets');
    this.viewsSidebarOpen.set(false);
  }

  protected onRailItem(item: RailItem): void {
    if (item === 'views') {
      this.openView(this.tickets.activeView());
      return;
    }
    if (item === 'search') {
      this.tabs.openSearch('');
      return;
    }
    this.tabs.openNewTicket();
  }

  protected onDockItem(item: MobileNavItem): void {
    if (item === 'views') {
      this.viewsSidebarOpen.set(!this.viewsSidebarOpen());
      return;
    }
    if (item === 'search') {
      this.tabs.openSearch('');
      return;
    }
    if (item === 'new-ticket') {
      this.tabs.openNewTicket();
      return;
    }
    this.drawerOpen.set(true);
  }

  protected openTicket(ticketId: string): void {
    const known = this.tickets.activeTickets().find((ticket) => ticket.id === ticketId);
    this.tabs.openTicket(ticketId, known?.subject ?? 'Ticket');
    this.viewsSidebarOpen.set(false);
  }

  protected onHeaderSearch(query: string): void {
    this.tabs.openSearch(query);
  }

  protected onNewTicket(): void {
    this.tabs.openNewTicket();
  }

  protected onTabSelected(tabId: string): void {
    this.tabs.activate(tabId);
  }

  protected onTabClosed(tabId: string): void {
    const tab = this.tabs.tabs().find((candidate) => candidate.id === tabId);
    if (tab?.isDirty) {
      this.pendingCloseTabId.set(tabId);
      return;
    }
    this.finishClose(tabId);
  }

  protected confirmPendingClose(): void {
    const tabId = this.pendingCloseTabId();
    if (tabId) {
      this.finishClose(tabId);
    }
  }

  protected cancelPendingClose(): void {
    this.pendingCloseTabId.set(null);
  }

  protected onTicketCreated(ticket: Ticket): void {
    this.finishClose(NEW_TICKET_TAB_ID);
    this.openTicket(ticket.id);
  }

  protected async signOut(): Promise<void> {
    await this.authState.signOut();
    await this.router.navigate(['/login']);
  }

  private finishClose(tabId: string): void {
    const tab = this.tabs.tabs().find((candidate) => candidate.id === tabId);
    if (tab?.ticketId) {
      this.tickets.releaseTicket(tab.ticketId);
    }
    this.tabs.closeTab(tabId, { discardDraft: true });
    this.pendingCloseTabId.set(null);
  }

  protected viewIdOf(tabId: string): TicketViewId | null {
    const view = tabId.startsWith('view:') ? tabId.slice('view:'.length) : '';
    return this.tickets.viewDefinitions.some((candidate) => candidate.id === view)
      ? (view as TicketViewId)
      : null;
  }
}