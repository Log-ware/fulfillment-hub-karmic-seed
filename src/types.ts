// All times are stored as minutes relative to today's 00:00.
// Negative values are yesterday, values >= 1440 are tomorrow.
export type Min = number;

export type Priority = 'priority' | 'standard';

/**
 * Where the order physically is in the flow. This is what people move forward.
 * "Blocked" and "Exception" are NOT stored stages: they are derived from
 * inventory and open problems so they can never go stale.
 */
export type Stage =
  | 'processing' // office: review order + create label
  | 'picking' // released to warehouse, items being collected
  | 'packing' // items at the packing bench
  | 'packed' // box closed + labelled, not yet in a staging lane
  | 'staged' // box sitting in its courier lane
  | 'shipped'; // courier collected it

export type DisplayStatus =
  | 'Processing'
  | 'Picking'
  | 'Packing'
  | 'Packed'
  | 'Staged'
  | 'Shipped'
  | 'Blocked'
  | 'Exception';

export interface Product {
  sku: string;
  name: string;
  variant: string;
  bin: string; // shelf location in Main warehouse
}

export interface Courier {
  id: string;
  name: string;
  speed: string;
  cost: number; // per parcel, INR
}

export interface Pickup {
  id: string;
  courierId: string;
  time: Min;
  lane: string;
  collectedAt?: Min;
  collectedCount?: number;
}

export interface OrderLine {
  sku: string;
  qty: number;
}

export interface OrderEvent {
  at: Min;
  text: string;
  by: string;
}

export interface Label {
  pickupId: string;
  tracking: string;
  createdAt: Min;
}

export interface Order {
  id: string;
  customer: string;
  city: string;
  channel: string;
  priority: Priority;
  receivedAt: Min;
  shipBy: Min;
  stage: Stage;
  lines: OrderLine[];
  label: Label | null;
  boxMissing?: boolean;
  events: OrderEvent[];
}

export interface StockLevel {
  main: number;
  secondary: number;
}

export interface Transfer {
  id: string;
  sku: string;
  qty: number;
  requestedAt: Min;
  status: 'requested' | 'received';
  receivedAt?: Min;
}

export type ExceptionType =
  | 'Stock not on shelf'
  | 'Wrong item'
  | 'Wrong quantity'
  | 'Missing label'
  | 'Delayed order'
  | 'Box misplaced'
  | 'Pickup missed'
  | 'Damaged item'
  | 'Other';

export interface Problem {
  id: string;
  orderId?: string;
  pickupId?: string;
  sku?: string;
  type: ExceptionType;
  priority: 'high' | 'medium' | 'low';
  owner: string;
  status: 'open' | 'resolved';
  createdAt: Min;
  description: string;
  resolution?: string;
  resolvedAt?: Min;
}

export interface AppState {
  version: number;
  clockOffset: number; // minutes added to the demo base time
  orders: Order[];
  stock: Record<string, StockLevel>;
  transfers: Transfer[];
  pickups: Pickup[];
  problems: Problem[];
  seq: { problem: number; transfer: number; tracking: number };
}
