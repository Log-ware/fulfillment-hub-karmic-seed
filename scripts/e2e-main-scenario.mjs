const BASE = process.env.BASE_URL || 'http://localhost:5173';
import { mkdirSync } from 'node:fs'; mkdirSync('screenshots', { recursive: true });
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
const log = (...a) => console.log('✓', ...a);
const fail = (m) => { console.log('✗ FAIL', m); process.exitCode = 1; };
const check = (cond, m) => cond ? log(m) : fail(m);
const shot = (n) => p.screenshot({ path: `screenshots/e2e-${n}.png`, fullPage: true });
const kpi = async (label) => Number(await p.locator('.kpi').filter({ has: p.locator('.kpi-label', { hasText: new RegExp('^' + label + '$') }) }).locator('.kpi-value').innerText());

await p.goto('' + BASE + '/');
await p.evaluate(() => localStorage.clear());
await p.goto('' + BASE + '/#/');
await p.waitForSelector('.att-list');
// 1-2
const blocked0 = await kpi('Blocked by stock'), atRisk0 = await kpi('At risk or late'), probs0 = await kpi('Open exceptions'), ready0 = await kpi('Ready for pickup');
log(`1. Dashboard KPIs: blocked=${blocked0} atRisk=${atRisk0} problems=${probs0} ready=${ready0}`);
const heroRow = p.locator('.att', { hasText: 'ORD-24817' });
check(await heroRow.count() === 1 && (await heroRow.innerText()).includes('Priority order may miss'), '2. Priority at-risk order ORD-24817 surfaced in Needs attention');
// 3
await heroRow.getByRole('link', { name: /Open order/ }).click();
await p.waitForSelector('.od-head');
check((await p.locator('.od-title').innerText()).includes('Blocked'), '3-4. Order opened, status Blocked');
check((await p.locator('.next-step').innerText()).includes('Bring 2 × SHOE-RED-42 from Secondary'), '4. Next step names inventory block');
const nums = await p.locator('.next-step .tn-val').allInnerTexts();
check(nums[0] === '0' && nums[1] === '4', `5. Main=${nums[0]} Secondary=${nums[1]}`);
await shot('03-order-blocked');
// 6 request + receive
await p.getByRole('button', { name: 'Request transfer' }).click();
check((await p.locator('.transfer-pending').innerText()).includes('2 × SHOE-RED-42'), '6. Transfer requested (on the way)');
await p.getByRole('button', { name: /Stock arrived/ }).click();
await p.waitForTimeout(200);
// 7-8
check((await p.locator('.od-title').innerText()).includes('Picking'), '8. Order status changed Blocked → Picking');
const riskTxt = await p.locator('.od-title .risk').innerText();
check(riskTxt !== 'At risk', `8. Risk now "${riskTxt}"`);
const tl = await p.locator('.timeline').innerText();
check(tl.includes('moved from Secondary'), '8. Timeline records the transfer');
await p.goto('' + BASE + '/#/inventory'); await p.waitForSelector('.inv-table');
const row = p.locator('.inv-table tr', { hasText: 'SHOE-RED-42' });
const cells = await row.locator('td').allInnerTexts();
check(cells[3] === '2' && cells[4] === '2', `7. Inventory updated: Main=${cells[3]} Secondary=${cells[4]} Reserved=${cells[5]}`);
await shot('07-inventory-after');
// pick
await p.goto('' + BASE + '/#/orders/ORD-24817');
await p.getByRole('button', { name: /All items picked/ }).click();
await p.getByRole('button', { name: 'Open packing station' }).click();
await p.waitForSelector('.station');
// 9 correct item
const scan = p.locator('.scan-input');
await scan.fill('SOCK-WHT-3P'); await scan.press('Enter');
check((await p.locator('.result').innerText()).includes('Correct'), '9. Correct SKU (SOCK-WHT-3P) accepted');
check(await p.getByRole('button', { name: 'Mark as packed' }).isDisabled(), '9. Cannot pack yet – one item left');
// 10 wrong variant
await scan.fill('SHOE-RED-43'); await scan.press('Enter');
const bad = await p.locator('.result').innerText();
check(bad.includes('Wrong size') && bad.includes('SHOE-RED-42'), '10. Wrong variant SHOE-RED-43 rejected');
check(await p.getByRole('button', { name: 'Mark as packed' }).isDisabled(), '10. Mark as packed still disabled after mismatch');
await shot('10-mismatch');
// over-quantity
await scan.fill('SOCK-WHT-3P'); await scan.press('Enter');
check((await p.locator('.result').innerText()).includes('Too many'), '10b. Extra quantity rejected');
// 11
await scan.fill('shoe-red-42'); await scan.press('Enter');
check((await p.locator('.result').innerText()).includes('Correct'), '11. Correct SKU SHOE-RED-42 accepted (lower-case typed)');
await p.getByRole('button', { name: 'Mark as packed' }).click();
check((await p.locator('.pack-done').innerText()).includes('BX-24817'), '11. Box packed');
// 12
await p.getByRole('button', { name: /Done – box is in Lane A/ }).click();
await p.waitForTimeout(150);
check((await p.locator('.pack-done').innerText()).includes('In Lane A'), '12. Box staged in Lane A');
// 13
await p.goto('' + BASE + '/#/pickups'); await p.waitForSelector('.pk');
const card = p.locator('.pk').filter({ has: p.locator('.pk-time', { hasText: '15:30' }) });
const ctext = await card.innerText();
check(/BX-24817[\s\S]*In Lane A/.test(ctext), '13. Pickup page shows BX-24817 in Lane A for Rapid Express 15:30');
check(ctext.includes('Rapid Express') && ctext.includes('in 1h 20m'), '13. Pickup card shows courier and countdown (in 1h 20m)');
await shot('13-pickups');
// packing consumed Main stock
await p.goto(BASE + '/#/inventory'); await p.waitForSelector('.inv-table');
{ const c = await p.locator('.inv-table tr', { hasText: 'SHOE-RED-42' }).locator('td').allInnerTexts();
  const s2 = await p.locator('.inv-table tr', { hasText: 'SOCK-WHT-3P' }).locator('td').allInnerTexts();
  check(c[3] === '1' && s2[3] === '13', `13b. Packing took stock off Main (SHOE-RED-42 2→${c[3]}, SOCK-WHT-3P 14→${s2[3]})`); }
// 14-15
await p.goto('' + BASE + '/#/exceptions'); await p.waitForSelector('.ex');
const open0 = Number(await p.locator('.seg button', { hasText: 'Open' }).locator('.seg-n').innerText());
const wrong = p.locator('.ex', { hasText: 'Wrong item' });
check(await wrong.count() >= 1, `14. Exceptions list includes auto-logged "Wrong item" (open=${open0})`);
await wrong.first().getByRole('button', { name: 'Resolve' }).click();
await p.getByRole('button', { name: 'Fixed on the floor' }).click();
await p.locator('.modal textarea').fill('SHOE-RED-43 found mixed into bin A-02 – moved back to A-03');
await p.getByRole('button', { name: 'Mark resolved' }).click();
await p.waitForTimeout(150);
const open1 = Number(await p.locator('.seg button', { hasText: 'Open' }).locator('.seg-n').innerText());
check(open1 === open0 - 1, `15. Exception resolved, open count ${open0} → ${open1}`);
// 16 dashboard counts
await p.goto('' + BASE + '/#/');
await p.waitForSelector('.kpis');
const blocked1 = await kpi('Blocked by stock'), atRisk1 = await kpi('At risk or late'), probs1 = await kpi('Open exceptions'), ready1 = await kpi('Ready for pickup');
check(blocked1 === blocked0 - 2, `16. Blocked ${blocked0} → ${blocked1}`);
check(atRisk1 === atRisk0 - 1, `16. At risk ${atRisk0} → ${atRisk1}`);
check(ready1 === ready0 + 1, `16. Ready for pickup ${ready0} → ${ready1}`);
check(probs1 === probs0, `16. Open problems ${probs0} → ${probs1} (wrong item auto-logged at packing, then resolved)`);
check(await p.locator('.att', { hasText: 'ORD-24817' }).count() === 0, '16. ORD-24817 gone from Needs attention');
await shot('16-dashboard-after');
// extra: persistence
await p.reload(); await p.waitForSelector('.kpis');
check(await kpi('Blocked by stock') === blocked1, 'Extra: state survives page reload');
console.log('console errors/warnings:', errs.length ? errs : 'none');
await b.close();
