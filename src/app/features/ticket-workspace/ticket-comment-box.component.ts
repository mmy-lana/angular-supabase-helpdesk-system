import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked
} from '@angular/core';
import { Attachment, Ticket, isTicketStatus } from '../../core/models/helpdesk.models';
import { AuthStateService } from '../../core/services/auth-state.service';
import { TicketService } from '../../core/services/ticket.service';
import { WorkspaceTabService } from '../../core/services/workspace-tab.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { DropdownComponent, DropdownOption } from '../../shared/ui/dropdown/dropdown.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

export type ComposerMode = 'reply' | 'note';

const STATUS_OPTIONS: readonly DropdownOption[] = [
  { value: '', label: 'Keep current status' },
  { value: 'pending', label: 'Set to pending' },
  { value: 'solved', label: 'Set to solved' }
];

/**
 * Reply composer with the two modes an agent actually needs.
 *
 * A public reply reaches the customer and may carry a status change; an internal
 * note stays inside the workspace, turns the editor yellow, and never touches the
 * ticket status. Whatever has been typed is kept as a draft for as long as the tab
 * exists, so switching tabs never loses a paragraph.
 */
@Component({
  selector: 'app-ticket-comment-box',
  standalone: true,
  imports: [ButtonComponent, DropdownComponent, IconComponent],
  templateUrl: './ticket-comment-box.component.html',
  styleUrl: './ticket-comment-box.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TicketCommentBoxComponent {
  private readonly tickets = inject(TicketService);
  private readonly tabs = inject(WorkspaceTabService);
  private readonly authState = inject(AuthStateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ticket = input.required<Ticket | null>();
  /** Tab the draft belongs to; changing it loads that tab's draft. */
  readonly draftKey = input.required<string>();

  protected readonly mode = signal<ComposerMode>('reply');
  protected readonly body = signal('');
  protected readonly statusAfterSend = signal('');
  protected readonly attachments = signal<readonly Attachment[]>([]);
  protected readonly submitting = signal(false);
  protected readonly uploading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly canWriteInternalNotes = this.authState.canUseInternalNotes;

  protected readonly isClosed = computed(() => this.ticket()?.status === 'closed');
  protected readonly canSubmit = computed(
    () => this.body().trim().length > 0 && !this.submitting() && !this.isClosed()
  );

  constructor() {
    effect(() => {
      const key = this.draftKey();
      untracked(() => {
        this.body.set(this.tabs.draftFor(key));
        this.attachments.set([]);
        this.mode.set('reply');
        this.statusAfterSend.set('');
        this.errorMessage.set(null);
      });
    });

    effect(() => {
      const key = this.draftKey();
      const body = this.body();
      untracked(() => this.tabs.saveDraft(key, body));
    });

    effect(() => {
      const key = this.draftKey();
      const isDirty = this.body().trim().length > 0;
      untracked(() => this.tabs.markDirty(key, isDirty));
    });

    this.destroyRef.onDestroy(() => {
      const key = untracked(this.draftKey);
      this.tabs.saveDraft(key, untracked(this.body));
      this.tabs.markDirty(key, false);
    });
  }

  protected selectMode(mode: ComposerMode): void {
    if (mode === 'note' && !this.canWriteInternalNotes()) {
      return;
    }
    this.mode.set(mode);
  }

  protected onInput(value: string): void {
    this.body.set(value);
    this.errorMessage.set(null);
  }

  protected onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void this.submit();
    }
  }

  protected async onFilesSelected(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) {
      return;
    }

    this.uploading.set(true);
    try {
      for (const file of Array.from(files)) {
        const attachment = await this.tickets.uploadFile(file);
        if (attachment) {
          this.attachments.update((current) => [...current, attachment]);
        }
      }
    } finally {
      this.uploading.set(false);
    }
  }

  protected removeAttachment(filePath: string): void {
    this.attachments.update((current) => current.filter((attachment) => attachment.filePath !== filePath));
  }

  protected onStatusSelected(value: string): void {
    this.statusAfterSend.set(value);
  }

  protected async submit(): Promise<void> {
    const ticket = this.ticket();
    const text = this.body().trim();
    if (!ticket || text.length === 0 || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const isInternal = this.mode() === 'note';
      const posted = await this.tickets.postComment({
        ticketId: ticket.id,
        body: text,
        isInternal,
        attachments: this.attachments()
      });

      if (!posted) {
        this.errorMessage.set('The message was not sent. Check the connection and try again.');
        return;
      }

      if (!isInternal) {
        const nextStatus = this.statusAfterSend();
        if (isTicketStatus(nextStatus) && nextStatus !== ticket.status) {
          await this.tickets.updateProperty(ticket.id, { status: nextStatus });
        }
      }

      const key = this.draftKey();
      this.body.set('');
      this.attachments.set([]);
      this.statusAfterSend.set('');
      this.tabs.saveDraft(key, '');
      this.tabs.markDirty(key, false);
    } finally {
      this.submitting.set(false);
    }
  }
}