import { existsSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './serve-dist.mjs';

/**
 * Runs a real `development` build against a running local Supabase stack.
 *
 * The offline path is covered by verify-offline-fallback.mjs; this proves the
 * opposite: when the container is up the workspace must use PostgreSQL and must
 * never quietly fall back to mock data.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist/angular-supabase-helpdesk-system/browser');
const SHOTS = join(ROOT, 'artifacts/screenshots');

const failures = [];
const notes = [];

function check(condition, message) {
  const line = `  ${condition ? 'ok  ' : 'FAIL'} ${message}`;
  console.log(line);
  notes.push(line);
  if (!condition) {
    failures.push(message);
  }
}

function resolveBrowser() {
  const bundled = chromium.executablePath();
  if (bundled && existsSync(bundled)) {
    return bundled;
  }
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  for (const entry of readdirSync(cache)) {
    const headless = join(cache, entry, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (existsSync(headless)) {
      return headless;
    }
  }
  throw new Error('No Chromium build found in the Playwright cache.');
}

await mkdir(SHOTS, { recursive: true });
const { server, origin } = await startStaticServer(DIST, 0);
const browser = await chromium.launch({ executablePath: resolveBrowser(), headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
const apiRequests = new Set();
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));
page.on('request', (request) => {
  if (request.url().includes(':54321')) {
    apiRequests.add(request.url().split('?')[0]);
  }
});

console.log('live backend (development build, Supabase container running)');

await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
await page.locator('.auth__demo-button', { hasText: 'agent@example.com' }).click();
await page.waitForURL(/\/workspace$/, { timeout: 30000 });
await page.locator('.shell').waitFor({ state: 'visible', timeout: 30000 });
check(true, 'signed in against the running container');

// The proxy only announces a fallback when Supabase is unreachable.
const fellBack = consoleErrors.some((entry) => entry.includes('served from the offline workspace'));
check(!fellBack, 'the workspace did not fall back to mock data');

const rows = page.locator('.table__row, .cards__item');
await rows.first().waitFor({ state: 'visible', timeout: 30000 });
check((await rows.count()) > 0, 'tickets load from PostgreSQL');
check(apiRequests.size > 0, `the browser talked to the local API (${apiRequests.size} endpoints)`);

// Open the ticket that carries an internal note so row level security has to
// admit it, rather than whichever row happened to be first.
await rows.filter({ hasText: 'Attachment upload fails' }).first().click();
await page
  .locator('.detail__subject')
  .filter({ hasText: 'Attachment upload' })
  .waitFor({ state: 'visible', timeout: 20000 });
await page.locator('app-comment-item').first().waitFor({ state: 'visible', timeout: 20000 });
check(true, 'the seeded conversation loads from PostgreSQL');
check(
  (await page.locator('app-comment-item .comment--internal').count()) > 0,
  'internal notes reach an agent, proving row level security admitted them'
);

// Writes go through the RPC and the version checked update, so this is where a
// broken optimistic concurrency rule would show up against a real database.
const body = 'Confirmed against PostgreSQL, not the offline workspace.';
await page.locator('.composer__input').fill(body);
await page.locator('app-button', { hasText: 'Send reply' }).first().click();
await page
  .locator('app-comment-item')
  .filter({ hasText: body })
  .first()
  .waitFor({ state: 'visible', timeout: 20000 });
check(true, 'a reply is stored in PostgreSQL and returns in the conversation');

const priorityTrigger = page.locator('.properties__group', { hasText: 'Priority' }).locator('app-dropdown .trigger');
await priorityTrigger.click();
const urgentOption = page.locator('.panel .option', { hasText: 'Urgent' }).first();
await urgentOption.waitFor({ state: 'visible', timeout: 10000 });
await urgentOption.click();
await page
  .locator('.detail__header app-badge', { hasText: 'Urgent' })
  .first()
  .waitFor({ state: 'visible', timeout: 20000 });
check(true, 'a version checked property change is accepted by the database');

await page.screenshot({ path: join(SHOTS, 'live-backend.png') });
check(consoleErrors.length === 0, `no console errors (${consoleErrors.length})`);
if (consoleErrors.length > 0) {
  console.log(consoleErrors.slice(0, 5).map((entry) => `       ${entry}`).join('\n'));
}

await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));

console.log(failures.length === 0 ? '\nAll checks passed.' : `\n${failures.length} check(s) failed.`);
process.exitCode = failures.length === 0 ? 0 : 1;
