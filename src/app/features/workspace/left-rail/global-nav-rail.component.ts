import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { AuthStateService } from '../../../core/services/auth-state.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

export type RailItem = 'views' | 'search' | 'new-ticket';

/**
 * Vertical navigation rail shown from tablet width upwards.
 *
 * The rail is a fixed 52 pixels on desktop and 48 on tablet; the icons are the
 * only content, so each one carries its own accessible name. The account badge
 * at the bottom is an initial, because a rail this narrow cannot hold a
 * photograph without becoming a distraction.
 */
@Component({
  selector: 'app-global-nav-rail',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './global-nav-rail.component.html',
  styleUrl: './global-nav-rail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GlobalNavRailComponent {
  private readonly authState = inject(AuthStateService);

  readonly activeItem = input<RailItem>('views');

  readonly itemSelected = output<RailItem>();
  readonly accountRequested = output<void>();
  readonly settingsRequested = output<void>();

  protected readonly initials = computed(() => {
    const name = this.authState.currentUser()?.fullName ?? '';
    if (name.trim().length === 0) {
      return '?';
    }
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  });

  protected readonly accountName = computed(() => this.authState.currentUser()?.fullName ?? 'Signed out');
}