import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TicketPriority, TicketStatus } from '../../../core/models/database.types';

export type BadgeKind = 'status' | 'priority';

const STATUS_LABELS: Readonly<Record<TicketStatus, string>> = {
  new: 'New',
  open: 'Open',
  pending: 'Pending',
  solved: 'Solved',
  closed: 'Closed'
};

const PRIORITY_LABELS: Readonly<Record<TicketPriority, string>> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent'
};

/**
 * Compact pill used for ticket status and priority.
 *
 * Colour alone never carries the meaning: the pill always renders its label next
 * to the dot, so the state is readable without colour vision.
 */
@Component({
  selector: 'app-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [class]="badgeClass()" [attr.title]="title()">
      <span class="badge__dot" aria-hidden="true"></span>
      <span class="badge__label">{{ displayLabel() }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      max-width: 100%;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
      padding: 2px 8px;
      border: 1px solid var(--badge-border);
      border-radius: var(--zd-radius-pill);
      background-color: var(--badge-bg);
      color: var(--badge-ink);
      font-size: 12px;
      font-weight: 500;
      line-height: 18px;
      white-space: nowrap;
    }

    .badge__dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: currentColor;
      flex: 0 0 auto;
    }

    .badge__label {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .badge--status-new {
      --badge-bg: var(--zd-yellow-bg);
      --badge-border: var(--zd-yellow-border);
      --badge-ink: var(--zd-yellow-text);
    }

    .badge--status-open {
      --badge-bg: var(--zd-danger-bg);
      --badge-border: #F5C2C6;
      --badge-ink: var(--zd-danger);
    }

    .badge--status-pending {
      --badge-bg: var(--zd-blue-bg);
      --badge-border: #B8DCF7;
      --badge-ink: #12588C;
    }

    .badge--status-solved {
      --badge-bg: var(--zd-emerald-bg);
      --badge-border: #A8DCD4;
      --badge-ink: #00695E;
    }

    .badge--status-closed {
      --badge-bg: var(--zd-slate-bg);
      --badge-border: #D0D5D9;
      --badge-ink: #55606A;
    }

    .badge--priority-urgent {
      --badge-bg: var(--zd-danger-bg);
      --badge-border: #F5C2C6;
      --badge-ink: var(--zd-danger);
    }

    .badge--priority-high {
      --badge-bg: var(--zd-orange-bg);
      --badge-border: #F7C9A8;
      --badge-ink: var(--zd-orange);
    }

    .badge--priority-normal {
      --badge-bg: var(--zd-slate-bg);
      --badge-border: #D0D5D9;
      --badge-ink: #55606A;
    }

    .badge--priority-low {
      --badge-bg: #F7F8F8;
      --badge-border: var(--zd-border-subtle);
      --badge-ink: var(--zd-text-muted);
    }
  `
})
export class BadgeComponent {
  readonly kind = input.required<BadgeKind>();
  readonly value = input.required<TicketStatus | TicketPriority>();
  /** Overrides the default wording, for example to pluralise a sidebar count. */
  readonly label = input<string | null>(null);
  readonly title = input<string | null>(null);

  protected readonly badgeClass = computed(() => `badge badge--${this.kind()}-${this.value()}`);

  protected readonly displayLabel = computed(() => {
    const override = this.label();
    if (override !== null) {
      return override;
    }
    return this.kind() === 'status'
      ? STATUS_LABELS[this.value() as TicketStatus]
      : PRIORITY_LABELS[this.value() as TicketPriority];
  });
}