import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStateService } from '../../core/services/auth-state.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';

const PASSWORD_MIN_LENGTH = 8;

/**
 * Account creation.
 *
 * A new account always starts as a customer: the `on_auth_user_created` trigger
 * writes the profile row with that role and the `profiles` column grant stops the
 * browser from changing it afterwards. Getting agent access is an administrator
 * decision, not something this form offers.
 */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ButtonComponent, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterComponent {
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly confirmationMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  constructor() {
    void this.authState.ensureInitialized();
  }

  protected async submit(): Promise<void> {
    const fullName = this.fullName().trim();
    const email = this.email().trim();
    const password = this.password();

    const problem = this.validate(fullName, email, password);
    if (problem) {
      this.errorMessage.set(problem);
      return;
    }
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.confirmationMessage.set(null);
    this.authState.clearError();
    try {
      const outcome = await this.authState.register(email, password, fullName);
      if (outcome.requiresEmailConfirmation) {
        this.confirmationMessage.set(`We sent a confirmation link to ${email}. Open it, then sign in.`);
        return;
      }
      await this.router.navigate(['/workspace']);
    } catch (failure) {
      this.errorMessage.set(failure instanceof Error ? failure.message : 'Registration failed.');
    } finally {
      this.submitting.set(false);
    }
  }

  private validate(fullName: string, email: string, password: string): string | null {
    if (fullName.length < 2) {
      return 'Enter the name your colleagues will see on your tickets.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Enter a valid email address.';
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      return `Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`;
    }
    return null;
  }
}