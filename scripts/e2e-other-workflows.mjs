const BASE = process.env.BASE_URL || 'http://localhost:5173';
import { mkdirSync } from 'node:fs'; mkdirSync('screenshots', { recursive: true });
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
const check = (c, m) => { console.log(c ? '✓' : '✗ FAIL', m); if (!c) process.exitCode = 1; };
const rows = async (n) => { await p.waitForFunction((n) => document.querySelectorAll('.orders-table tbody tr').length === n, n, { timeout: 3000 }).catch(() => {}); return p.locator('.orders-table tbody tr').count(); };
const go = async (h, sel) => { await p.goto('' + BASE + '/#' + h); await p.waitForSelector(sel); };
await p.goto('' + BASE + '/'); await p.evaluate(() => localStorage.clear());

// Orders search + filters
await go('/orders', '.orders-table');
await p.fill('.search', 'ananya'); await p.waitForTimeout(150);
check(await rows(1) === 1, 'Search by customer finds 1 order');
await p.fill('.search', 'SHOE-RED-42'); await p.waitForTimeout(150);
check(await rows(2) === 2, 'Search by SKU finds 2 orders');
await p.fill('.search', '');
await p.selectOption('select >> nth=0', 'Blocked'); await p.waitForTimeout(200);
check(await rows(3) === 3, 'Status filter Blocked = 3');
await p.selectOption('select >> nth=1', 'priority'); await p.waitForTimeout(200);
check(await rows(1) === 1, 'Blocked + priority = 1');
await p.getByRole('button', { name: 'Clear filters' }).click();
await p.selectOption('select >> nth=2', 'label'); await p.waitForTimeout(200);
check(await rows(1) === 1, 'Issue filter "No label" = 1');
await p.selectOption('select >> nth=0', 'all'); await p.selectOption('select >> nth=2', 'all');
{ await p.waitForTimeout(150); const n = await rows(36); check(n === 36, 'All incl. shipped = ' + n); }
await go('/orders?priority=priority', '.orders-table');
check(await rows(7) === 7, 'KPI link ?priority=priority = 7 open priority');

// Missing label blocks packing even when every item checks out
await go('/packing/ORD-24822', '.station');
check((await p.locator('.banner.red').innerText()).includes('No shipping label'), 'Packing shows no-label warning for ORD-24822');
for (const sku of ['TEE-BLK-M', 'CAP-NVY']) { await p.fill('.scan-input', sku); await p.press('.scan-input', 'Enter'); }
check(await p.getByRole('button', { name: 'Mark as packed' }).isDisabled(), 'All items checked but no label → Mark as packed stays locked');
// Missing label → create label → pack
await go('/orders/ORD-24822', '.next-step');
check((await p.locator('.next-step').innerText()).includes('Create the shipping label'), 'ORD-24822 next step: create label');
await p.getByRole('button', { name: 'Create label', exact: true }).click();
check((await p.locator('.od-deadline').innerText()).includes('TRK'), 'Label created with tracking number');
await go('/exceptions', '.ex');
check(await p.locator('.ex', { hasText: 'EX-1035' }).count() === 0, 'Missing-label exception auto-resolved');

// Processing order → create label & send
await go('/orders/ORD-24833', '.next-step');
const opts = await p.locator('.pickup-opt').allInnerTexts();
check(opts.length === 3, `Label form shows ${opts.length} upcoming pickups`);
await p.getByRole('button', { name: /Create label & send to warehouse/ }).click();
check((await p.locator('.od-title').innerText()).includes('Picking'), 'Processing → Picking after label');

// Shelf short
await go('/orders/ORD-24801', '.next-step');
await p.getByRole('button', { name: 'Not on shelf?' }).click();
await p.locator('.stepper button', { hasText: '+' }).click();
await p.getByRole('button', { name: /Correct stock & log exception/ }).click();
await p.waitForTimeout(100);
check((await p.locator('.od-title').innerText()).includes('Blocked'), 'Shelf count 1 of 2 → order Blocked, stock corrected');

// Box missing → found
await go('/pickups', '.pk');
await p.locator('.bx', { hasText: 'BX-24760' }).getByRole('button', { name: 'Found it' }).click();
check((await p.locator('.bx', { hasText: 'BX-24760' }).innerText()).includes('In Lane B'), 'Missing box found → back in Lane B');

// Missed pickup → move
const qs = p.locator('.pk').filter({ has: p.locator('.pk-time', { hasText: '12:30' }) });
await qs.locator('select').selectOption('PU-CITY');
await qs.getByRole('button', { name: /Relabel & move/ }).click();
const city = p.locator('.pk').filter({ has: p.locator('.pk-time', { hasText: '16:30' }) });
check((await city.innerText()).includes('BX-24771'), 'Missed QuickShip boxes moved to CityLink');
await city.locator('.bx', { hasText: 'BX-24771' }).getByRole('button', { name: /Put in Lane B/ }).click();
await city.locator('.bx', { hasText: 'BX-24774' }).getByRole('button', { name: /Put in Lane B/ }).click();
// Collect
const rap = p.locator('.pk').filter({ has: p.locator('.pk-time', { hasText: '15:30' }) });
await rap.locator('.bx', { hasText: 'BX-24795' }).getByRole('button', { name: /Put in Lane A/ }).click();
await rap.getByRole('button', { name: /Courier is here/ }).click();
await p.screenshot({ path: 'screenshots/e2e2-collect.png' });
await p.getByRole('button', { name: /Count matches/ }).click();
check((await rap.innerText()).includes('Collected 3'), 'Rapid Express 15:30 collected 3 boxes');

// Log problem manually
await go('/exceptions', '.ex');
await p.getByRole('button', { name: '+ Log exception' }).click();
await p.selectOption('.modal select >> nth=0', 'Damaged item');
await p.fill('.modal input', 'ORD-24812');
await p.fill('.modal textarea', 'Hoodie has a torn zip – need replacement from Secondary');
await p.getByRole('button', { name: 'Log exception', exact: true }).click();
check(await p.locator('.ex', { hasText: 'Damaged item' }).count() === 1, 'Manual exception logged');
await go('/orders/ORD-24812', '.od-title');
check((await p.locator('.od-title').innerText()).includes('Exception'), 'Damaged-item exception puts order in Exception status');

// Clock
await go('/', '.kpis');
for (let i = 0; i < 6; i++) await p.getByRole('button', { name: '+15 min' }).click();
check((await p.locator('.demo-clock').innerText()) === '15:40', 'Demo clock advanced to 15:40');
await p.screenshot({ path: 'screenshots/e2e2-1540.png', fullPage: true });
await p.getByRole('button', { name: /Back to/ }).click();
// Reset
await p.getByRole('button', { name: 'Reset data' }).click();
await p.locator('.modal').getByRole('button', { name: 'Reset' }).click();
check((await p.locator('.kpi').nth(3).locator('.kpi-value').innerText()) === '3', 'Reset restores sample data');

// mobile
await p.setViewportSize({ width: 390, height: 844 });
for (const h of ['/', '/orders/ORD-24817', '/packing']) { await go(h, '.page'); await p.screenshot({ path: `screenshots/m${h.replace(/\//g, '_')}.png`, fullPage: true }); }
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); console.log('overflow px', overflow);
check(!overflow, 'No horizontal page scroll at 390px');
console.log('console:', errs.length ? errs : 'none');
await b.close();
