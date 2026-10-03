import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Workspace header: where the current view is named, tickets are searched for,
 * and a new ticket is started.
 *
 * Typing is debounced rather than dispatched on every keystroke, so a seven
 * character query costs one request instead of seven. The field also mirrors the
 * `query` input, which is how the mobile search tab fills it in.
 */
@Component({
  selector: 'app-workspace-header',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './workspace-header.component.html',
  styleUrl: './workspace-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspaceHeaderComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly query = input('');
  readonly searchDisabled = input(false);
  readonly drawerOpen = input(false);

  readonly searchChanged = output<string>();
  readonly newTicket = output<void>();
  readonly drawerToggled = output<void>();

  protected readonly draft = signal('');

  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('searchField');
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => this.draft.set(this.query()));
    this.destroyRef.onDestroy(() => this.cancelPendingSearch());
  }

  protected onInput(value: string): void {
    this.draft.set(value);
    this.cancelPendingSearch();
    this.debounceHandle = setTimeout(
      () => this.searchChanged.emit(this.draft().trim()),
      SEARCH_DEBOUNCE_MS
    );
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.cancelPendingSearch();
      this.searchChanged.emit(this.draft().trim());
      return;
    }
    if (event.key === 'Escape' && this.draft()) {
      event.preventDefault();
      this.clear();
    }
  }

  protected clear(): void {
    this.cancelPendingSearch();
    this.draft.set('');
    this.searchChanged.emit('');
    this.searchField()?.nativeElement.focus();
  }

  protected focusSearch(): void {
    this.searchField()?.nativeElement.focus();
  }

  private cancelPendingSearch(): void {
    if (this.debounceHandle !== null) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
  }
}