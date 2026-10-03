import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TicketViewId, ViewDefinition } from '../../core/models/helpdesk.models';
import { IconComponent } from '../../shared/ui/icon/icon.component';

/**
 * Saved views with their live counters.
 *
 * Counts come from the server rather than from the loaded page, so the number
 * next to a view is what is actually waiting in it and not what happens to be on
 * screen. A view nobody can act on is still listed, empty, because hiding it
 * would make the queue look smaller than it is.
 */
@Component({
  selector: 'app-view-sidebar',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './view-sidebar.component.html',
  styleUrl: './view-sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewSidebarComponent {
  readonly views = input.required<readonly ViewDefinition[]>();
  readonly counts = input.required<Readonly<Record<TicketViewId, number>>>();
  readonly activeView = input.required<TicketViewId>();

  readonly viewSelected = output<TicketViewId>();
  readonly dismissed = output<void>();
  readonly dismissible = input(false);
}