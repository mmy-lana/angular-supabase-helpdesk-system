import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TicketComment } from '../../core/models/helpdesk.models';
import { TicketService } from '../../core/services/ticket.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';

const FILE_SIZE_UNITS = ['B', 'kB', 'MB', 'GB'] as const;

/**
 * One entry in the ticket conversation.
 *
 * Public replies and internal notes share the same shape so the thread reads as
 * a single timeline, but a note is unmistakably different: yellow card, lock
 * badge, and a heading that says the customer cannot see it.
 */
@Component({
  selector: 'app-comment-item',
  standalone: true,
  imports: [IconComponent, TimeAgoPipe],
  templateUrl: './comment-item.component.html',
  styleUrl: './comment-item.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommentItemComponent {
  private readonly tickets = inject(TicketService);

  readonly comment = input.required<TicketComment>();
  /** Marks messages written by the signed in account. */
  readonly ownMessage = input(false);

  protected readonly authorName = computed(() => {
    const author = this.comment().author;
    return author?.fullName ?? 'Unknown sender';
  });

  protected readonly initials = computed(() => {
    const name = this.authorName();
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  });

  protected formatSize(bytes: number): string {
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < FILE_SIZE_UNITS.length - 1) {
      value /= 1024;
      unit += 1;
    }
    const rounded = unit === 0 ? String(value) : value.toFixed(1);
    return `${rounded} ${FILE_SIZE_UNITS[unit]}`;
  }

  protected openAttachment(filePath: string): void {
    void this.tickets.attachmentUrl(filePath).then((url) => {
      if (url) {
        window.open(url, '_blank', 'noopener');
      }
    });
  }
}