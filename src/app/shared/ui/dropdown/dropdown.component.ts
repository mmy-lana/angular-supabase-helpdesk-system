import {
  DOCUMENT,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { IconName } from '../../../core/models/database.types';
import { IconComponent } from '../icon/icon.component';

export interface DropdownOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly disabled?: boolean;
}

export type DropdownSize = 'sm' | 'md';

let nextDropdownId = 0;

/**
 * Property picker used for status, priority, type and assignee.
 *
 * Implemented as a listbox popup rather than a native `<select>` because ticket
 * properties carry secondary information (an assignee's address, a hint about
 * why a ticket cannot change) and because the row height has to stay at 44px for
 * touch. Keyboard support follows the listbox pattern: the trigger keeps focus,
 * `aria-activedescendant` tracks the highlighted option, and Escape restores the
 * previously selected value.
 */
@Component({
  selector: 'app-dropdown',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'dropdown-host' },
  styles: `
    :host {
      display: block;
      position: relative;
      min-width: 0;
    }

    .trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      min-height: var(--zd-touch-target);
      padding: 0 10px;
      border: 1px solid var(--zd-border);
      border-radius: var(--zd-radius-md);
      background-color: var(--zd-surface);
      color: var(--zd-text-main);
      font-size: 14px;
      line-height: 1.35;
      text-align: left;
      transition: border-color var(--zd-transition), background-color var(--zd-transition);
    }

    .trigger--sm {
      min-height: 34px;
    }

    .trigger:hover:not(:disabled) {
      background-color: var(--zd-surface-sunken);
    }

    .trigger:disabled {
      cursor: not-allowed;
      background-color: var(--zd-surface-sunken);
      color: var(--zd-text-muted);
    }

    .trigger__content {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .trigger__text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .trigger__text--placeholder {
      color: var(--zd-text-muted);
    }

    .trigger__caret {
      flex: 0 0 auto;
      color: var(--zd-text-secondary);
      transition: transform var(--zd-transition);
    }

    .trigger[aria-expanded='true'] .trigger__caret {
      transform: rotate(180deg);
    }

    .panel {
      position: absolute;
      z-index: var(--zd-z-overlay);
      top: calc(100% + 4px);
      left: 0;
      box-sizing: border-box;
      min-width: 100%;
      /* An option label can be long enough to push the list past the edge of a
         phone; capping the width keeps the page from scrolling sideways. */
      max-width: calc(100vw - 32px);
      max-height: 320px;
      padding: 4px;
      overflow-y: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--zd-border);
      border-radius: var(--zd-radius-md);
      background-color: var(--zd-surface-raised);
      box-shadow: var(--zd-shadow-md);
    }

    .panel--end {
      left: auto;
      right: 0;
    }

    .option {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: var(--zd-touch-target);
      padding: 6px 10px;
      border-radius: var(--zd-radius-sm);
      color: var(--zd-text-main);
      font-size: 14px;
      text-align: left;
      cursor: pointer;
    }

    .option--active {
      background-color: var(--zd-blue-bg);
    }

    .option--selected {
      font-weight: 600;
    }

    .option--disabled {
      cursor: not-allowed;
      color: var(--zd-text-muted);
    }

    .option__text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .option__label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .option__description {
      overflow: hidden;
      color: var(--zd-text-secondary);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .option__check {
      flex: 0 0 auto;
      margin-left: auto;
      color: var(--zd-green-action);
    }

    .panel--empty {
      padding: 12px;
      color: var(--zd-text-secondary);
      font-size: 13px;
    }
  `,
  template: `
    <button
      #trigger
      type="button"
      [class]="triggerClass()"
      [disabled]="disabled()"
      [attr.aria-haspopup]="'listbox'"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listboxId"
      [attr.aria-activedescendant]="activeDescendantId()"
      [attr.aria-label]="ariaLabel()"
      (click)="toggle()"
      (keydown)="onKeydown($event)">
      <span class="trigger__content">
        @if (selectedOption()?.icon; as iconName) {
          <app-icon [name]="iconName" [size]="16" />
        }
        <span class="trigger__text" [class.trigger__text--placeholder]="!selectedOption()">
          {{ selectedOption()?.label ?? placeholder() }}
        </span>
      </span>
      <span class="trigger__caret"><app-icon name="chevron-down" [size]="16" /></span>
    </button>

    @if (open()) {
      <div
        #listbox
        class="panel"
        [class.panel--end]="align() === 'end'"
        role="listbox"
        [id]="listboxId"
        [attr.aria-label]="ariaLabel() ?? placeholder()"
        (keydown)="onKeydown($event)">
        @for (option of options(); track option.value; let index = $index) {
          <div
            class="option"
            [class.option--active]="index === activeIndex()"
            [class.option--selected]="option.value === value()"
            [class.option--disabled]="option.disabled === true"
            [id]="optionId(index)"
            role="option"
            [attr.aria-selected]="option.value === value()"
            [attr.aria-disabled]="option.disabled === true"
            (click)="select(option)"
            (mouseenter)="activate(index)">
            @if (option.icon; as iconName) {
              <app-icon [name]="iconName" [size]="16" />
            }
            <span class="option__text">
              <span class="option__label">{{ option.label }}</span>
              @if (option.description; as description) {
                <span class="option__description">{{ description }}</span>
              }
            </span>
            @if (option.value === value()) {
              <span class="option__check"><app-icon name="check" [size]="16" /></span>
            }
          </div>
        } @empty {
          <div class="panel--empty">{{ emptyMessage() }}</div>
        }
      </div>
    }
  `
})
export class DropdownComponent {
  readonly options = input.required<readonly DropdownOption[]>();
  readonly value = input<string | null>(null);
  readonly placeholder = input('Select…');
  readonly emptyMessage = input('Nothing to choose from');
  readonly ariaLabel = input<string | null>(null);
  readonly disabled = input(false);
  readonly size = input<DropdownSize>('md');
  readonly align = input<'start' | 'end'>('start');

  readonly valueChange = output<string>();
  readonly openedChange = output<boolean>();

  protected readonly open = signal(false);
  protected readonly activeIndex = signal(-1);

  private readonly triggerRef = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly listboxRef = viewChild<ElementRef<HTMLElement>>('listbox');
  private readonly document = inject(DOCUMENT);

  protected readonly listboxId = `app-dropdown-list-${nextDropdownId++}`;

  protected readonly triggerClass = computed(() => `trigger trigger--${this.size()}`);
  protected readonly selectedOption = computed(
    () => this.options().find((option) => option.value === this.value()) ?? null
  );
  protected readonly activeDescendantId = computed(() =>
    this.open() && this.activeIndex() >= 0 ? this.optionId(this.activeIndex()) : null
  );

  constructor() {
    effect((onCleanup) => {
      if (!this.open()) {
        return;
      }
      const closeOnOutsidePress = (event: Event): void => {
        const target = event.target;
        if (target instanceof Node && this.panelContains(target)) {
          return;
        }
        this.close();
      };
      this.document.addEventListener('pointerdown', closeOnOutsidePress, true);
      onCleanup(() => this.document.removeEventListener('pointerdown', closeOnOutsidePress, true));
    });

    effect(() => {
      const index = this.activeIndex();
      const isOpen = this.open();
      if (!isOpen || index < 0) {
        return;
      }
      // The list is rendered on the same tick as the index change, so wait for
      // the DOM before asking the browser to scroll the row into view.
      queueMicrotask(() => this.scrollActiveIntoView(index));
    });
  }

  protected optionId(index: number): string {
    return `${this.listboxId}-option-${index}`;
  }

  protected toggle(): void {
    if (this.disabled()) {
      return;
    }
    this.open() ? this.close() : this.show();
  }

  protected show(): void {
    const selected = this.options().findIndex((option) => option.value === this.value());
    const firstEnabled = this.options().findIndex((option) => option.disabled !== true);
    const start = selected >= 0 ? selected : firstEnabled;
    this.activeIndex.set(start);
    this.open.set(true);
    this.openedChange.emit(true);
  }

  protected close(): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.activeIndex.set(-1);
    this.openedChange.emit(false);
    this.restoreFocus();
  }

  protected select(option: DropdownOption): void {
    if (option.disabled === true) {
      return;
    }
    this.valueChange.emit(option.value);
    this.open.set(false);
    this.activeIndex.set(-1);
    this.openedChange.emit(false);
    this.restoreFocus();
  }

  protected activate(index: number): void {
    if (this.options()[index]?.disabled === true) {
      return;
    }
    this.activeIndex.set(index);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open() ? this.move(1) : this.show();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.open() ? this.move(-1) : this.show();
        break;
      case 'Home':
        if (this.open()) {
          event.preventDefault();
          this.activeIndex.set(this.firstEnabledIndex());
        }
        break;
      case 'End':
        if (this.open()) {
          event.preventDefault();
          this.activeIndex.set(this.lastEnabledIndex());
        }
        break;
      case 'Enter':
      case ' ': {
        if (!this.open()) {
          event.preventDefault();
          this.show();
          return;
        }
        const option = this.options()[this.activeIndex()];
        if (option) {
          event.preventDefault();
          this.select(option);
        }
        break;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.close();
        }
        break;
      case 'Tab':
        this.close();
        break;
      default:
        break;
    }
  }

  private move(step: number): void {
    const total = this.options().length;
    if (total === 0) {
      return;
    }
    let index = this.activeIndex();
    for (let attempts = 0; attempts < total; attempts += 1) {
      index = (index + step + total) % total;
      if (this.options()[index]?.disabled !== true) {
        this.activeIndex.set(index);
        return;
      }
    }
  }

  private firstEnabledIndex(): number {
    return this.options().findIndex((option) => option.disabled !== true);
  }

  private lastEnabledIndex(): number {
    const options = this.options();
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (options[index].disabled !== true) {
        return index;
      }
    }
    return -1;
  }

  /**
   * Returns focus to the trigger after the panel closes, so keyboard users are
   * not dropped back on the document body.
   */
  private restoreFocus(): void {
    this.triggerRef().nativeElement.focus();
  }

  private scrollActiveIntoView(index: number): void {
    this.listboxRef()?.nativeElement
      .querySelector<HTMLElement>(`#${CSS.escape(this.optionId(index))}`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  private panelContains(target: Node): boolean {
    return (
      this.triggerRef().nativeElement.contains(target) ||
      (this.listboxRef()?.nativeElement.contains(target) ?? false)
    );
  }
}