import { existsSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './serve-dist.mjs';

/**
 * Proves the development fallback for a stopped Supabase container.
 *
 * `tools/serve-dist.mjs` serves a real `development` build, which points at
 * http://127.0.0.1:54321. With no container listening there, every auth request
 * fails with a network error, which is exactly the situation that used to leave
 * the login screen saying "Could not reach the authentication server".
 *
 * The expectation is that a bundled demo identity still signs in, and that the
 * reason is logged rather than swallowed silently.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist/angular-supabase-helpdesk-system/browser');
const SHOTS = join(ROOT, 'artifacts/screenshots');

const EXPECTED_WARNING = 'Supabase container unreachable on port 54321';

const failures = [];

function check(condition, message) {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${message}`);
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

if (!existsSync(DIST)) {
  throw new Error(`No build found at ${DIST}. Run "pnpm run build:dev" first.`);
}
await mkdir(SHOTS, { recursive: true });

const { server, origin } = await startStaticServer(DIST, 0);
const browser = await chromium.launch({ executablePath: resolveBrowser(), headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const warnings = [];
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'warning') {
    warnings.push(message.text());
  }
  if (message.type() === 'error') {
    // The Supabase client logs its own failed requests; those are expected here.
    const text = message.text();
    if (!/54321|Failed to fetch|ERR_CONNECTION_REFUSED|net::/i.test(text)) {
      consoleErrors.push(text);
    }
  }
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

console.log('offline fallback (development build, Supabase container stopped)');

await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });

const demoButton = page.locator('.auth__demo-button', { hasText: 'agent@example.com' });
await demoButton.waitFor({ state: 'visible', timeout: 20000 });
check(true, 'the login screen offers the development identities');

await demoButton.click();
await page.waitForURL(/\/workspace$/, { timeout: 20000 });
await page.locator('.shell').waitFor({ state: 'visible', timeout: 20000 });
check(true, 'signing in succeeds while the container is unreachable');
check(
  !((await page.locator('.auth__error').count()) > 0),
  'the login screen does not report an unreachable authentication server'
);
check(
  warnings.some((warning) => warning.includes(EXPECTED_WARNING)),
  'the fallback reason is logged to the console'
);
check(consoleErrors.length === 0, `no unexpected console errors (${consoleErrors.length})`);
if (consoleErrors.length > 0) {
  console.log(consoleErrors.slice(0, 5).map((entry) => `       ${entry}`).join('\n'));
}

await page.screenshot({ path: join(SHOTS, 'offline-fallback.png') });
await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));

console.log(failures.length === 0 ? '\nAll checks passed.' : `\n${failures.length} check(s) failed.`);
process.exitCode = failures.length === 0 ? 0 : 1;