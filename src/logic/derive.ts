import { COURIERS, DEMO_START, PRODUCTS } from '../data/seed';
import type { AppState, Courier, DisplayStatus, Min, Order, Pickup, Problem, Product } from '../types';
import { clock, duration, relative } from './format';

/* ------------------------------------------------------------------ */
/* Rules (kept in one place so they are easy to explain and tune)      */
/* ------------------------------------------------------------------ */

/** Typical minutes each remaining step takes. Used to judge "will this make it?" */
export const STEP_MINUTES = { processing: 20, picking: 25, packing: 15, packed: 5 } as const;
/** Extra time to fetch stock from the Secondary warehouse. */
export const TRANSFER_MINUTES = 30;
/** Safety margin: if spare time is below this, the order is at risk. */
export const RISK_BUFFER = 15;
/** Priority orders within this window are flagged "Due soon". */
export const DUE_SOON_WINDOW = 90;
/** No movement for this long while in an active step = "Stuck". */
export const STALL_MINUTES = 120;
/** Pickups within this window are "coming up". */
export const PICKUP_SOON = 60;
export const LOW_STOCK = 2;

export const nowOf = (s: AppState): Min => DEMO_START + s.clockOffset;
export const productOf = (sku: string): Product =>
  PRODUCTS.find((p) => p.sku === sku) ?? { sku, name: 'Unknown item', variant: '—', bin: '—' };
export const courierOf = (id: string): Courier => COURIERS.find((c) => c.id === id)!;
export const boxId = (o: Order) => `BX-${o.id.slice(4)}`;
export const lastUpdated = (o: Order): Min => Math.max(...o.events.map((e) => e.at));

/* ------------------------------------------------------------------ */
/* Inventory allocation                                                */
/* ------------------------------------------------------------------ */

export interface LineAlloc {
  sku: string;
  qty: number;
  reserved: boolean;
}
export interface Allocation {
  lines: Record<string, LineAlloc[]>; // by order id (only open, unpacked orders)
  reserved: Record<string, number>; // by sku
  waiting: Record<string, number>; // by sku: units on orders that could not be reserved
  demand: Record<string, number>; // by sku: all units on open unpacked orders
}

const STAGE_RANK: Record<string, number> = { packing: 0, picking: 1, processing: 2 };

/**
 * Reserve Main-warehouse stock for every order that still needs items picked.
 * Orders further along the flow keep their stock first, then priority orders,
 * then earliest ship-by. A line is either fully reserved or waiting.
 * Because this is recalculated from scratch, "Blocked" can never go stale:
 * a stock transfer or a stock correction immediately changes which orders are blocked.
 */
export function allocate(s: AppState): Allocation {
  const free: Record<string, number> = {};
  for (const [sku, lvl] of Object.entries(s.stock)) free[sku] = lvl.main;
  const res: Allocation = { lines: {}, reserved: {}, waiting: {}, demand: {} };
  const open = s.orders
    .filter((o) => o.stage in STAGE_RANK)
    .sort(
      (a, b) =>
        STAGE_RANK[a.stage] - STAGE_RANK[b.stage] ||
        (a.priority === b.priority ? 0 : a.priority === 'priority' ? -1 : 1) ||
        a.shipBy - b.shipBy ||
        a.receivedAt - b.receivedAt,
    );
  for (const o of open) {
    res.lines[o.id] = o.lines.map((l) => {
      res.demand[l.sku] = (res.demand[l.sku] ?? 0) + l.qty;
      const ok = (free[l.sku] ?? 0) >= l.qty;
      if (ok) {
        free[l.sku] -= l.qty;
        res.reserved[l.sku] = (res.reserved[l.sku] ?? 0) + l.qty;
      } else {
        res.waiting[l.sku] = (res.waiting[l.sku] ?? 0) + l.qty;
      }
      return { sku: l.sku, qty: l.qty, reserved: ok };
    });
  }
  return res;
}

export interface SkuView {
  sku: string;
  product: Product;
  main: number;
  secondary: number;
  reserved: number;
  available: number;
  demand: number;
  waiting: number;
  onTheWay: number; // requested from Secondary, not yet received
  shortfall: number; // extra units Main needs to release waiting orders
  suggestMove: number; // what we suggest moving from Secondary right now
  status: 'ok' | 'low' | 'move' | 'on-the-way' | 'short' | 'out';
  waitingOrders: string[];
}

export function skuViews(s: AppState, a: Allocation): SkuView[] {
  return PRODUCTS.map((p) => {
    const lvl = s.stock[p.sku] ?? { main: 0, secondary: 0 };
    const reserved = a.reserved[p.sku] ?? 0;
    const available = lvl.main - reserved;
    const waiting = a.waiting[p.sku] ?? 0;
    const onTheWay = s.transfers.filter((t) => t.sku === p.sku && t.status === 'requested').reduce((n, t) => n + t.qty, 0);
    const shortfall = Math.max(0, waiting - available);
    const freeSecondary = lvl.secondary - onTheWay;
    const stillNeeded = Math.max(0, shortfall - onTheWay);
    const suggestMove = Math.min(stillNeeded, freeSecondary);
    let status: SkuView['status'] = 'ok';
    if (shortfall > 0) {
      if (stillNeeded === 0) status = 'on-the-way';
      else if (freeSecondary >= stillNeeded) status = 'move';
      else if (freeSecondary > 0) status = 'short';
      else status = 'out';
    } else if (available <= LOW_STOCK) status = 'low';
    const waitingOrders = Object.entries(a.lines)
      .filter(([, ls]) => ls.some((l) => l.sku === p.sku && !l.reserved))
      .map(([id]) => id);
    return {
      sku: p.sku, product: p, main: lvl.main, secondary: lvl.secondary, reserved, available, demand: a.demand[p.sku] ?? 0,
      waiting, onTheWay, shortfall, suggestMove, status, waitingOrders,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Pickups                                                             */
/* ------------------------------------------------------------------ */

export type PickupState = 'collected' | 'missed' | 'soon' | 'later';

export function pickupState(p: Pickup, now: Min): PickupState {
  if (p.collectedAt != null) return 'collected';
  if (now > p.time) return 'missed';
  if (p.time - now <= PICKUP_SOON) return 'soon';
  return 'later';
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export type Risk = 'done' | 'overdue' | 'at-risk' | 'due-soon' | 'on-track';
export type Tone = 'red' | 'amber' | 'blue' | 'grey' | 'green';

export interface Issue {
  key: string;
  label: string;
  tone: Tone;
}

export interface OrderView {
  order: Order;
  status: DisplayStatus;
  risk: Risk;
  deadline: Min; // when the box must be ready (pickup time if booked, else ship-by)
  minutesLeft: number;
  workLeft: number;
  pickup?: Pickup;
  courier?: Courier;
  issues: Issue[];
  next: { text: string; who: 'Office' | 'Warehouse' | '—' };
  shortSkus: string[];
  noStockAnywhere: boolean;
  stalledFor: number; // 0 if not stalled
  openProblems: Problem[];
  updated: Min;
}

const BLOCKING_TYPES = new Set(['Box misplaced', 'Damaged item']);

export function orderView(s: AppState, o: Order, a: Allocation, skus: Record<string, SkuView>, now: Min): OrderView {
  const pickup = o.label ? s.pickups.find((p) => p.id === o.label!.pickupId) : undefined;
  const courier = pickup ? courierOf(pickup.courierId) : undefined;
  const lines = a.lines[o.id] ?? [];
  const shortSkus = lines.filter((l) => !l.reserved).map((l) => l.sku);
  const blocked = shortSkus.length > 0;
  const noStockAnywhere = shortSkus.some((sku) => ['out', 'short'].includes(skus[sku]?.status));
  const onTheWay = blocked && shortSkus.every((sku) => skus[sku]?.status === 'on-the-way');
  const openProblems = s.problems.filter((p) => p.status === 'open' && p.orderId === o.id);
  const hasBlockingProblem = !!o.boxMissing || openProblems.some((p) => BLOCKING_TYPES.has(p.type));
  const updated = lastUpdated(o);
  const pState = pickup ? pickupState(pickup, now) : undefined;
  const missedPickup = (o.stage === 'packed' || o.stage === 'staged') && pState === 'missed';

  // status
  let status: DisplayStatus;
  if (o.stage === 'shipped') status = 'Shipped';
  else if (hasBlockingProblem) status = 'Exception';
  else if (blocked) status = 'Blocked';
  else status = ({ processing: 'Processing', picking: 'Picking', packing: 'Packing', packed: 'Packed', staged: 'Staged' } as const)[o.stage];

  // how much work is left before the box can be in its lane
  let workLeft = 0;
  const order = ['processing', 'picking', 'packing', 'packed'] as const;
  const idx = order.indexOf(o.stage as (typeof order)[number]);
  if (idx >= 0) for (let i = idx; i < order.length; i++) workLeft += STEP_MINUTES[order[i]];
  if (blocked) workLeft += TRANSFER_MINUTES;
  if (!o.label && o.stage !== 'processing') workLeft += 10;

  const deadline = pickup && pState !== 'collected' ? Math.min(pickup.time, o.shipBy) : o.shipBy;
  const minutesLeft = deadline - now;

  let risk: Risk;
  if (o.stage === 'shipped') risk = 'done';
  else if (now > o.shipBy || missedPickup || (pickup && pState === 'missed')) risk = 'overdue';
  else if (o.stage === 'staged' && !hasBlockingProblem) risk = 'on-track';
  else if ((blocked && noStockAnywhere) || hasBlockingProblem || minutesLeft - workLeft < RISK_BUFFER) risk = 'at-risk';
  else if (o.priority === 'priority' && minutesLeft <= DUE_SOON_WINDOW) risk = 'due-soon';
  else risk = 'on-track';

  const active = ['processing', 'picking', 'packing', 'packed'].includes(o.stage);
  const stalledFor = active && now - updated >= STALL_MINUTES ? now - updated : 0;

  // issues
  const issues: Issue[] = [];
  if (risk === 'overdue') issues.push({ key: 'overdue', label: now > o.shipBy ? `Late by ${duration(now - o.shipBy)}` : 'Late', tone: 'red' });
  if (risk === 'at-risk') issues.push({ key: 'at-risk', label: 'At risk', tone: 'red' });
  if (o.boxMissing) issues.push({ key: 'box', label: 'Box missing', tone: 'red' });
  if (missedPickup) issues.push({ key: 'missed', label: 'Pickup missed', tone: 'red' });
  if (blocked) issues.push({ key: 'stock', label: noStockAnywhere ? 'No stock anywhere' : onTheWay ? 'Stock on the way' : 'Waiting for stock', tone: noStockAnywhere ? 'red' : 'amber' });
  if (!o.label && o.stage !== 'processing' && o.stage !== 'shipped') issues.push({ key: 'label', label: 'No label', tone: 'red' });
  if (stalledFor) issues.push({ key: 'stalled', label: `No progress ${duration(stalledFor)}`, tone: 'amber' });
  const otherProblems = openProblems.filter((p) => !(p.type === 'Box misplaced' && o.boxMissing) && !(p.type === 'Missing label' && !o.label) && !(p.type === 'Pickup missed' && missedPickup));
  if (otherProblems.length) issues.push({ key: 'problem', label: otherProblems.length === 1 ? `Exception: ${otherProblems[0].type}` : `${otherProblems.length} open exceptions`, tone: 'amber' });

  // next action, in plain words
  const bx = boxId(o);
  let next: OrderView['next'];
  if (o.stage === 'shipped') next = { text: 'Nothing – shipped', who: '—' };
  else if (o.boxMissing) next = { text: `Find box ${bx} (last seen in Lane ${pickup?.lane ?? '?'})`, who: 'Warehouse' };
  else if (missedPickup) next = { text: `${courier?.name} missed the ${clock(pickup!.time)} pickup – move box to another pickup`, who: 'Office' };
  else if (blocked && noStockAnywhere) next = { text: 'Not enough stock in either warehouse – contact customer or restock', who: 'Office' };
  else if (blocked && onTheWay) next = { text: 'Stock is coming from Secondary – put it on shelf and confirm', who: 'Warehouse' };
  else if (blocked) {
    const parts = shortSkus.map((sku) => `${skus[sku].suggestMove} × ${sku}`).join(', ');
    next = { text: `Bring ${parts} from Secondary warehouse`, who: 'Warehouse' };
  } else if (!o.label && o.stage !== 'processing') next = { text: 'Create the shipping label', who: 'Office' };
  else if (o.stage === 'processing') next = { text: o.label ? 'Send to warehouse for picking' : 'Create label and send to warehouse', who: 'Office' };
  else if (o.stage === 'picking') next = { text: `Pick from shelf ${o.lines.map((l) => productOf(l.sku).bin).join(', ')}`, who: 'Warehouse' };
  else if (o.stage === 'packing') next = { text: 'Scan items and pack at the packing station', who: 'Warehouse' };
  else if (o.stage === 'packed') next = { text: `Put box in Lane ${pickup?.lane} for ${courier?.name} ${clock(pickup!.time)}`, who: 'Warehouse' };
  else next = { text: `In Lane ${pickup?.lane} – ${courier?.name} pickup ${relative(pickup!.time, now)}`, who: '—' };

  return { order: o, status, risk, deadline, minutesLeft, workLeft, pickup, courier, issues, next, shortSkus, noStockAnywhere, stalledFor, openProblems, updated };
}

/* ------------------------------------------------------------------ */
/* Needs attention                                                     */
/* ------------------------------------------------------------------ */

export interface AttentionItem {
  key: string;
  rank: number; // lower = more urgent
  tone: 'red' | 'amber';
  title: string;
  detail: string;
  when: string;
  link: string;
  action: string;
  priority?: boolean;
  sortTime: number;
}

export interface Derived {
  now: Min;
  alloc: Allocation;
  skus: SkuView[];
  skuMap: Record<string, SkuView>;
  views: OrderView[];
  viewMap: Record<string, OrderView>;
  attention: AttentionItem[];
  kpi: {
    ordersToday: number;
    shippedToday: number;
    openOrders: number;
    priorityOpen: number;
    priorityAtRisk: number;
    priorityDueSoon: number;
    atRisk: number;
    blocked: number;
    readyForPickup: number;
    nextPickup?: Pickup;
    openProblems: number;
    highProblems: number;
  };
}

export function derive(s: AppState): Derived {
  const now = nowOf(s);
  const alloc = allocate(s);
  const skus = skuViews(s, alloc);
  const skuMap = Object.fromEntries(skus.map((k) => [k.sku, k]));
  const views = s.orders.map((o) => orderView(s, o, alloc, skuMap, now));
  const viewMap = Object.fromEntries(views.map((v) => [v.order.id, v]));

  const attention: AttentionItem[] = [];
  // pickup-level items
  for (const p of s.pickups.filter((x) => x.time >= 0 && x.time < 1440)) {
    const st = pickupState(p, now);
    const c = courierOf(p.courierId);
    const theirs = views.filter((v) => v.order.label?.pickupId === p.id && v.order.stage !== 'shipped');
    const inLane = theirs.filter((v) => v.order.stage === 'staged' && !v.order.boxMissing);
    if (st === 'missed' && theirs.some((v) => v.order.stage === 'staged' || v.order.stage === 'packed')) {
      attention.push({
        key: `pu-${p.id}`, rank: 0, tone: 'red', title: `${c.name} missed the ${clock(p.time)} pickup`,
        detail: `${inLane.length} box${inLane.length === 1 ? '' : 'es'} still in Lane ${p.lane}. Book another pickup or move them to a later courier.`,
        when: `${duration(now - p.time)} ago`, link: '/pickups', action: 'Sort out pickup', sortTime: p.time,
      });
    } else if (st === 'soon') {
      const notReady = theirs.filter((v) => v.order.stage !== 'staged' || v.order.boxMissing);
      if (notReady.length)
        attention.push({
          key: `pu-${p.id}`, rank: 3, tone: 'amber', title: `${c.name} pickup at ${clock(p.time)} – ${notReady.length} not in lane yet`,
          detail: `${inLane.length} box${inLane.length === 1 ? '' : 'es'} ready in Lane ${p.lane}. ${notReady.map((v) => v.order.id).join(', ')} still need${notReady.length === 1 ? 's' : ''} work.`,
          when: relative(p.time, now), link: '/pickups', action: 'Check lane', sortTime: p.time,
        });
    }
  }
  // order-level items (one row per order, most serious reason as title)
  for (const v of views) {
    const o = v.order;
    if (o.stage === 'shipped') continue;
    const missed = v.issues.some((i) => i.key === 'missed');
    if (missed) continue; // covered by the pickup row
    // Already late but rebooked and sitting in its lane: nothing anyone can do until the courier comes.
    if (o.stage === 'staged' && !o.boxMissing && v.pickup && pickupState(v.pickup, now) !== 'missed') continue;
    let rank = -1;
    let title = '';
    const pr = o.priority === 'priority';
    if (v.risk === 'overdue') { rank = 0; title = `Late – ship-by was ${o.shipBy < 0 ? 'yesterday ' : ''}${clock(o.shipBy)}`; }
    else if (o.boxMissing) { rank = 1; title = `Box ${boxId(o)} is missing`; }
    else if (v.risk === 'at-risk' && pr) { rank = 1; title = 'Priority order may miss its pickup'; }
    else if (v.status === 'Blocked') { rank = 2; title = v.noStockAnywhere ? 'Cannot be filled – not enough stock' : 'Blocked – item not at Main warehouse'; }
    else if (!o.label && o.stage !== 'processing') { rank = 2; title = 'Reached packing with no shipping label'; }
    else if (v.risk === 'at-risk') { rank = 2; title = 'May miss its pickup'; }
    else if (v.stalledFor) { rank = 4; title = `No progress for ${duration(v.stalledFor)}`; }
    else if (v.risk === 'due-soon' && o.stage !== 'staged') { rank = 5; title = 'Priority order due soon'; }
    if (rank < 0) continue;
    if (pr && rank > 0) rank -= 0.5;
    const why = v.issues.filter((i) => !['at-risk', 'overdue', 'stock', 'label', 'box', 'missed'].includes(i.key)).map((i) => i.label);
    attention.push({
      key: o.id, rank, tone: rank <= 2 ? 'red' : 'amber', title,
      detail: `${v.next.who !== '—' ? v.next.who + ': ' : ''}${v.next.text}${why.length ? ' · ' + why.join(' · ') : ''}`,
      when: v.minutesLeft >= 0 ? `${duration(v.minutesLeft)} left` : `${duration(-v.minutesLeft)} late`,
      link: `/orders/${o.id}`, action: 'Open order', priority: pr, sortTime: v.deadline,
    });
  }
  attention.sort((a, b) => a.rank - b.rank || a.sortTime - b.sortTime);

  const open = views.filter((v) => v.order.stage !== 'shipped');
  const today = s.orders.filter((o) => o.receivedAt >= 0 && o.receivedAt < 1440);
  const upcoming = s.pickups.filter((p) => p.collectedAt == null && p.time >= now).sort((a, b) => a.time - b.time);
  const kpi: Derived['kpi'] = {
    ordersToday: today.length,
    shippedToday: s.orders.filter((o) => o.stage === 'shipped' && o.events.some((e) => e.text.startsWith('Collected') && e.at >= 0)).length,
    openOrders: open.length,
    priorityOpen: open.filter((v) => v.order.priority === 'priority').length,
    priorityAtRisk: open.filter((v) => v.order.priority === 'priority' && (v.risk === 'at-risk' || v.risk === 'overdue')).length,
    priorityDueSoon: open.filter((v) => v.order.priority === 'priority' && v.risk === 'due-soon').length,
    atRisk: open.filter((v) => v.risk === 'at-risk' || v.risk === 'overdue').length,
    blocked: open.filter((v) => v.shortSkus.length > 0).length,
    readyForPickup: open.filter((v) => v.order.stage === 'staged' && !v.order.boxMissing && v.pickup && pickupState(v.pickup, now) !== 'missed').length,
    nextPickup: upcoming[0],
    openProblems: s.problems.filter((p) => p.status === 'open').length,
    highProblems: s.problems.filter((p) => p.status === 'open' && p.priority === 'high').length,
  };

  return { now, alloc, skus, skuMap, views, viewMap, attention, kpi };
}
