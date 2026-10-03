import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { AuthStateService } from '../../../core/services/auth-state.service';
import { DataRepository } from '../../../core/services/data-repository.interface';
import { NotificationService } from '../../../core/services/notification.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

const ROLE_LABELS: Readonly<Record<string, string>> = {
  customer: 'Customer',
  agent: 'Agent',
  admin: 'Administrator'
};

/**
 * Slide in panel used on phones for the account and workspace controls.
 *
 * The account switcher only exists outside a production build: it signs in as one
 * of the bundled demo identities, which is a development convenience and has no
 * meaning against a real backend. In production the drawer carries the profile
 * and the sign out button, nothing else.
 */
@Component({
  selector: 'app-mobile-drawer',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './mobile-drawer.component.html',
  styleUrl: './mobile-drawer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileDrawerComponent {
  private readonly authState = inject(AuthStateService);
  private readonly repository = inject(DataRepository);
  private readonly notifications = inject(NotificationService);

  readonly closed = output<void>();
  readonly signedOut = output<void>();

  protected readonly user = this.authState.currentUser;
  protected readonly roleLabel = computed(() => ROLE_LABELS[this.user()?.role ?? 'customer'] ?? 'User');
  protected readonly demoAccounts = environment.demoAccounts;
  protected readonly showDemoAccounts = !environment.production && environment.demoAccounts.length > 0;
  protected readonly isShowcase = environment.useMockData;
  protected readonly switchingAccount = this.authState.busy;

  protected async switchAccount(email: string, password: string): Promise<void> {
    try {
      await this.authState.signIn(email, password);
      this.closed.emit();
    } catch {
      // The service already reported the failure through its error signal and a toast.
    }
  }

  protected resetShowcase(): void {
    this.repository.resetLocalData();
    this.notifications.success('Showcase data reset', 'The sample tickets are back to their original state.');
  }

  protected async signOut(): Promise<void> {
    await this.authState.signOut();
    this.signedOut.emit();
  }
}