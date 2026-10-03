/**
 * Recognises a failure that means "the server was not reached" rather than
 * "the server said no".
 *
 * Supabase surfaces transport problems in several shapes depending on which
 * layer gave up: a thrown `TypeError: Failed to fetch` from `fetch`, an error
 * object returned in the response envelope, and PostgREST's `TypeError:
 * NetworkError when attempting to fetch resource`. Every layer that has to
 * decide whether to fall back needs the same answer, so the matching lives here
 * instead of being repeated (and drifting) at each call site.
 *
 * A rejected credential, a constraint violation and a permission error all fail
 * to match, which is exactly the point: those must keep surfacing.
 */
export function isTransportFailure(failure: unknown): boolean {
  const message = describeFailure(failure).toLowerCase();

  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network error') ||
    message.includes('network request failed') ||
    message.includes('connection refused') ||
    message.includes('err_connection_refused') ||
    message.includes('err_internet_disconnected') ||
    message.includes('err_name_not_resolved') ||
    message.includes('err_empty_response') ||
    message.includes('websocket') ||
    message.includes('load failed')
  );
}

/** Flattens an unknown thrown value into something worth matching against. */
export function describeFailure(failure: unknown): string {
  if (failure instanceof Error) {
    return `${failure.name}: ${failure.message}`;
  }
  if (typeof failure === 'string') {
    return failure;
  }
  if (failure && typeof failure === 'object' && 'message' in failure) {
    return String((failure as { message: unknown }).message);
  }
  return String(failure);
}