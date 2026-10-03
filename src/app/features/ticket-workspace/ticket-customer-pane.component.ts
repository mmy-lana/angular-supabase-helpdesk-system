import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { Ticket } from '../../core/models/helpdesk.models';
import { TicketService } from '../../core/services/ticket.service';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';

const ROLE_LABELS: Readonly<Record<string, string>> = {
  customer: 'Customer',
  agent: 'Agent',
  admin: 'Administrator'
};

/**
 * Who raised the ticket and what else they have in flight.
 *
 * History is loaded per requester, so switching between tickets from the same
 * person does not refetch what is already on screen.
 */
@Component({
  selector: 'app-ticket-customer-pane',
  standalone: true,
  imports: [BadgeComponent, IconComponent, TimeAgoPipe],
  templateUrl: './ticket-customer-pane.component.html',
  styleUrl: './ticket-customer-pane.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TicketCustomerPaneComponent {
  private readonly tickets = inject(TicketService);

  readonly ticket = input.required<Ticket | null>();
  /** Shows a close control when the pane is presented as a sheet rather than docked. */
  readonly dismissible = input(false);

  readonly ticketRequested = output<string>();
  readonly closed = output<void>();

  protected readonly requester = computed(() => this.ticket()?.requester ?? null);
  protected readonly history = this.tickets.history;
  protected readonly roleLabel = computed(() => {
    const role = this.requester()?.role ?? 'customer';
    return ROLE_LABELS[role] ?? 'User';
  });

  constructor() {
    effect(() => {
      const ticket = this.ticket();
      const requesterId = ticket?.requesterId ?? null;
      untracked(() => {
        if (requesterId && this.history().requesterId !== requesterId) {
          void this.tickets.loadRequesterHistory(requesterId, ticket?.id);
        }
      });
    });
  }
}