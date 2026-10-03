import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { TicketService } from '../../core/services/ticket.service';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { CommentItemComponent } from './comment-item.component';
import { TicketCommentBoxComponent } from './ticket-comment-box.component';
import { TicketCustomerPaneComponent } from './ticket-customer-pane.component';
import { TicketLeftSidebarComponent } from './ticket-left-sidebar.component';

/**
 * The ticket workspace: properties, conversation and requester context.
 *
 * The three panes collapse by width rather than by device. Above 1280 pixels all
 * three are docked. On compact desktop the requester pane becomes an overlay. On
 * tablets the properties slide in from the left. On phones they collapse into a
 * bottom sheet, so the conversation keeps the whole screen.
 */
@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [
    BadgeComponent,
    ButtonComponent,
    CommentItemComponent,
    IconComponent,
    TicketCommentBoxComponent,
    TicketCustomerPaneComponent,
    TicketLeftSidebarComponent
  ],
  templateUrl: './ticket-detail.component.html',
  styleUrl: './ticket-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TicketDetailComponent {
  private readonly tickets = inject(TicketService);

  readonly ticketId = input.required<string | null>();
  /** Tab id the reply draft belongs to. */
  readonly draftKey = input.required<string>();

  readonly propertiesOpen = input(false);
  readonly contextOpen = input(false);

  readonly propertiesToggled = output<void>();
  readonly contextToggled = output<void>();
  readonly ticketRequested = output<string>();

  protected readonly detail = this.tickets.detailState;
  protected readonly currentUserId = this.tickets.currentUser;

  protected readonly comments = computed(() => this.detail().comments);
  protected readonly ticket = computed(() => this.detail().ticket);

  constructor() {
    effect(() => {
      const ticketId = this.ticketId();
      untracked(() => {
        if (ticketId) {
          void this.tickets.openTicket(ticketId);
        }
      });
    });
  }
}