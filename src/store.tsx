import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { createSeedState } from './data/seed';
import { allocate, boxId, courierOf, nowOf } from './logic/derive';
import { derive, type Derived } from './logic/derive';
import { clock } from './logic/format';
import type { AppState, ExceptionType, Order, Problem } from './types';

export type Action =
  | { type: 'CREATE_LABEL'; orderId: string; pickupId: string; release: boolean }
  | { type: 'SEND_TO_PICKING'; orderId: string }
  | { type: 'PICKED'; orderId: string }
  | { type: 'SHELF_SHORT'; orderId: string; sku: string; found: number }
  | { type: 'PACKED'; orderId: string }
  | { type: 'STAGE_BOX'; orderId: string }
  | { type: 'BOX_MISSING'; orderId: string }
  | { type: 'BOX_FOUND'; orderId: string }
  | { type: 'COLLECT'; pickupId: string }
  | { type: 'MOVE_PICKUP'; fromPickupId: string; toPickupId: string }
  | { type: 'REQUEST_TRANSFER'; sku: string; qty: number }
  | { type: 'RECEIVE_TRANSFER'; transferId: string }
  | { type: 'LOG_PROBLEM'; problem: Omit<Problem, 'id' | 'createdAt' | 'status'> }
  | { type: 'RESOLVE_PROBLEM'; id: string; resolution: string }
  | { type: 'CLOCK'; delta: number }
  | { type: 'RESET' };

const OFFICE = 'Office';
const WH = 'Warehouse';

function withOrder(s: AppState, id: string, fn: (o: Order) => Order): AppState {
  return { ...s, orders: s.orders.map((o) => (o.id === id ? fn(o) : o)) };
}
function addEvent(o: Order, at: number, text: string, by: string): Order {
  return { ...o, events: [...o.events, { at, text, by }] };
}
function newProblem(s: AppState, p: Omit<Problem, 'id' | 'createdAt' | 'status'>): [AppState, Problem] {
  const prob: Problem = { ...p, id: `EX-${s.seq.problem}`, createdAt: nowOf(s), status: 'open' };
  return [{ ...s, problems: [prob, ...s.problems], seq: { ...s.seq, problem: s.seq.problem + 1 } }, prob];
}
/** Close open problems that the action just fixed, so the list never holds stale items. */
function autoResolve(s: AppState, match: (p: Problem) => boolean, resolution: string): AppState {
  const now = nowOf(s);
  return {
    ...s,
    problems: s.problems.map((p) => (p.status === 'open' && match(p) ? { ...p, status: 'resolved', resolution, resolvedAt: now } : p)),
  };
}

export function reducer(s: AppState, a: Action): AppState {
  const now = nowOf(s);
  switch (a.type) {
    case 'CREATE_LABEL': {
      const pu = s.pickups.find((p) => p.id === a.pickupId);
      if (!pu) return s;
      const c = courierOf(pu.courierId);
      let next = withOrder(s, a.orderId, (o) => {
        let u: Order = { ...o, label: { pickupId: pu.id, tracking: `TRK${s.seq.tracking}`, createdAt: now } };
        u = addEvent(u, now, `Label created – ${c.name}, pickup ${clock(pu.time)}`, OFFICE);
        if (a.release && u.stage === 'processing') u = addEvent({ ...u, stage: 'picking' }, now, 'Sent to warehouse for picking', OFFICE);
        return u;
      });
      next = { ...next, seq: { ...next.seq, tracking: next.seq.tracking + 1 } };
      return autoResolve(next, (p) => p.orderId === a.orderId && p.type === 'Missing label', `Label created – ${c.name}, pickup ${clock(pu.time)}.`);
    }
    case 'SEND_TO_PICKING':
      return withOrder(s, a.orderId, (o) => (o.stage === 'processing' ? addEvent({ ...o, stage: 'picking' }, now, 'Sent to warehouse for picking', OFFICE) : o));
    case 'PICKED': {
      const al = allocate(s).lines[a.orderId];
      if (!al || al.some((l) => !l.reserved)) return s; // cannot pick what is not on the shelf
      return withOrder(s, a.orderId, (o) => (o.stage === 'picking' ? addEvent({ ...o, stage: 'packing' }, now, 'Items picked, moved to packing', WH) : o));
    }
    case 'SHELF_SHORT': {
      // Items already at the packing bench are off the shelf but still counted in Main.
      const atBench = s.orders.filter((o) => o.stage === 'packing').flatMap((o) => o.lines).filter((l) => l.sku === a.sku).reduce((n, l) => n + l.qty, 0);
      const before = s.stock[a.sku]?.main ?? 0;
      const after = Math.min(before, a.found + atBench);
      let next: AppState = { ...s, stock: { ...s.stock, [a.sku]: { ...s.stock[a.sku], main: after } } };
      next = withOrder(next, a.orderId, (o) => addEvent(o, now, `Picker: only ${a.found} of ${a.sku} on the shelf – stock corrected`, WH));
      [next] = newProblem(next, {
        orderId: a.orderId, sku: a.sku, type: 'Stock not on shelf', priority: 'medium', owner: 'Meera (Office)',
        description: `System showed ${before} at Main, picker found ${a.found} on the shelf. Main stock corrected to ${after}. Find out where the rest went.`,
      });
      return next;
    }
    case 'PACKED': {
      const o = s.orders.find((x) => x.id === a.orderId);
      if (!o || o.stage !== 'packing' || !o.label) return s;
      const stock = { ...s.stock };
      for (const l of o.lines) stock[l.sku] = { ...stock[l.sku], main: Math.max(0, stock[l.sku].main - l.qty) };
      return withOrder({ ...s, stock }, a.orderId, (x) => addEvent({ ...x, stage: 'packed' }, now, `Items scanned and verified – box ${boxId(x)} packed`, WH));
    }
    case 'STAGE_BOX':
      return withOrder(s, a.orderId, (o) => {
        if (o.stage !== 'packed' || !o.label) return o;
        const lane = s.pickups.find((p) => p.id === o.label!.pickupId)?.lane;
        return addEvent({ ...o, stage: 'staged' }, now, `Box placed in Lane ${lane}`, WH);
      });
    case 'BOX_MISSING': {
      const o = s.orders.find((x) => x.id === a.orderId)!;
      const pu = s.pickups.find((p) => p.id === o.label?.pickupId);
      let next = withOrder(s, a.orderId, (x) => addEvent({ ...x, boxMissing: true }, now, `Box ${boxId(x)} not found in Lane ${pu?.lane}`, WH));
      [next] = newProblem(next, {
        orderId: a.orderId, type: 'Box misplaced', priority: 'high', owner: 'Ravi (Warehouse)',
        description: `Box ${boxId(o)} not found in Lane ${pu?.lane}. ${pu ? courierOf(pu.courierId).name + ' pickup at ' + clock(pu.time) + '.' : ''}`,
      });
      return next;
    }
    case 'BOX_FOUND': {
      const o = s.orders.find((x) => x.id === a.orderId)!;
      const lane = s.pickups.find((p) => p.id === o.label?.pickupId)?.lane;
      const next = withOrder(s, a.orderId, (x) => addEvent({ ...x, boxMissing: false, stage: 'staged' }, now, `Box ${boxId(x)} found and put back in Lane ${lane}`, WH));
      return autoResolve(next, (p) => p.orderId === a.orderId && p.type === 'Box misplaced', `Box found and placed back in Lane ${lane}.`);
    }
    case 'COLLECT': {
      const pu = s.pickups.find((p) => p.id === a.pickupId);
      if (!pu) return s;
      const c = courierOf(pu.courierId);
      const going = s.orders.filter((o) => o.label?.pickupId === pu.id && o.stage === 'staged' && !o.boxMissing).map((o) => o.id);
      let next: AppState = {
        ...s,
        pickups: s.pickups.map((p) => (p.id === pu.id ? { ...p, collectedAt: now, collectedCount: going.length } : p)),
        orders: s.orders.map((o) => (going.includes(o.id) ? addEvent({ ...o, stage: 'shipped' }, now, `Collected by ${c.name}`, WH) : o)),
      };
      next = autoResolve(next, (p) => p.pickupId === pu.id && p.type === 'Pickup missed', `${c.name} collected ${going.length} box${going.length === 1 ? '' : 'es'} late at ${clock(now)}.`);
      return next;
    }
    case 'MOVE_PICKUP': {
      const from = s.pickups.find((p) => p.id === a.fromPickupId)!;
      const to = s.pickups.find((p) => p.id === a.toPickupId)!;
      const c = courierOf(to.courierId);
      let trk = s.seq.tracking;
      const moved: string[] = [];
      const orders = s.orders.map((o) => {
        if (o.label?.pickupId !== from.id || o.stage === 'shipped') return o;
        moved.push(o.id);
        let u: Order = { ...o, label: { pickupId: to.id, tracking: `TRK${trk++}`, createdAt: now } };
        const wasInLane = u.stage === 'staged';
        if (wasInLane) u = { ...u, stage: 'packed' };
        return addEvent(u, now, `New label – ${c.name}, pickup ${clock(to.time)}${wasInLane ? `. Move box from Lane ${from.lane} to Lane ${to.lane}` : ''}`, OFFICE);
      });
      const next: AppState = { ...s, orders, seq: { ...s.seq, tracking: trk } };
      return autoResolve(next, (p) => p.pickupId === from.id && p.type === 'Pickup missed', `${moved.length} order${moved.length === 1 ? '' : 's'} moved to ${c.name} ${clock(to.time)} (Lane ${to.lane}).`);
    }
    case 'REQUEST_TRANSFER': {
      if (a.qty <= 0) return s;
      return {
        ...s,
        transfers: [{ id: `TR-${s.seq.transfer}`, sku: a.sku, qty: a.qty, requestedAt: now, status: 'requested' }, ...s.transfers],
        seq: { ...s.seq, transfer: s.seq.transfer + 1 },
      };
    }
    case 'RECEIVE_TRANSFER': {
      const t = s.transfers.find((x) => x.id === a.transferId);
      if (!t || t.status !== 'requested') return s;
      const lvl = s.stock[t.sku];
      const qty = Math.min(t.qty, lvl.secondary);
      const before = allocate(s).lines;
      let next: AppState = {
        ...s,
        stock: { ...s.stock, [t.sku]: { main: lvl.main + qty, secondary: lvl.secondary - qty } },
        transfers: s.transfers.map((x) => (x.id === t.id ? { ...x, status: 'received', receivedAt: now, qty } : x)),
      };
      // note on every order this unblocked
      const after = allocate(next).lines;
      for (const id of Object.keys(after)) {
        const wasBlocked = before[id]?.some((l) => !l.reserved);
        const nowOk = after[id].every((l) => l.reserved);
        if (wasBlocked && nowOk) next = withOrder(next, id, (o) => addEvent(o, now, `${qty} × ${t.sku} moved from Secondary – order can be picked`, WH));
      }
      return next;
    }
    case 'LOG_PROBLEM': {
      let [next, prob] = newProblem(s, a.problem);
      if (prob.orderId) next = withOrder(next, prob.orderId, (o) => addEvent(o, now, `Exception logged: ${prob.type} (${prob.id})`, prob.owner.includes('Office') ? OFFICE : WH));
      return next;
    }
    case 'RESOLVE_PROBLEM': {
      const p = s.problems.find((x) => x.id === a.id);
      if (!p || p.status !== 'open') return s;
      let next: AppState = { ...s, problems: s.problems.map((x) => (x.id === a.id ? { ...x, status: 'resolved', resolution: a.resolution, resolvedAt: now } : x)) };
      if (p.orderId) next = withOrder(next, p.orderId, (o) => addEvent(o, now, `Exception resolved: ${p.type} (${p.id})`, p.owner.includes('Office') ? OFFICE : WH));
      return next;
    }
    case 'CLOCK':
      return { ...s, clockOffset: Math.max(0, s.clockOffset + a.delta) };
    case 'RESET':
      return createSeedState();
  }
}

export const PROBLEM_TYPES: ExceptionType[] = ['Stock not on shelf', 'Wrong item', 'Wrong quantity', 'Missing label', 'Delayed order', 'Box misplaced', 'Pickup missed', 'Damaged item', 'Other'];
export const OWNERS = ['Meera (Office)', 'Arjun (Office)', 'Ravi (Warehouse)', 'Selvam (Warehouse)', 'Joseph (Warehouse)'];

const KEY = 'fulfillment-hub:v3';
function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === 3) return parsed;
    }
  } catch {
    /* storage unavailable – fall back to seed */
  }
  return createSeedState();
}

interface Ctx {
  state: AppState;
  d: Derived;
  dispatch: (a: Action) => void;
}
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);
  const d = useMemo(() => derive(state), [state]);
  return <StoreCtx.Provider value={{ state, d, dispatch }}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('StoreProvider missing');
  return c;
}
