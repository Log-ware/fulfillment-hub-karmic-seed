import { describe, expect, it } from 'vitest';
import { createSeedState } from '../data/seed';
import { reducer } from '../store';
import { derive } from './derive';

const HERO = 'ORD-24817';

describe('seed data is internally consistent', () => {
  it('every order line refers to a known SKU and every label to a known pickup', () => {
    const s = createSeedState();
    for (const o of s.orders) {
      for (const l of o.lines) expect(s.stock[l.sku], `${o.id} ${l.sku}`).toBeDefined();
      if (o.label) expect(s.pickups.some((p) => p.id === o.label!.pickupId), o.id).toBe(true);
      if (['packed', 'staged', 'shipped'].includes(o.stage)) expect(o.label, `${o.id} has box but no label`).not.toBeNull();
    }
  });
  it('shipped count on the morning pickup matches the orders', () => {
    const s = createSeedState();
    const am = s.pickups.find((p) => p.id === 'PU-RAP-AM')!;
    expect(s.orders.filter((o) => o.label?.pickupId === am.id && o.stage === 'shipped').length).toBe(am.collectedCount);
  });
});

describe('derived status and risk', () => {
  it('hero priority order is blocked by stock and at risk', () => {
    const d = derive(createSeedState());
    const v = d.viewMap[HERO];
    expect(v.status).toBe('Blocked');
    expect(v.risk).toBe('at-risk');
    expect(v.shortSkus).toEqual(['SHOE-RED-42']);
    expect(d.skuMap['SHOE-RED-42'].status).toBe('move');
    expect(d.skuMap['SHOE-RED-42'].suggestMove).toBe(2);
  });
  it('flags late, missed pickup, missing label, missing box and stalled orders', () => {
    const d = derive(createSeedState());
    expect(d.viewMap['ORD-24688'].risk).toBe('overdue');
    expect(d.viewMap['ORD-24771'].issues.map((i) => i.key)).toContain('missed');
    expect(d.viewMap['ORD-24822'].issues.map((i) => i.key)).toContain('label');
    expect(d.viewMap['ORD-24760'].status).toBe('Exception');
    expect(d.viewMap['ORD-24801'].stalledFor).toBeGreaterThanOrEqual(120);
    expect(d.viewMap['ORD-24790'].noStockAnywhere).toBe(true);
  });
  it('KPIs are calculated, not hardcoded', () => {
    const s = createSeedState();
    const d = derive(s);
    expect(d.kpi.ordersToday).toBe(s.orders.filter((o) => o.receivedAt >= 0).length);
    expect(d.kpi.blocked).toBe(3);
    expect(d.kpi.openProblems).toBe(4);
  });
});

describe('workflows', () => {
  it('picking is refused while stock is short', () => {
    const s = createSeedState();
    const after = reducer(s, { type: 'PICKED', orderId: HERO });
    expect(after.orders.find((o) => o.id === HERO)!.stage).toBe('picking');
  });

  it('transfer from Secondary unblocks both waiting orders', () => {
    let s = createSeedState();
    s = reducer(s, { type: 'REQUEST_TRANSFER', sku: 'SHOE-RED-42', qty: 2 });
    expect(derive(s).viewMap[HERO].issues.find((i) => i.key === 'stock')!.label).toBe('Stock on the way');
    s = reducer(s, { type: 'RECEIVE_TRANSFER', transferId: s.transfers[0].id });
    expect(s.stock['SHOE-RED-42']).toEqual({ main: 2, secondary: 2 });
    const d = derive(s);
    expect(d.viewMap[HERO].status).toBe('Picking');
    expect(d.viewMap['ORD-24809'].status).toBe('Picking');
    expect(d.viewMap[HERO].risk).not.toBe('at-risk');
  });

  it('full happy path: pick → pack (needs label) → stage → collect', () => {
    let s = createSeedState();
    s = reducer(s, { type: 'REQUEST_TRANSFER', sku: 'SHOE-RED-42', qty: 2 });
    s = reducer(s, { type: 'RECEIVE_TRANSFER', transferId: s.transfers[0].id });
    s = reducer(s, { type: 'PICKED', orderId: HERO });
    s = reducer(s, { type: 'PACKED', orderId: HERO });
    expect(s.stock['SHOE-RED-42'].main).toBe(1);
    s = reducer(s, { type: 'STAGE_BOX', orderId: HERO });
    s = reducer(s, { type: 'COLLECT', pickupId: 'PU-RAP-PM' });
    expect(s.orders.find((o) => o.id === HERO)!.stage).toBe('shipped');
  });

  it('a box cannot be packed without a label; creating one resolves the problem', () => {
    let s = createSeedState();
    s = reducer(s, { type: 'PACKED', orderId: 'ORD-24822' });
    expect(s.orders.find((o) => o.id === 'ORD-24822')!.stage).toBe('packing');
    s = reducer(s, { type: 'CREATE_LABEL', orderId: 'ORD-24822', pickupId: 'PU-RAP-PM', release: false });
    expect(s.problems.find((p) => p.id === 'EX-1035')!.status).toBe('resolved');
    s = reducer(s, { type: 'PACKED', orderId: 'ORD-24822' });
    expect(s.orders.find((o) => o.id === 'ORD-24822')!.stage).toBe('packed');
  });

  it('moving a missed pickup relabels boxes and closes the problem', () => {
    let s = createSeedState();
    s = reducer(s, { type: 'MOVE_PICKUP', fromPickupId: 'PU-QS', toPickupId: 'PU-CITY' });
    const o = s.orders.find((x) => x.id === 'ORD-24771')!;
    expect(o.label!.pickupId).toBe('PU-CITY');
    expect(o.stage).toBe('packed'); // must be physically moved to the new lane
    expect(s.problems.find((p) => p.id === 'EX-1033')!.status).toBe('resolved');
  });

  it('item not on shelf corrects Main stock and can block the order', () => {
    let s = createSeedState();
    s = reducer(s, { type: 'SHELF_SHORT', orderId: 'ORD-24801', sku: 'BTL-STL-750', found: 1 });
    expect(s.stock['BTL-STL-750'].main).toBe(1);
    expect(derive(s).viewMap['ORD-24801'].status).toBe('Blocked');
    expect(s.problems[0].type).toBe('Stock not on shelf');
  });

  it('advancing the clock makes upcoming pickups go missed', () => {
    let s = createSeedState();
    s = reducer(s, { type: 'CLOCK', delta: 90 }); // 15:40, after the 15:30 Rapid Express
    expect(derive(s).attention.some((a) => a.key === 'pu-PU-RAP-PM')).toBe(true);
  });
});
