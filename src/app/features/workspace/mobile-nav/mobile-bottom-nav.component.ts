import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { IconName } from '../../../core/models/database.types';

export type MobileNavItem = 'views' | 'search' | 'new-ticket' | 'profile';

interface DockButton {
  readonly id: MobileNavItem;
  readonly label: string;
  readonly icon: IconName;
}

/**
 * Bottom dock for phones.
 *
 * Four destinations is the limit a thumb can hold: views, search, a new ticket
 * and the account drawer. The dock reserves the home indicator inset so the last
 * row never sits under the system gesture bar.
 */
@Component({
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './mobile-bottom-nav.component.html',
  styleUrl: './mobile-bottom-nav.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileBottomNavComponent {
  readonly activeItem = input<MobileNavItem | null>(null);

  readonly itemSelected = output<MobileNavItem>();

  protected readonly buttons: readonly DockButton[] = [
    { id: 'views', label: 'Views', icon: 'table' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'new-ticket', label: 'New ticket', icon: 'plus' },
    { id: 'profile', label: 'Profile', icon: 'user' }
  ];
}