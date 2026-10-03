import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
import { IconComponent } from '../icon/icon.component';

/**
 * Renders the notification queue. Mounted once by the shell.
 *
 * Errors are announced assertively, everything else politely, so a screen reader
 * interrupts only for something that needs a decision.
 */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      position: fixed;
      right: 16px;
      bottom: 16px;
      left: 16px;
      z-index: var(--zd-z-toast);
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }

    @media (max-width: 767px) {
      :host {
        right: 8px;
        bottom: calc(var(--zd-bottom-nav-height) + env(safe-area-inset-bottom) + 8px);
        left: 8px;
      }
    }

    .toast {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      width: 100%;
      max-width: 380px;
      margin-left: auto;
      padding: 12px 12px 12px 14px;
      border: 1px solid var(--zd-border);
      border-left-width: 3px;
      border-radius: var(--zd-radius-md);
      background-color: var(--zd-surface-raised);
      box-shadow: var(--zd-shadow-md);
      pointer-events: auto;
    }

    .toast--success {
      border-left-color: var(--zd-emerald);
    }

    .toast--info {
      border-left-color: var(--zd-blue);
    }

    .toast--warning {
      border-left-color: var(--zd-amber);
    }

    .toast--error {
      border-left-color: var(--zd-danger);
    }

    .toast__body {
      flex: 1 1 auto;
      min-width: 0;
    }

    .toast__title {
      font-weight: 600;
      line-height: 1.35;
    }

    .toast__message {
      margin-top: 2px;
      color: var(--zd-text-secondary);
      font-size: 13px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .toast__dismiss {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--zd-touch-target);
      height: var(--zd-touch-target);
      margin: -8px -8px -8px 0;
      border-radius: var(--zd-radius-sm);
      color: var(--zd-text-secondary);
    }

    .toast__dismiss:hover {
      background-color: var(--zd-surface-sunken);
      color: var(--zd-text-main);
    }
  `,
  template: `
    @for (toast of notifications.toasts(); track toast.id) {
      <div
        [class]="'toast toast--' + toast.tone"
        [attr.role]="toast.tone === 'error' ? 'alert' : 'status'"
        [attr.aria-live]="toast.tone === 'error' ? 'assertive' : 'polite'">
        <div class="toast__body">
          <p class="toast__title">{{ toast.title }}</p>
          @if (toast.message; as message) {
            <p class="toast__message">{{ message }}</p>
          }
        </div>
        <button type="button" class="toast__dismiss" [attr.aria-label]="'Dismiss: ' + toast.title" (click)="notifications.dismiss(toast.id)">
          <app-icon name="close" [size]="16" />
        </button>
      </div>
    }
  `
})
export class ToastContainerComponent {
  protected readonly notifications = inject(NotificationService);
}