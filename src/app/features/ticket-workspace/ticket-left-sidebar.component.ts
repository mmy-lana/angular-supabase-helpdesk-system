import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked
} from '@angular/core';
import { TicketPriority, TicketStatus, TicketType } from '../../core/models/database.types';
import { Ticket, isTicketPriority, isTicketStatus, isTicketType } from '../../core/models/helpdesk.models';
import { AuthStateService } from '../../core/services/auth-state.service';
import { TicketService } from '../../core/services/ticket.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { DropdownComponent, DropdownOption } from '../../shared/ui/dropdown/dropdown.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';

const STATUS_OPTIONS: readonly DropdownOption[] = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'solved', label: 'Solved' },
  { value: 'closed', label: 'Closed' }
];

const PRIORITY_OPTIONS: readonly DropdownOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

const TYPE_OPTIONS: readonly DropdownOption[] = [
  { value: 'question', label: 'Question' },
  { value: 'incident', label: 'Incident' },
  { value: 'problem', label: 'Problem' },
  { value: 'task', label: 'Task' }
];

const UNASSIGNED_VALUE = '__unassigned__';

/**
 * Ticket properties.
 *
 * Agents edit here; customers see the same values as plain text, because the
 * database refuses those writes anyway and a control that cannot work should not
 * look like it can. A closed ticket turns every control off and says why.
 */
@Component({
  selector: 'app-ticket-left-sidebar',
  standalone: true,
  imports: [ButtonComponent, DropdownComponent, IconComponent, TimeAgoPipe],
  templateUrl: './ticket-left-sidebar.component.html',
  styleUrl: './ticket-left-sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TicketLeftSidebarComponent {
  private readonly tickets = inject(TicketService);
  private readonly authState = inject(AuthStateService);

  readonly ticket = input.required<Ticket | null>();
  /** Closes the sheet presentation on phones. Ignored by the docked sidebar. */
  readonly dismissible = input(false);

  readonly closed = output<void>();

  protected readonly subjectDraft = signal('');
  protected readonly tagDraft = signal('');
  protected readonly savingSubject = signal(false);

  protected readonly canEdit = computed(() => this.authState.canUseInternalNotes());
  protected readonly isClosed = computed(() => this.ticket()?.status === 'closed');
  protected readonly controlsDisabled = computed(() => !this.canEdit() || this.isClosed());

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly priorityOptions = PRIORITY_OPTIONS;
  protected readonly typeOptions = TYPE_OPTIONS;

  protected readonly assigneeOptions = computed<readonly DropdownOption[]>(() => [
    { value: UNASSIGNED_VALUE, label: 'Unassigned' },
    ...this.tickets.agents().map((profile) => ({
      value: profile.id,
      label: profile.fullName,
      description: profile.email
    }))
  ]);

  protected readonly assigneeValue = computed(() => this.ticket()?.assigneeId ?? UNASSIGNED_VALUE);
  protected readonly canClaim = computed(
    () =>
      this.canEdit() &&
      !this.isClosed() &&
      this.ticket() !== null &&
      this.ticket()?.assigneeId === null &&
      this.ticket()?.requesterId !== this.authState.currentUser()?.id
  );

  constructor() {
    effect(() => {
      const ticket = this.ticket();
      untracked(() => {
        this.subjectDraft.set(ticket?.subject ?? '');
        this.tagDraft.set('');
      });
    });

    void this.tickets.loadAssignableProfiles();
  }

  protected async onStatusChange(value: string): Promise<void> {
    if (isTicketStatus(value)) {
      await this.patch({ status: value as TicketStatus });
    }
  }

  protected async onPriorityChange(value: string): Promise<void> {
    if (isTicketPriority(value)) {
      await this.patch({ priority: value as TicketPriority });
    }
  }

  protected async onTypeChange(value: string): Promise<void> {
    if (isTicketType(value)) {
      await this.patch({ type: value as TicketType });
    }
  }

  protected async onAssigneeChange(value: string): Promise<void> {
    await this.patch({ assigneeId: value === UNASSIGNED_VALUE ? null : value });
  }

  protected async claim(): Promise<void> {
    const ticket = this.ticket();
    if (ticket) {
      await this.tickets.claimTicket(ticket.id);
    }
  }

  protected onSubjectInput(value: string): void {
    this.subjectDraft.set(value);
  }

  protected async saveSubject(): Promise<void> {
    const ticket = this.ticket();
    const subject = this.subjectDraft().trim();
    if (!ticket || subject === ticket.subject) {
      this.subjectDraft.set(ticket?.subject ?? '');
      return;
    }
    if (subject.length < 3 || subject.length > 255) {
      this.subjectDraft.set(ticket.subject);
      return;
    }

    this.savingSubject.set(true);
    try {
      await this.patch({ subject });
    } finally {
      this.savingSubject.set(false);
    }
  }

  protected async addTag(): Promise<void> {
    const ticket = this.ticket();
    const tag = this.tagDraft().trim().toLowerCase();
    if (!ticket || tag.length === 0 || ticket.tags.includes(tag)) {
      this.tagDraft.set('');
      return;
    }

    this.tagDraft.set('');
    await this.patch({ tags: [...ticket.tags, tag] });
  }

  protected async removeTag(tag: string): Promise<void> {
    const ticket = this.ticket();
    if (!ticket) {
      return;
    }
    await this.patch({ tags: ticket.tags.filter((candidate) => candidate !== tag) });
  }

  private async patch(update: Parameters<TicketService['updateProperty']>[1]): Promise<void> {
    const ticket = this.ticket();
    if (ticket) {
      await this.tickets.updateProperty(ticket.id, update);
    }
  }
}