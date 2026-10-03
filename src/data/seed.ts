import type { AppState, Courier, Order, OrderEvent, OrderLine, Pickup, Priority, Problem, Product, Stage, StockLevel } from '../types';

/**
 * Deterministic sample data for one working day at XYZ.
 * The demo clock starts at 14:10 so there is a realistic mix of
 * finished, in-progress, late and upcoming work.
 */
export const DEMO_START: number = 14 * 60 + 10;

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const y = (hhmm: string) => t(hhmm) - 1440; // yesterday
const tm = (hhmm: string) => t(hhmm) + 1440; // tomorrow

export const PRODUCTS: Product[] = [
  { sku: 'SHOE-RED-41', name: 'Trail Runner Shoe', variant: 'Red · Size 41', bin: 'A-01' },
  { sku: 'SHOE-RED-42', name: 'Trail Runner Shoe', variant: 'Red · Size 42', bin: 'A-02' },
  { sku: 'SHOE-RED-43', name: 'Trail Runner Shoe', variant: 'Red · Size 43', bin: 'A-03' },
  { sku: 'SHOE-BLK-42', name: 'Trail Runner Shoe', variant: 'Black · Size 42', bin: 'A-04' },
  { sku: 'SHOE-BLK-43', name: 'Trail Runner Shoe', variant: 'Black · Size 43', bin: 'A-05' },
  { sku: 'SNK-WHT-40', name: 'Canvas Sneaker', variant: 'White · Size 40', bin: 'B-01' },
  { sku: 'SNK-WHT-41', name: 'Canvas Sneaker', variant: 'White · Size 41', bin: 'B-02' },
  { sku: 'SNK-WHT-42', name: 'Canvas Sneaker', variant: 'White · Size 42', bin: 'B-03' },
  { sku: 'TEE-BLK-S', name: 'Cotton Tee', variant: 'Black · S', bin: 'C-01' },
  { sku: 'TEE-BLK-M', name: 'Cotton Tee', variant: 'Black · M', bin: 'C-02' },
  { sku: 'TEE-BLK-L', name: 'Cotton Tee', variant: 'Black · L', bin: 'C-03' },
  { sku: 'TEE-WHT-M', name: 'Cotton Tee', variant: 'White · M', bin: 'C-04' },
  { sku: 'TEE-WHT-L', name: 'Cotton Tee', variant: 'White · L', bin: 'C-05' },
  { sku: 'HOOD-GRY-M', name: 'Zip Hoodie', variant: 'Grey · M', bin: 'D-01' },
  { sku: 'HOOD-GRY-L', name: 'Zip Hoodie', variant: 'Grey · L', bin: 'D-02' },
  { sku: 'SOCK-WHT-3P', name: 'Ankle Socks 3-Pack', variant: 'White', bin: 'E-01' },
  { sku: 'SOCK-BLK-3P', name: 'Ankle Socks 3-Pack', variant: 'Black', bin: 'E-02' },
  { sku: 'CAP-NVY', name: 'Baseball Cap', variant: 'Navy · One size', bin: 'E-03' },
  { sku: 'BTL-STL-750', name: 'Steel Bottle', variant: '750 ml', bin: 'F-01' },
];

export const COURIERS: Courier[] = [
  { id: 'rapid', name: 'Rapid Express', speed: 'Next day', cost: 95 },
  { id: 'quick', name: 'QuickShip', speed: '2–3 days', cost: 60 },
  { id: 'city', name: 'CityLink', speed: 'Next day (metros)', cost: 75 },
  { id: 'post', name: 'Standard Post', speed: '3–5 days', cost: 45 },
];

const PICKUPS: Pickup[] = [
  { id: 'PU-RAP-AM', courierId: 'rapid', time: t('11:00'), lane: 'A', collectedAt: t('11:06'), collectedCount: 9 },
  { id: 'PU-QS', courierId: 'quick', time: t('12:30'), lane: 'C' },
  { id: 'PU-RAP-PM', courierId: 'rapid', time: t('15:30'), lane: 'A' },
  { id: 'PU-CITY', courierId: 'city', time: t('16:30'), lane: 'B' },
  { id: 'PU-POST', courierId: 'post', time: t('18:00'), lane: 'D' },
];

// Shelf stock AFTER everything already packed/shipped today has left the shelf.
const STOCK: Record<string, StockLevel> = {
  'SHOE-RED-41': { main: 4, secondary: 6 },
  'SHOE-RED-42': { main: 0, secondary: 4 },
  'SHOE-RED-43': { main: 5, secondary: 2 },
  'SHOE-BLK-42': { main: 6, secondary: 4 },
  'SHOE-BLK-43': { main: 3, secondary: 0 },
  'SNK-WHT-40': { main: 7, secondary: 10 },
  'SNK-WHT-41': { main: 2, secondary: 8 },
  'SNK-WHT-42': { main: 5, secondary: 5 },
  'TEE-BLK-S': { main: 12, secondary: 20 },
  'TEE-BLK-M': { main: 9, secondary: 30 },
  'TEE-BLK-L': { main: 8, secondary: 15 },
  'TEE-WHT-M': { main: 10, secondary: 12 },
  'TEE-WHT-L': { main: 6, secondary: 10 },
  'HOOD-GRY-M': { main: 4, secondary: 6 },
  'HOOD-GRY-L': { main: 1, secondary: 0 },
  'SOCK-WHT-3P': { main: 14, secondary: 40 },
  'SOCK-BLK-3P': { main: 3, secondary: 24 },
  'CAP-NVY': { main: 3, secondary: 10 },
  'BTL-STL-750': { main: 5, secondary: 12 },
};

const STAGE_ORDER: Stage[] = ['processing', 'picking', 'packing', 'packed', 'staged', 'shipped'];
const OFFICE = 'Office';
const WH = 'Warehouse';

interface Spec {
  id: string;
  at: number;
  customer: string;
  city: string;
  channel: string;
  priority?: Priority;
  shipBy: number;
  stage: Stage;
  lines: [string, number][];
  pickup?: string;
  updated?: number; // time of last stage change (auto timeline)
  events?: OrderEvent[]; // full custom timeline
  boxMissing?: boolean;
}

/** Build a believable timeline from received → current stage. */
function autoEvents(s: Spec, pickups: Pickup[]): OrderEvent[] {
  const ev: OrderEvent[] = [{ at: s.at, text: `Order received from ${s.channel}`, by: 'System' }];
  const reached = STAGE_ORDER.indexOf(s.stage);
  const pu = pickups.find((p) => p.id === s.pickup);
  const end = s.stage === 'shipped' && pu?.collectedAt ? pu.collectedAt : s.updated ?? s.at + 30;
  const steps: { text: string; by: string }[] = [];
  if (s.pickup && pu) {
    const c = COURIERS.find((x) => x.id === pu.courierId)!;
    steps.push({ text: `Label created – ${c.name}, pickup ${fmt(pu.time)}`, by: OFFICE });
  }
  if (reached >= 1) steps.push({ text: 'Sent to warehouse for picking', by: OFFICE });
  if (reached >= 2) steps.push({ text: 'Items picked, moved to packing', by: WH });
  if (reached >= 3) steps.push({ text: `Items scanned and verified – box BX-${s.id.slice(4)} packed`, by: WH });
  if (reached >= 4) steps.push({ text: `Box placed in Lane ${pu?.lane ?? '?'}`, by: WH });
  if (reached >= 5) steps.push({ text: `Collected by ${pu ? COURIERS.find((x) => x.id === pu.courierId)!.name : 'courier'}`, by: WH });
  const span = Math.max(steps.length, 1);
  steps.forEach((st, i) => {
    const at = Math.round(s.at + ((end - s.at) * (i + 1)) / span);
    ev.push({ at, ...st });
  });
  return ev;
}

function fmt(m: number) {
  const mm = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}

const SPECS: Spec[] = [
  // ---- received yesterday ----
  {
    id: 'ORD-24688', at: y('16:40'), customer: 'Rahul Menon', city: 'Kochi', channel: 'Website', shipBy: y('18:00'),
    stage: 'processing', lines: [['SNK-WHT-41', 1]],
    events: [{ at: y('16:40'), text: 'Order received from Website', by: 'System' }],
  },
  { id: 'ORD-24691', at: y('17:15'), customer: 'Fatima Shaikh', city: 'Pune', channel: 'Amazon', shipBy: t('11:00'), stage: 'shipped', lines: [['TEE-BLK-M', 2]], pickup: 'PU-RAP-AM' },
  { id: 'ORD-24694', at: y('18:20'), customer: 'Vikram Iyer', city: 'Chennai', channel: 'Flipkart', shipBy: t('11:00'), stage: 'shipped', lines: [['BTL-STL-750', 1]], pickup: 'PU-RAP-AM' },
  { id: 'ORD-24697', at: y('19:05'), customer: 'Sneha Kulkarni', city: 'Mumbai', channel: 'Website', shipBy: t('16:30'), stage: 'staged', lines: [['SOCK-WHT-3P', 2]], pickup: 'PU-CITY', updated: t('10:40') },
  { id: 'ORD-24702', at: y('21:30'), customer: 'Arun Prakash', city: 'Bengaluru', channel: 'Amazon', shipBy: t('11:00'), stage: 'shipped', lines: [['SHOE-BLK-42', 1]], pickup: 'PU-RAP-AM' },

  // ---- today: shipped on the 11:00 Rapid Express pickup ----
  { id: 'ORD-24705', at: t('08:05'), customer: 'Divya Nair', city: 'Hyderabad', channel: 'Amazon', priority: 'priority', shipBy: t('11:00'), stage: 'shipped', lines: [['SHOE-RED-41', 1]], pickup: 'PU-RAP-AM' },
  { id: 'ORD-24709', at: t('08:12'), customer: 'Mohammed Irfan', city: 'Chennai', channel: 'Website', shipBy: t('11:00'), stage: 'shipped', lines: [['TEE-WHT-L', 1], ['SOCK-BLK-3P', 1]], pickup: 'PU-RAP-AM' },
  { id: 'ORD-24713', at: t('08:30'), customer: 'Lakshmi Suresh', city: 'Coimbatore', channel: 'Flipkart', shipBy: t('11:00'), stage: 'shipped', lines: [['HOOD-GRY-M', 1]], pickup: 'PU-RAP-AM' },
  { id: 'ORD-24718', at: t('08:44'), customer: 'Karan Mehta', city: 'Delhi', channel: 'Amazon', shipBy: t('12:30'), stage: 'shipped', lines: [['TEE-BLK-S', 1]], pickup: 'PU-RAP-AM' },
  { id: 'ORD-24722', at: t('09:02'), customer: 'Pooja Reddy', city: 'Hyderabad', channel: 'Website', priority: 'priority', shipBy: t('11:00'), stage: 'shipped', lines: [['SNK-WHT-40', 1]], pickup: 'PU-RAP-AM' },
  { id: 'ORD-24726', at: t('09:15'), customer: 'Nikhil Joshi', city: 'Ahmedabad', channel: 'Amazon', shipBy: t('15:30'), stage: 'shipped', lines: [['SHOE-RED-43', 1]], pickup: 'PU-RAP-AM' },

  // ---- today: in staging lanes ----
  { id: 'ORD-24745', at: t('09:30'), customer: 'Gita Raman', city: 'Madurai', channel: 'Website', shipBy: t('16:30'), stage: 'staged', lines: [['BTL-STL-750', 1]], pickup: 'PU-CITY', updated: t('11:45') },
  {
    id: 'ORD-24760', at: t('09:40'), customer: 'Harish Kumar', city: 'Bengaluru', channel: 'Flipkart', shipBy: t('16:30'), stage: 'staged',
    lines: [['SHOE-BLK-43', 1]], pickup: 'PU-CITY', boxMissing: true,
    events: [
      { at: t('09:40'), text: 'Order received from Flipkart', by: 'System' },
      { at: t('09:55'), text: 'Label created – CityLink, pickup 16:30', by: OFFICE },
      { at: t('10:00'), text: 'Sent to warehouse for picking', by: OFFICE },
      { at: t('10:35'), text: 'Items picked, moved to packing', by: WH },
      { at: t('10:50'), text: 'Items scanned and verified – box BX-24760 packed', by: WH },
      { at: t('11:00'), text: 'Box placed in Lane B', by: WH },
      { at: t('13:05'), text: 'Lane check: box BX-24760 not found in Lane B', by: WH },
    ],
  },
  { id: 'ORD-24771', at: t('10:05'), customer: 'Neha Gupta', city: 'Jaipur', channel: 'Website', shipBy: t('12:30'), stage: 'staged', lines: [['TEE-WHT-M', 1]], pickup: 'PU-QS', updated: t('12:05') },
  { id: 'ORD-24774', at: t('10:20'), customer: 'Sanjay Pillai', city: 'Thiruvananthapuram', channel: 'Amazon', shipBy: t('12:30'), stage: 'staged', lines: [['SNK-WHT-42', 1], ['SOCK-WHT-3P', 1]], pickup: 'PU-QS', updated: t('12:15') },
  { id: 'ORD-24779', at: t('10:40'), customer: 'Anjali Verma', city: 'Lucknow', channel: 'Website', shipBy: t('18:00'), stage: 'staged', lines: [['TEE-BLK-L', 1]], pickup: 'PU-POST', updated: t('12:20') },
  { id: 'ORD-24783', at: t('10:55'), customer: 'Rohit Bansal', city: 'Chandigarh', channel: 'Flipkart', shipBy: t('16:30'), stage: 'staged', lines: [['SHOE-BLK-43', 1]], pickup: 'PU-CITY', updated: t('12:50') },
  { id: 'ORD-24786', at: t('11:10'), customer: 'Kavya Srinivasan', city: 'Chennai', channel: 'Amazon', priority: 'priority', shipBy: t('15:30'), stage: 'staged', lines: [['TEE-WHT-M', 1], ['CAP-NVY', 1]], pickup: 'PU-RAP-PM', updated: t('12:40') },
  { id: 'ORD-24790', at: t('11:20'), customer: 'Deepak Choudhary', city: 'Indore', channel: 'Website', shipBy: t('18:00'), stage: 'picking', lines: [['HOOD-GRY-L', 2]], pickup: 'PU-POST', updated: t('11:50') },
  { id: 'ORD-24792', at: t('11:35'), customer: 'Meghna Das', city: 'Kolkata', channel: 'Amazon', priority: 'priority', shipBy: t('15:30'), stage: 'staged', lines: [['SNK-WHT-42', 1]], pickup: 'PU-RAP-PM', updated: t('13:10') },
  { id: 'ORD-24795', at: t('11:48'), customer: 'Aditya Rao', city: 'Mysuru', channel: 'Flipkart', priority: 'priority', shipBy: t('15:30'), stage: 'packed', lines: [['SOCK-BLK-3P', 1], ['TEE-BLK-S', 1]], pickup: 'PU-RAP-PM', updated: t('13:55') },
  { id: 'ORD-24798', at: t('11:52'), customer: 'Ishita Banerjee', city: 'Kolkata', channel: 'Website', shipBy: t('16:30'), stage: 'packing', lines: [['TEE-BLK-M', 1]], pickup: 'PU-CITY', updated: t('13:35') },
  {
    id: 'ORD-24801', at: t('11:58'), customer: 'Gaurav Malhotra', city: 'Gurugram', channel: 'Amazon', priority: 'priority', shipBy: t('15:30'), stage: 'picking',
    lines: [['BTL-STL-750', 2]], pickup: 'PU-RAP-PM',
    events: [
      { at: t('11:58'), text: 'Order received from Amazon', by: 'System' },
      { at: t('12:04'), text: 'Label created – Rapid Express, pickup 15:30', by: OFFICE },
      { at: t('12:05'), text: 'Sent to warehouse for picking', by: OFFICE },
    ],
  },
  { id: 'ORD-24805', at: t('12:20'), customer: 'Tanvi Shah', city: 'Surat', channel: 'Flipkart', shipBy: t('18:00'), stage: 'staged', lines: [['SNK-WHT-41', 1]], pickup: 'PU-POST', updated: t('13:30') },
  { id: 'ORD-24809', at: t('12:31'), customer: 'Suresh Babu', city: 'Vellore', channel: 'Website', shipBy: t('16:30'), stage: 'picking', lines: [['SHOE-RED-42', 1]], pickup: 'PU-CITY', updated: t('12:50') },
  { id: 'ORD-24812', at: t('12:40'), customer: 'Priyanka Jain', city: 'Nagpur', channel: 'Amazon', shipBy: t('16:30'), stage: 'packing', lines: [['HOOD-GRY-M', 1], ['SOCK-WHT-3P', 1]], pickup: 'PU-CITY', updated: t('13:50') },
  { id: 'ORD-24815', at: t('12:45'), customer: 'Bhavna Kapoor', city: 'Bhopal', channel: 'Website', shipBy: t('16:30'), stage: 'picking', lines: [['SNK-WHT-40', 1], ['TEE-WHT-M', 1]], pickup: 'PU-CITY', updated: t('13:45') },
  {
    id: 'ORD-24817', at: t('12:52'), customer: 'Ananya Krishnan', city: 'Bengaluru', channel: 'Amazon', priority: 'priority', shipBy: t('15:30'), stage: 'picking',
    lines: [['SHOE-RED-42', 1], ['SOCK-WHT-3P', 1]], pickup: 'PU-RAP-PM',
    events: [
      { at: t('12:52'), text: 'Order received from Amazon', by: 'System' },
      { at: t('13:01'), text: 'Label created – Rapid Express, pickup 15:30', by: OFFICE },
      { at: t('13:02'), text: 'Sent to warehouse for picking', by: OFFICE },
      { at: t('13:20'), text: 'Picker: shelf A-02 (SHOE-RED-42) is empty', by: WH },
    ],
  },
  { id: 'ORD-24819', at: t('12:58'), customer: 'Rakesh Nair', city: 'Kozhikode', channel: 'Amazon', shipBy: t('18:00'), stage: 'picking', lines: [['SHOE-BLK-43', 1]], pickup: 'PU-POST', updated: t('13:40') },
  {
    id: 'ORD-24822', at: t('13:05'), customer: 'Varun Sethi', city: 'Delhi', channel: 'Website', priority: 'priority', shipBy: t('15:30'), stage: 'packing',
    lines: [['TEE-BLK-M', 1], ['CAP-NVY', 1]],
    events: [
      { at: t('13:05'), text: 'Order received from Website', by: 'System' },
      { at: t('13:12'), text: 'Sent to warehouse for picking', by: OFFICE },
      { at: t('13:40'), text: 'Items picked, moved to packing – no label found in shared folder', by: WH },
    ],
  },
  { id: 'ORD-24826', at: t('13:18'), customer: 'Ritu Agarwal', city: 'Kanpur', channel: 'Flipkart', shipBy: t('18:00'), stage: 'processing', lines: [['SHOE-BLK-42', 1]] },
  { id: 'ORD-24829', at: t('13:30'), customer: 'Manoj Thomas', city: 'Kochi', channel: 'Amazon', shipBy: t('18:00'), stage: 'processing', lines: [['TEE-WHT-L', 2]] },
  { id: 'ORD-24833', at: t('13:41'), customer: 'Swati Mishra', city: 'Patna', channel: 'Website', priority: 'priority', shipBy: t('16:30'), stage: 'processing', lines: [['SNK-WHT-42', 1], ['SOCK-WHT-3P', 1]] },
  { id: 'ORD-24836', at: t('13:52'), customer: 'Abhishek Yadav', city: 'Varanasi', channel: 'Amazon', shipBy: tm('18:00'), stage: 'processing', lines: [['BTL-STL-750', 1]] },
  { id: 'ORD-24838', at: t('14:01'), customer: 'Nandini Hegde', city: 'Mangaluru', channel: 'Flipkart', shipBy: tm('18:00'), stage: 'processing', lines: [['TEE-BLK-L', 1]] },
  { id: 'ORD-24840', at: t('14:06'), customer: 'Farhan Ali', city: 'Hyderabad', channel: 'Website', shipBy: tm('18:00'), stage: 'processing', lines: [['CAP-NVY', 1]] },
];

function buildOrders(): Order[] {
  let trk = 5100;
  return SPECS.map((s) => {
    const lines: OrderLine[] = s.lines.map(([sku, qty]) => ({ sku, qty }));
    const events = s.events ?? autoEvents(s, PICKUPS);
    const labelEvent = events.find((e) => e.text.startsWith('Label created'));
    return {
      id: s.id,
      customer: s.customer,
      city: s.city,
      channel: s.channel,
      priority: s.priority ?? 'standard',
      receivedAt: s.at,
      shipBy: s.shipBy,
      stage: s.stage,
      lines,
      label: s.pickup ? { pickupId: s.pickup, tracking: `TRK${trk++}`, createdAt: labelEvent?.at ?? s.at } : null,
      boxMissing: s.boxMissing,
      events,
    };
  });
}

const PROBLEMS: Problem[] = [
  {
    id: 'EX-1031', orderId: 'ORD-24691', type: 'Wrong quantity', priority: 'medium', owner: 'Ravi (Warehouse)', status: 'resolved',
    createdAt: t('10:20'), description: 'Box BX-24691 had 1 tee, order needs 2. Caught on re-check before the 11:00 pickup.',
    resolution: 'Second tee added, box re-sealed and shipped on the 11:00 Rapid Express pickup.', resolvedAt: t('10:31'),
  },
  {
    id: 'EX-1032', sku: 'SOCK-BLK-3P', type: 'Stock not on shelf', priority: 'medium', owner: 'Meera (Office)', status: 'open',
    createdAt: t('09:50'), description: 'Sheet showed 8 packs at Main, shelf E-02 only had 3. Main stock corrected to 3. Check if the other 5 went to Secondary.',
  },
  {
    id: 'EX-1033', orderId: 'ORD-24771', pickupId: 'PU-QS', type: 'Pickup missed', priority: 'high', owner: 'Arjun (Office)', status: 'open',
    createdAt: t('12:41'), description: 'QuickShip did not come for the 12:30 pickup. 2 boxes (ORD-24771, ORD-24774) still in Lane C.',
  },
  {
    id: 'EX-1034', orderId: 'ORD-24760', type: 'Box misplaced', priority: 'high', owner: 'Ravi (Warehouse)', status: 'open',
    createdAt: t('13:05'), description: 'Box BX-24760 not found in Lane B during the 13:00 lane check. CityLink pickup at 16:30.',
  },
  {
    id: 'EX-1035', orderId: 'ORD-24822', type: 'Missing label', priority: 'high', owner: 'Meera (Office)', status: 'open',
    createdAt: t('13:42'), description: 'Priority order reached the packing bench but there is no shipping label in the shared folder.',
  },
];

export function createSeedState(): AppState {
  return {
    version: 3,
    clockOffset: 0,
    orders: buildOrders(),
    stock: JSON.parse(JSON.stringify(STOCK)),
    transfers: [],
    pickups: JSON.parse(JSON.stringify(PICKUPS)),
    problems: JSON.parse(JSON.stringify(PROBLEMS)),
    seq: { problem: 1036, transfer: 201, tracking: 5200 },
  };
}
