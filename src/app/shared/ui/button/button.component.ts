import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconName } from '../../../core/models/database.types';
import { IconComponent } from '../icon/icon.component';

export type ButtonVariant = 'primary' | 'secondary' | 'internal' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

/**
 * The workspace button.
 *
 * `internal` is the yellow variant used for internal notes, matching the yellow
 * the note itself renders in. While `loading` is true the button stays at its
 * full width so a form never reflows as the label is replaced by a spinner.
 */
@Component({
  selector: 'app-button',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.button-host]': 'true', '[class.button-host--block]': 'block()' },
  styles: `
    :host {
      display: inline-flex;
    }

    .button-host--block {
      display: flex;
      width: 100%;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: var(--zd-touch-target);
      padding: 0 16px;
      border: 1px solid transparent;
      border-radius: var(--zd-radius-md);
      font-size: 14px;
      font-weight: 500;
      line-height: 1.2;
      text-align: center;
      transition: background-color var(--zd-transition), border-color var(--zd-transition),
        color var(--zd-transition);
    }

    .button--sm {
      min-height: 34px;
      padding: 0 10px;
      font-size: 13px;
    }

    .button--primary {
      background-color: var(--zd-green-action);
      color: var(--zd-green-ink);
    }

    .button--primary:hover:not(:disabled) {
      background-color: var(--zd-green-action-hover);
    }

    .button--secondary {
      background-color: var(--zd-surface);
      border-color: var(--zd-border);
      color: var(--zd-text-main);
    }

    .button--secondary:hover:not(:disabled) {
      background-color: var(--zd-surface-sunken);
    }

    .button--internal {
      background-color: var(--zd-yellow-bg);
      border-color: var(--zd-yellow-border);
      color: var(--zd-yellow-text);
    }

    .button--internal:hover:not(:disabled) {
      background-color: #FCEFC9;
    }

    .button--danger {
      background-color: var(--zd-danger);
      color: var(--zd-text-inverse);
    }

    .button--danger:hover:not(:disabled) {
      background-color: #AC2733;
    }

    .button--ghost {
      background-color: transparent;
      color: var(--zd-text-secondary);
    }

    .button--ghost:hover:not(:disabled) {
      background-color: var(--zd-surface-sunken);
      color: var(--zd-text-main);
    }

    .button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .button__label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .spinner {
      width: 15px;
      height: 15px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: button-spin 640ms linear infinite;
    }

    @keyframes button-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* Touch devices keep the 44px floor even for compact rows. */
    @media (pointer: coarse) {
      .button--sm {
        min-height: var(--zd-touch-target);
      }
    }
  `,
  template: `
    <button
      [type]="type()"
      [class]="buttonClass()"
      [disabled]="isDisabled()"
      [attr.aria-busy]="loading() ? 'true' : null"
      [attr.aria-label]="ariaLabel()"
      [attr.title]="title()"
      (click)="pressed.emit($event)">
      @if (loading()) {
        <span class="spinner" aria-hidden="true"></span>
      } @else if (icon(); as iconName) {
        <app-icon [name]="iconName" [size]="iconSize()" />
      }
      @if (label(); as text) {
        <span class="button__label">{{ text }}</span>
      }
    </button>
  `
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly label = input<string | null>(null);
  readonly icon = input<IconName | null>(null);
  readonly iconSize = input(18);
  readonly type = input<'button' | 'submit'>('button');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly block = input(false);
  readonly title = input<string | null>(null);
  /** Required when the button renders an icon without a visible label. */
  readonly ariaLabel = input<string | null>(null);

  readonly pressed = output<MouseEvent>();

  protected readonly buttonClass = computed(
    () => `button button--${this.variant()} button--${this.size()}`
  );

  protected readonly isDisabled = computed(() => this.disabled() || this.loading());
}