import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Ticket, TicketSort, TicketSortField } from '../../core/models/helpdesk.models';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';

interface SortableColumn {
  readonly field: TicketSortField;
  readonly label: string;
  readonly className: string;
}

const COLUMNS: readonly SortableColumn[] = [
  { field: 'ticket_number', label: 'Ticket', className: 'col-number' },
  { field: 'subject', label: 'Subject', className: 'col-subject' },
  { field: 'status', label: 'Status', className: 'col-status' },
  { field: 'priority', label: 'Priority', className: 'col-priority' },
  { field: 'type', label: 'Type', className: 'col-type' },
  { field: 'updated_at', label: 'Updated', className: 'col-updated' }
];

/**
 * Ticket list.
 *
 * From tablet width upwards this is a sortable table. Below 768 pixels it becomes
 * a stack of cards: the same information, no horizontal scrolling, and every card
 * one tap target across the full width of the screen.
 */
@Component({
  selector: 'app-ticket-table',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, IconComponent, TimeAgoPipe],
  templateUrl: './ticket-table.component.html',
  styleUrl: './ticket-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TicketTableComponent {
  readonly tickets = input.required<readonly Ticket[]>();
  readonly sort = input<TicketSort>({ field: 'updated_at', direction: 'desc' });
  readonly loading = input(false);
  readonly hasMore = input(false);
  readonly emptyMessage = input('No tickets in this view yet.');
  readonly emptyHint = input('Tickets appear here as soon as somebody raises one.');

  readonly sortChanged = output<TicketSortField>();
  readonly ticketSelected = output<string>();
  readonly loadMore = output<void>();

  protected readonly columns = COLUMNS;

  protected ariaSortFor(field: TicketSortField): 'ascending' | 'descending' | 'none' {
    if (this.sort().field !== field) {
      return 'none';
    }
    return this.sort().direction === 'asc' ? 'ascending' : 'descending';
  }

  protected requesterName(ticket: Ticket): string {
    return ticket.requester?.fullName ?? 'Unknown requester';
  }

  protected assigneeName(ticket: Ticket): string {
    return ticket.assignee?.fullName ?? 'Unassigned';
  }
}