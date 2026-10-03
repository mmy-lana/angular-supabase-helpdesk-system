import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked
} from '@angular/core';
import { TicketSortField, TicketViewId } from '../../core/models/helpdesk.models';
import { TicketService } from '../../core/services/ticket.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TicketTableComponent } from './ticket-table.component';
import { ViewSidebarComponent } from './view-sidebar.component';

/**
 * The list pane: saved views on the left, ticket table on the right.
 *
 * The same component serves a saved view and a search result set, because they
 * differ only in which rows are shown. From 1024 pixels the view list is docked;
 * below that it slides over the table so the table keeps the full width.
 */
@Component({
  selector: 'app-views-container',
  standalone: true,
  imports: [IconComponent, TicketTableComponent, ViewSidebarComponent],
  templateUrl: './views-container.component.html',
  styleUrl: './views-container.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewsContainerComponent {
  protected readonly store = inject(TicketService);

  /** `null` while a search tab is in front. */
  readonly viewId = input.required<TicketViewId | null>();
  readonly query = input('');
  readonly searchMode = input(false);
  readonly sidebarOpen = input(false);

  readonly viewRequested = output<TicketViewId>();
  readonly ticketRequested = output<string>();
  readonly sidebarToggled = output<void>();

  protected readonly views = this.store.viewDefinitions;
  protected readonly counts = this.store.viewCounts;
  protected readonly sort = this.store.activeSort;

  protected readonly tickets = this.store.activeTickets;
  protected readonly loadState = this.store.activeListState;
  protected readonly error = this.store.activeListError;
  protected readonly hasMore = this.store.hasMore;

  protected readonly searchState = this.store.searchState;
  protected readonly isSearching = computed(() => this.searchMode());
  protected readonly shownTickets = computed(() =>
    this.isSearching() ? this.searchState().results : this.tickets()
  );
  protected readonly activeViewForSidebar = computed<TicketViewId>(
    () => this.viewId() ?? this.store.activeView()
  );
  protected readonly heading = computed(() => {
    if (this.isSearching()) {
      const query = this.searchState().query;
      return query.length === 0 ? 'Search' : `Results for “${query}”`;
    }
    return this.views.find((view) => view.id === this.viewId())?.label ?? 'Tickets';
  });

  constructor() {
    effect(() => {
      const viewId = this.viewId();
      const searchMode = this.searchMode();
      const query = this.query();
      untracked(() => {
        if (searchMode) {
          void this.store.search(query);
          return;
        }
        if (viewId) {
          void this.store.selectView(viewId);
        }
      });
    });
  }

  protected selectView(view: TicketViewId): void {
    this.viewRequested.emit(view);
  }

  protected onSortChanged(field: TicketSortField): void {
    this.store.toggleSort(field);
  }

  protected refresh(): void {
    void this.store.refresh();
  }
}