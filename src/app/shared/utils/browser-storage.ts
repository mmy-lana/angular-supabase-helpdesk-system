const PREFIX = 'HELPDESK';

/**
 * Session storage access that never throws.
 *
 * `sessionStorage` rather than `localStorage` on purpose: what lands here is the
 * signed in identity and, on the showcase, the whole mock dataset, including
 * ticket text and addresses. Keeping it in the session means closing the tab
 * purges it instead of leaving it on disk for the next person to open the
 * browser.
 *
 * Private browsing modes and hardened browser profiles can make storage
 * unavailable entirely; a help desk must still render without remembering
 * anything in that case.
 */
function storage(): Storage | null {
  try {
    const candidate = globalThis.sessionStorage;
    if (!candidate) {
      return null;
    }
    const probe = `${PREFIX}_PROBE`;
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return null;
  }
}

export function readStoredJson<T>(key: string): T | null {
  const store = storage();
  if (!store) {
    return null;
  }
  const raw = store.getItem(`${PREFIX}_${key}`);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    store.removeItem(`${PREFIX}_${key}`);
    return null;
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.setItem(`${PREFIX}_${key}`, JSON.stringify(value));
  } catch {
    store.removeItem(`${PREFIX}_${key}`);
  }
}

export function clearStored(key: string): void {
  storage()?.removeItem(`${PREFIX}_${key}`);
}

/** Access token expiry margin, in seconds, applied when restoring a Supabase session. */
export const SUPABASE_AUTO_REFRESH_MARGIN_SECONDS = 60;