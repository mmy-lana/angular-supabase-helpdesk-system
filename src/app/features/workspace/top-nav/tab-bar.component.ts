import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WorkspaceTab } from '../../../core/models/helpdesk.models';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/**
 * Horizontal tab strip of the workspace.
 *
 * A tab whose tab type changed, or a ticket tab whose subject is still being
 * edited, carries a dot so it is obvious which tabs would lose work.
 * The close control is a 14 pixel glyph inside a 44 pixel target, because a
 * cross that small is otherwise impossible to hit on a phone.
 */
@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './tab-bar.component.html',
  styleUrl: './tab-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TabBarComponent {
  readonly tabs = input.required<readonly WorkspaceTab[]>();
  readonly activeTabId = input<string | null>(null);

  readonly tabSelected = output<string>();
  readonly tabClosed = output<string>();
  readonly newTicket = output<void>();

  protected onKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const tabs = this.tabs();
      if (tabs.length === 0) {
        return;
      }
      const nextIndex = event.key === 'ArrowRight' ? index + 1 : index - 1;
      const target = tabs[(nextIndex + tabs.length) % tabs.length];
      this.tabSelected.emit(target.id);
    }
  }

  protected trackTab(_index: number, tab: WorkspaceTab): string {
    return tab.id;
  }
}