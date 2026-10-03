import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly title: string;
  readonly message: string | null;
  readonly createdAt: number;
}

const DEFAULT_DURATION_MS: Readonly<Record<ToastTone, number>> = {
  info: 5000,
  success: 5000,
  warning: 8000,
  error: 12000
};

/** Beyond this the stack stops being readable and older entries are dropped. */
const MAX_VISIBLE_TOASTS = 4;

/**
 * Transient feedback queue.
 *
 * Features report outcomes here instead of owning local banner state, so a
 * failed ticket update raised from the properties sidebar is presented the same
 * way as a failed sign in on the login screen.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly toastSignal = signal<readonly Toast[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  readonly toasts = this.toastSignal.asReadonly();

  info(title: string, message?: string): void {
    this.push('info', title, message);
  }

  success(title: string, message?: string): void {
    this.push('success', title, message);
  }

  warning(title: string, message?: string): void {
    this.push('warning', title, message);
  }

  error(title: string, message?: string): void {
    this.push('error', title, message);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toastSignal.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.toastSignal.set([]);
  }

  private push(tone: ToastTone, title: string, message?: string): void {
    const toast: Toast = {
      id: this.nextId++,
      tone,
      title,
      message: message?.trim() ? message.trim() : null,
      createdAt: Date.now()
    };

    this.toastSignal.update((toasts) => [toast, ...toasts].slice(0, MAX_VISIBLE_TOASTS));

    const duration = DEFAULT_DURATION_MS[tone];
    this.timers.set(
      toast.id,
      setTimeout(() => this.dismiss(toast.id), duration)
    );
  }
}