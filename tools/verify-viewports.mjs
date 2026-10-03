import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './serve-dist.mjs';

/**
 * Headless verification of a built workspace.
 *
 * Serves `dist` and drives it in headless Chromium at every viewport the layout
 * contract names: 360, 390, 430, 768, 1024 and 1440 pixels wide. Every check is
 * an assertion about behaviour or layout, not about markup internals, and each
 * viewport ends with a screenshot so the result can be looked at.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist/angular-supabase-helpdesk-system/browser');
const SHOTS = join(ROOT, 'artifacts/screenshots');

const VIEWPORTS = [
  { name: '360-small-android', width: 360, height: 740, expectDock: true, expectRail: false },
  { name: '390-phone', width: 390, height: 844, expectDock: true, expectRail: false },
  { name: '430-phone-max', width: 430, height: 932, expectDock: true, expectRail: false },
  { name: '768-tablet', width: 768, height: 1024, expectDock: false, expectRail: true },
  { name: '1024-compact-desktop', width: 1024, height: 768, expectDock: false, expectRail: true },
  { name: '1440-desktop', width: 1440, height: 900, expectDock: false, expectRail: true }
];

const failures = [];
const notes = [];

function check(condition, message) {
  if (condition) {
    notes.push(`  ok   ${message}`);
  } else {
    failures.push(message);
    notes.push(`  FAIL ${message}`);
  }
}

function resolveBrowser() {
  const bundled = chromium.executablePath();
  if (bundled && existsSync(bundled)) {
    return bundled;
  }

  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) {
    throw new Error('No Playwright browser cache found.');
  }

  const candidates = [];
  for (const entry of readdirSyncSafe(cache)) {
    const headless = join(cache, entry, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    const full = join(cache, entry, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (existsSync(headless)) {
      candidates.push(headless);
    }
    if (existsSync(full)) {
      candidates.push(full);
    }
  }
  if (candidates.length === 0) {
    throw new Error('No Chromium build found in the Playwright cache.');
  }
  return candidates.sort().at(-1);
}

function readdirSyncSafe(directory) {
  try {
    return require('node:fs').readdirSync(directory);
  } catch {
    return [];
  }
}

/** Waits for a locator to report a specific number of elements. */
async function waitForCount(locator, expected, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await locator.count()) === expected) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/** Waits for an attribute to reach a value, so assertions do not race rendering. */
async function waitForAttribute(locator, name, expected, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await locator.getAttribute(name)) === expected) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function signIn(page, origin, label) {
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  const demoButton = page.locator('.auth__demo-button', { hasText: label });
  await demoButton.waitFor({ state: 'visible', timeout: 15000 });
  await demoButton.click();
  await page.waitForURL(/\/workspace$/, { timeout: 15000 });
  await page.locator('.shell').waitFor({ state: 'visible', timeout: 15000 });
}

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(0, root.scrollWidth - root.clientWidth);
  });
}

async function smallTargets(page) {
  return page.evaluate(() => {
    const selectors = 'button, a[href], [role="button"], [role="tab"], input[type="file"]';
    const offenders = [];
    for (const element of document.querySelectorAll(selectors)) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }
      // Visually hidden inputs are wrapped in a label that carries the target.
      if (element.classList.contains('sr-only')) {
        continue;
      }
      if (Math.round(rect.height) < 44 || Math.round(rect.width) < 44) {
        const label = (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 40);
        offenders.push(`${element.tagName.toLowerCase()}.${element.className || '(no class)'} ${Math.round(rect.width)}x${Math.round(rect.height)} "${label}"`);
      }
    }
    return offenders;
  });
}

async function runViewport(browser, origin, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: viewport.width < 1024,
    isMobile: viewport.width < 768
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  const header = `\n${viewport.name} (${viewport.width}x${viewport.height})`;
  notes.push(header);
  console.log(header);

  await signIn(page, origin, 'Support agent');
  check(await page.locator('.tab-bar').isVisible(), 'tab strip is visible');
  check(await page.locator('app-global-nav-rail').isVisible() === viewport.expectRail, `navigation rail ${viewport.expectRail ? 'is' : 'is not'} shown`);
  check(await page.locator('app-mobile-bottom-nav').isVisible() === viewport.expectDock, `phone dock ${viewport.expectDock ? 'is' : 'is not'} shown`);
  check((await horizontalOverflow(page)) === 0, 'no horizontal overflow on the workspace');

  // The list is docked from 1280 pixels; below that it slides over the table.
  const viewOptions = page.locator('.views__item');
  const sidebarDocked = await viewOptions.first().isVisible();
  if (!sidebarDocked) {
    await page.locator('.views-main__toggle').click();
    await viewOptions.first().waitFor({ state: 'visible', timeout: 15000 });
    check(true, 'the saved view list opens on demand below desktop width');
  } else {
    check(true, 'the saved view list is docked');
  }
  check((await viewOptions.count()) === 4, 'four saved views are listed');
  check((await page.locator('.views__count').first().textContent()) !== null, 'view counters are rendered');

  await page.locator('.views__item', { hasText: 'All unsolved tickets' }).first().click();
  if (!sidebarDocked) {
    await page.locator('.views__item').first().waitFor({ state: 'hidden', timeout: 5000 });
    check(!(await page.locator('.views__item').first().isVisible()), 'choosing a view closes the drawer');
  }
  const rows = viewport.expectDock ? page.locator('.cards__item') : page.locator('.table__row');
  await rows.first().waitFor({ state: 'visible', timeout: 15000 });
  check((await rows.count()) > 0, 'the ticket list shows rows');

  if (viewport.expectDock) {
    check((await page.locator('.table').first().isVisible()) === false, 'the table is replaced by phone cards');
  } else {
    check((await page.locator('.cards__item').count()) > 0, 'cards exist in the markup for phone widths');
  }

  await rows.first().click();
  await page.locator('.detail__subject').waitFor({ state: 'visible', timeout: 15000 });
  check((await page.locator('app-comment-item').count()) > 0, 'the conversation renders messages');

  const bodyText = `Checked at ${viewport.width}px by the verification run.`;
  await page.locator('.composer__input').fill(bodyText);
  await page.locator('app-button', { hasText: 'Send reply' }).first().click();
  await page.locator('app-comment-item', { hasText: bodyText }).first().waitFor({ state: 'visible', timeout: 15000 });
  check(true, 'a public reply is posted and appears in the thread');

  await page.locator('.composer__tab', { hasText: 'Internal note' }).first().click();
  const noteText = `Internal note added at ${viewport.width}px.`;
  await page.locator('.composer__input').fill(noteText);
  await page.locator('app-button', { hasText: 'Add note' }).first().click();
  const noteCard = page.locator('app-comment-item', { hasText: noteText }).first();
  await noteCard.waitFor({ state: 'visible', timeout: 15000 });
  check(
    await noteCard.locator('.comment--internal, .comment').first().evaluate((element) =>
      element.classList.contains('comment--internal')
    ),
    'the internal note renders in the note style'
  );

  if (viewport.width < 1024) {
    await page.locator('button[aria-label="Ticket properties"]').first().click();
    await page.locator('.properties').waitFor({ state: 'visible', timeout: 5000 });
    check(true, 'properties are reachable from the conversation header');
    await page.locator('.properties__close').first().click();
  }

  if (viewport.width < 1280) {
    await page.locator('button[aria-label="Requester details"]').first().click();
    await page.locator('.detail__context--open').waitFor({ state: 'visible', timeout: 5000 });
    check(true, 'requester context opens over the conversation');
    await page.locator('button[aria-label="Close requester details"]').click();
    await page.locator('.detail__context--open').waitFor({ state: 'hidden', timeout: 5000 });
    check(true, 'requester context closes again');
  } else {
    check(await page.locator('.detail__context').isVisible(), 'requester context is docked on a wide desktop');
  }

  const panes = await page.evaluate(() => {
    const widthOf = (selector) => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === 'none') {
        return null;
      }
      return Math.round(element.getBoundingClientRect().width);
    };
    return {
      rail: widthOf('.rail'),
      properties: widthOf('.detail__properties'),
      context: widthOf('.detail__context'),
      conversation: widthOf('.detail__conversation')
    };
  });
  notes.push(`       panes ${JSON.stringify(panes)}`);
  check(panes.rail === null || panes.rail === 52 || panes.rail === 48, 'navigation rail is 52px, 48px on tablet, or absent');
  // 440px is the floor for the docked three pane layouts; phones and tablets
  // give the conversation the whole screen by design.
  check(
    panes.conversation !== null && (viewport.width < 1024 || panes.conversation >= 440),
    `the conversation column is ${panes.conversation}px wide`
  );

  await page.screenshot({ path: join(SHOTS, `${viewport.name}.png`), fullPage: false });

  const offenders = await smallTargets(page);
  check(offenders.length === 0, `every control is at least 44x44 (${offenders.length} too small)`);
  if (offenders.length > 0) {
    notes.push(offenders.map((entry) => `       ${entry}`).join('\n'));
  }

  check(consoleErrors.length === 0, `no console errors (${consoleErrors.length})`);
  if (consoleErrors.length > 0) {
    notes.push(consoleErrors.slice(0, 5).map((entry) => `       ${entry}`).join('\n'));
  }

  console.log(notes.slice(-14).join('\n'));
  await context.close();
}

async function runCustomerCheck(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  notes.push('\ncustomer account (1280x900)');
  await signIn(page, origin, 'Customer');

  await page.locator('.views__item', { hasText: 'All unsolved tickets' }).first().click();
  const rows = page.locator('.table__row');
  await rows.first().waitFor({ state: 'visible', timeout: 15000 });
  check((await rows.count()) > 0, 'the customer sees their own tickets');

  await rows.first().click();
  await page.locator('.detail__subject').waitFor({ state: 'visible', timeout: 15000 });
  check((await page.locator('app-comment-item').count()) > 0, 'the customer sees the conversation');
  check(
    (await page.locator('app-comment-item .comment--internal').count()) === 0,
    'no internal notes are exposed to the customer'
  );
  check((await page.locator('.composer__tab', { hasText: 'Internal note' }).count()) === 0, 'no internal note tab for a customer');
  check((await page.locator('.properties__subject').count()) === 0, 'the subject is read only for a customer');
  check((await page.locator('.properties').getByText('Unassigned').count()) > 0, 'properties render as read only text for a customer');

  await page.screenshot({ path: join(SHOTS, 'customer-desktop.png') });
  await context.close();
}


async function runFlowChecks(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  notes.push('\nworkspace flows (1440x900)');
  await signIn(page, origin, 'Support agent');

  // Creating a ticket goes through the dialog and lands on the new ticket.
  await page.locator('.header__new-ticket').click();
  await page.locator('.modal').waitFor({ state: 'visible', timeout: 10000 });
  check(true, 'the new ticket dialog opens');

  await page.locator('#ticket-subject').fill('Printer on level 3 jams every page');
  await page.locator('#ticket-body').fill('It jams on the third floor printer after the last firmware update.');
  await page.locator('.modal__tag-form input').fill('hardware');
  await page.locator('.modal__tag-add').click();
  check(await waitForCount(page.locator('.modal__tag'), 1), 'a tag can be added before creating');
  await page.locator('app-button', { hasText: 'Create ticket' }).click();

  await page.locator('.detail__subject').waitFor({ state: 'visible', timeout: 15000 });
  const subject = (await page.locator('.detail__subject').textContent()) ?? '';
  check(subject.includes('Printer on level 3'), 'the new ticket opens in its own tab');
  check((await page.locator('app-comment-item').count()) === 1, 'the opening message is part of the conversation');

  // Closing an untouched tab removes it.
  const tabCountBefore = await page.locator('.tab').count();
  await page.locator('.tab').first().locator('.tab__close-button').click();
  check(await waitForCount(page.locator('.tab'), tabCountBefore - 1), 'a tab closes');

  // A tab with an unsaved draft asks before throwing the work away.
  await page.locator('.composer__input').fill('Half written reply that should not vanish.');
  await page.locator('.tab[aria-selected="true"] .tab__close-button').click();
  await page.locator('.shell__confirm').waitFor({ state: 'visible', timeout: 5000 });
  check(true, 'closing a tab with a draft asks first');
  await page.locator('.shell__confirm-button', { hasText: 'Keep editing' }).click();
  check(
    (await page.locator('.composer__input').inputValue()) === 'Half written reply that should not vanish.',
    'keeping the tab preserves the draft'
  );

  // Search finds a ticket and opens it.
  await page.locator('.header__search-input').fill('jams every page');
  await page.locator('.tab').filter({ hasText: 'Search' }).last().waitFor({ state: 'visible', timeout: 10000 });
  const searchRow = page.locator('.table__row').filter({ hasText: 'Printer on level 3' }).first();
  await searchRow.waitFor({ state: 'visible', timeout: 15000 });
  check(true, 'search returns the created ticket');
  await searchRow.click();
  await page
    .locator('.detail__subject')
    .filter({ hasText: 'Printer on level 3' })
    .waitFor({ state: 'visible', timeout: 15000 });
  check(true, 'a search result opens as a ticket');

  // Sorting reorders the list.
  await page.locator('.rail__item[aria-label="Ticket views"]').click();
  await page.locator('.table__row').first().waitFor({ state: 'visible', timeout: 10000 });
  const ticketNumbers = async () =>
    (await page.locator('td.col-number').allTextContents()).map((value) => Number(value.replace('#', '')));
  const ticketColumn = page.locator('th').filter({ hasText: 'Ticket' }).first();
  await page.locator('.table__sort', { hasText: 'Ticket' }).click();
  check(await waitForAttribute(ticketColumn, 'aria-sort', 'ascending'), 'sorting by ticket number reports ascending');
  const ascending = await ticketNumbers();
  check(
    ascending.length > 1 && ascending.every((value, index) => index === 0 || value >= ascending[index - 1]),
    'ascending order really is ascending'
  );

  await page.locator('.table__sort', { hasText: 'Ticket' }).click();
  check(await waitForAttribute(ticketColumn, 'aria-sort', 'descending'), 'sorting the same column flips direction');
  const descending = await ticketNumbers();
  check(
    descending.length > 1 && descending.every((value, index) => index === 0 || value <= descending[index - 1]),
    'descending order really is descending'
  );

  check(consoleErrors.length === 0, `no console errors during flows (${consoleErrors.length})`);
  if (consoleErrors.length > 0) {
    notes.push(consoleErrors.slice(0, 5).map((entry) => `       ${entry}`).join('\n'));
  }

  await page.screenshot({ path: join(SHOTS, 'flows-after-sort.png') });
  await context.close();
}

async function runClosedTicketCheck(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  notes.push('\nclosed ticket (1440x900)');
  await signIn(page, origin, 'Support agent');

  await page.locator('.header__search-input').fill('Audit log retention');
  const row = page.locator('.table__row').filter({ hasText: 'Audit log retention' }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });
  await row.click();
  await page
    .locator('.detail__subject')
    .filter({ hasText: 'Audit log retention' })
    .waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('.composer__closed').waitFor({ state: 'visible', timeout: 10000 });
  check((await page.locator('.composer__input').count()) === 0, 'a closed ticket has no composer');
  check(await page.locator('.properties__notice').isVisible(), 'a closed ticket explains why properties are locked');
  check((await page.locator('.properties__subject').isDisabled()) === true, 'the subject field is disabled on a closed ticket');
  check((await page.locator('app-dropdown .trigger:disabled').count()) >= 3, 'every property picker is disabled');

  await page.screenshot({ path: join(SHOTS, 'flows-closed-ticket.png') });
  await context.close();
}

async function main() {
  if (!existsSync(DIST)) {
    throw new Error(`No build found at ${DIST}. Run "pnpm run build:demo" first.`);
  }
  await mkdir(SHOTS, { recursive: true });

  const { server, origin } = await startStaticServer(DIST, 0);
  const browser = await chromium.launch({ executablePath: resolveBrowser(), headless: true });

  try {
    for (const viewport of VIEWPORTS) {
      await runViewport(browser, origin, viewport);
    }
    await runCustomerCheck(browser, origin);
    await runFlowChecks(browser, origin);
    await runClosedTicketCheck(browser, origin);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const report = `${notes.join('\n')}\n\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} check(s) failed.`}\n`;
  console.log(report);
  await writeFile(join(ROOT, 'artifacts/viewport-report.txt'), report);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

await main();