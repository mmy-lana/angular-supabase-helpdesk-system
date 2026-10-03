import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-workspace-shell',
  standalone: true,
  template: `
    <div class="workspace-container">
      <h1>Help Desk Workspace</h1>
    </div>
  `,
  styles: [`
    .workspace-container {
      display: flex;
      height: 100dvh;
      width: 100%;
      background-color: var(--zd-canvas);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspaceShellComponent {}
