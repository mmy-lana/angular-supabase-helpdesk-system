import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let notifications: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    notifications = new NotificationService();
  });

  afterEach(() => {
    notifications.clear();
    vi.useRealTimers();
  });

  it('queues the newest toast first', () => {
    notifications.info('Views refreshed');
    notifications.success('Ticket saved');

    expect(notifications.toasts().map((toast) => toast.title)).toEqual([
      'Ticket saved',
      'Views refreshed'
    ]);
  });

  it('normalises a missing message to null', () => {
    notifications.warning('  ');
    expect(notifications.toasts()[0].message).toBeNull();

    notifications.warning('Heads up', '  disk is filling up  ');
    expect(notifications.toasts()[0].message).toBe('disk is filling up');
  });

  it('dismisses itself after the tone specific delay', () => {
    notifications.success('Ticket saved');
    vi.advanceTimersByTime(4999);
    expect(notifications.toasts()).toHaveLength(1);

    vi.advanceTimersByTime(2);
    expect(notifications.toasts()).toHaveLength(0);
  });

  it('keeps failures on screen longer than confirmations', () => {
    notifications.error('Ticket could not be updated');
    vi.advanceTimersByTime(8000);
    expect(notifications.toasts()).toHaveLength(1);

    vi.advanceTimersByTime(4001);
    expect(notifications.toasts()).toHaveLength(0);
  });

  it('drops the oldest toast once the stack gets long', () => {
    for (let index = 0; index < 6; index += 1) {
      notifications.info(`Toast ${index}`);
    }

    const visible = notifications.toasts();
    expect(visible).toHaveLength(4);
    expect(visible[0].title).toBe('Toast 5');
  });

  it('cancels the pending timer when a toast is dismissed by hand', () => {
    notifications.info('Ticket saved');
    const [toast] = notifications.toasts();

    notifications.dismiss(toast.id);
    expect(notifications.toasts()).toHaveLength(0);

    vi.advanceTimersByTime(20_000);
    expect(notifications.toasts()).toHaveLength(0);
  });
});