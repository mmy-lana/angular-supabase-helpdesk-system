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
import { TicketPriority, TicketType } from '../../core/models/database.types';
import { Ticket, isTicketPriority, isTicketType } from '../../core/models/helpdesk.models';
import { AuthStateService } from '../../core/services/auth-state.service';
import { TicketService } from '../../core/services/ticket.service';
import { WorkspaceTabService } from '../../core/services/workspace-tab.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { DropdownComponent, DropdownOption } from '../../shared/ui/dropdown/dropdown.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

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

const SUBJECT_MIN = 3;
const SUBJECT_MAX = 255;

/**
 * New ticket dialog.
 *
 * Assignment and tags only appear for staff, because the database rejects them
 * from a customer account (`HD004`). The subject and the message are validated
 * here as well as in the database, because a message that cannot be sent should
 * not reach the server.
 */
@Component({
  selector: 'app-ticket-create-modal',
  standalone: true,
  imports: [ButtonComponent, DropdownComponent, IconComponent],
  templateUrl: './ticket-create-modal.component.html',
  styleUrl: './ticket-create-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TicketCreateModalComponent {
  private readonly tickets = inject(TicketService);
  private readonly tabs = inject(WorkspaceTabService);
  private readonly authState = inject(AuthStateService);

  readonly open = input.required<boolean>();
  /** Tab the draft belongs to, so a half written ticket survives tab switches. */
  readonly draftKey = input.required<string>();

  readonly created = output<Ticket>();
  readonly dismissed = output<void>();

  protected readonly subject = signal('');
  protected readonly body = signal('');
  protected readonly priority = signal<TicketPriority>('normal');
  protected readonly type = signal<TicketType>('question');
  protected readonly assigneeId = signal<string>(UNASSIGNED_VALUE);
  protected readonly tags = signal<readonly string[]>([]);
  protected readonly tagDraft = signal('');
  protected readonly submitting = signal(false);
  protected readonly errors = signal<Readonly<Record<string, string>>>({});

  protected readonly priorityOptions = PRIORITY_OPTIONS;
  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly canAssign = this.authState.canUseInternalNotes;

  protected readonly assigneeOptions = computed<readonly DropdownOption[]>(() => [
    { value: UNASSIGNED_VALUE, label: 'Unassigned' },
    ...this.tickets.agents().map((profile) => ({
      value: profile.id,
      label: profile.fullName,
      description: profile.email
    }))
  ]);

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const key = this.draftKey();
      untracked(() => {
        if (!isOpen) {
          return;
        }
        const draft = this.tabs.draftFor(key);
        const [storedSubject, ...rest] = draft.split('\n\n');
        this.subject.set(storedSubject ?? '');
        this.body.set(rest.join('\n\n'));
      });
    });

    void this.tickets.loadAssignableProfiles();
  }

  protected dismiss(): void {
    if (this.submitting()) {
      return;
    }
    this.persistDraft();
    this.dismissed.emit();
  }

  protected onSubjectInput(value: string): void {
    this.subject.set(value);
    this.persistDraft();
  }

  protected onBodyInput(value: string): void {
    this.body.set(value);
    this.persistDraft();
  }

  protected onPriorityChange(value: string): void {
    if (isTicketPriority(value)) {
      this.priority.set(value as TicketPriority);
    }
  }

  protected onTypeChange(value: string): void {
    if (isTicketType(value)) {
      this.type.set(value as TicketType);
    }
  }

  protected onAssigneeChange(value: string): void {
    this.assigneeId.set(value);
  }

  protected async addTag(): Promise<void> {
    const tag = this.tagDraft().trim().toLowerCase();
    if (tag.length === 0 || this.tags().includes(tag)) {
      this.tagDraft.set('');
      return;
    }
    this.tags.update((current) => [...current, tag]);
    this.tagDraft.set('');
  }

  protected removeTag(tag: string): void {
    this.tags.update((current) => current.filter((candidate) => candidate !== tag));
  }

  protected async submit(): Promise<void> {
    const subject = this.subject().trim();
    const body = this.body().trim();
    const nextErrors: Record<string, string> = {};

    if (subject.length < SUBJECT_MIN) {
      nextErrors['subject'] = `Write at least ${SUBJECT_MIN} characters so the subject is recognisable.`;
    } else if (subject.length > SUBJECT_MAX) {
      nextErrors['subject'] = `Keep the subject under ${SUBJECT_MAX} characters.`;
    }
    if (body.length === 0) {
      nextErrors['body'] = 'Describe the problem so somebody can pick this up without asking.';
    }

    this.errors.set(nextErrors);
    if (Object.keys(nextErrors).length > 0 || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    try {
      const ticket = await this.tickets.createTicket({
        subject,
        body,
        priority: this.priority(),
        type: this.type(),
        tags: this.canAssign() ? this.tags() : [],
        assigneeId: this.canAssign() && this.assigneeId() !== UNASSIGNED_VALUE ? this.assigneeId() : null
      });

      if (ticket) {
        this.clearDraft();
        this.resetForm();
        this.created.emit(ticket);
      }
    } finally {
      this.submitting.set(false);
    }
  }

  private persistDraft(): void {
    this.tabs.saveDraft(this.draftKey(), `${this.subject().trim()}\n\n${this.body()}`);
    this.tabs.markDirty(this.draftKey(), this.subject().trim().length > 0 || this.body().trim().length > 0);
  }

  private clearDraft(): void {
    this.tabs.saveDraft(this.draftKey(), '');
    this.tabs.markDirty(this.draftKey(), false);
  }

  private resetForm(): void {
    this.subject.set('');
    this.body.set('');
    this.priority.set('normal');
    this.type.set('question');
    this.assigneeId.set(UNASSIGNED_VALUE);
    this.tags.set([]);
    this.tagDraft.set('');
    this.errors.set({});
  }
}