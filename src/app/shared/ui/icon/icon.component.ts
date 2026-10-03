import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconName } from '../../../core/models/database.types';

/**
 * The single icon set of the workspace. Every glyph is inline SVG on a 24x24 grid
 * drawn with `currentColor`, so an icon inherits the colour of whatever contains
 * it and there is no sprite request.
 *
 * Pass `label` when the icon is the only content of a control; leave it unset for
 * decorative glyphs, which are then hidden from assistive technology.
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'icon-host', '[style.--icon-size.px]': 'size()' },
  styles: `
    :host {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      width: var(--icon-size);
      height: var(--icon-size);
      line-height: 0;
    }
  `,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label()"
      [attr.aria-hidden]="label() ? null : 'true'"
      focusable="false">
      @switch (name()) {
        @case ('ticket') {
          <path d="M4 9.5V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5Z" />
          <path d="M14 6.5v11" stroke-dasharray="2 3" />
        }
        @case ('user') {
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
        }
        @case ('customers') {
          <circle cx="9.5" cy="8" r="3.25" />
          <path d="M3.5 19.5a6 6 0 0 1 12 0" />
          <path d="M16.5 5.2a3.25 3.25 0 0 1 0 6" />
          <path d="M17.5 14.4a6 6 0 0 1 3.2 5.1" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        }
        @case ('table') {
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M9.5 9.5v10" />
        }
        @case ('lock') {
          <rect x="4.75" y="10.5" width="14.5" height="9.5" rx="2" />
          <path d="M8.25 10.5V7.75a3.75 3.75 0 0 1 7.5 0v2.75" />
        }
        @case ('unlock') {
          <rect x="4.75" y="10.5" width="14.5" height="9.5" rx="2" />
          <path d="M8.25 10.5V7.75a3.75 3.75 0 0 1 7.16-1.5" />
        }
        @case ('close') {
          <path d="m6 6 12 12M18 6 6 18" />
        }
        @case ('send') {
          <path d="M21 3 10.75 13.25" />
          <path d="M21 3l-6.5 18-3.75-7.75L3 9.5 21 3Z" />
        }
        @case ('attachment') {
          <path d="M20.5 11.5 12 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 1 1 5 5l-8.25 8.25a2 2 0 1 1-2.83-2.83l7.5-7.5" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('chevron-down') {
          <path d="m6 9.5 6 6 6-6" />
        }
        @case ('check') {
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        }
        @case ('settings') {
          <circle cx="12" cy="12" r="3" />
          <path d="M19.1 14.4a1.5 1.5 0 0 0 .3 1.65l.05.05a1.85 1.85 0 1 1-2.6 2.6l-.05-.05a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.13a1.85 1.85 0 1 1-3.7 0v-.07a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.05.05a1.85 1.85 0 1 1-2.6-2.6l.05-.05a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9h-.13a1.85 1.85 0 1 1 0-3.7h.07a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.05-.05a1.85 1.85 0 1 1 2.6-2.6l.05.05a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37v-.13a1.85 1.85 0 1 1 3.7 0v.07a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.05-.05a1.85 1.85 0 1 1 2.6 2.6l-.05.05a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.13a1.85 1.85 0 1 1 0 3.7h-.07a1.5 1.5 0 0 0-1.37.9Z" />
        }
      }
    </svg>
  `
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly strokeWidth = input(1.75);
  /** Accessible name. Omit for decorative icons. */
  readonly label = input<string | null>(null);
}