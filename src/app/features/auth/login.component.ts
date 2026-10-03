import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DemoAccount } from '../../../environments/environment.interface';
import { AuthStateService } from '../../core/services/auth-state.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';

/**
 * Sign in screen.
 *
 * Outside a production build it also offers the bundled demo identities, which
 * is how the offline showcase and a fresh Docker instance are explored without
 * typing credentials. In production that list is empty and the screen is just a
 * form.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ButtonComponent, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly demoAccountBusy = signal<string | null>(null);

  protected readonly authError = this.authState.error;
  protected readonly misconfigured = computed(() => this.authState.status() === 'misconfigured');
  protected readonly demoAccounts = this.authState.demoAccounts;
  protected readonly showDemoAccounts = this.authState.demoSwitchingEnabled;

  constructor() {
    void this.authState.ensureInitialized();
  }

  protected async submit(): Promise<void> {
    const email = this.email().trim();
    const password = this.password();
    if (email.length === 0 || password.length === 0) {
      this.errorMessage.set('Enter your email address and password.');
      return;
    }
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.authState.clearError();
    try {
      await this.authState.signIn(email, password);
      await this.router.navigateByUrl(this.returnUrl());
    } catch (failure) {
      this.errorMessage.set(failure instanceof Error ? failure.message : 'Sign in failed.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected async useDemoAccount(account: DemoAccount): Promise<void> {
    if (this.demoAccountBusy()) {
      return;
    }

    this.demoAccountBusy.set(account.email);
    this.errorMessage.set(null);
    this.authState.clearError();
    try {
      this.email.set(account.email);
      this.password.set(account.password);
      await this.authState.signInAsDemoAccount(account);
      await this.router.navigateByUrl(this.returnUrl());
    } catch (failure) {
      this.errorMessage.set(failure instanceof Error ? failure.message : 'Sign in failed.');
    } finally {
      this.demoAccountBusy.set(null);
    }
  }

  private returnUrl(): string {
    const requested = this.route.snapshot.queryParamMap.get('returnUrl');
    return requested && requested.startsWith('/') ? requested : '/workspace';
  }
}