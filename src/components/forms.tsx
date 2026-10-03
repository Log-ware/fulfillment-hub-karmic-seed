import { useEffect, useState } from 'react';
import { courierOf, type OrderView } from '../logic/derive';
import { clock } from '../logic/format';
import { OWNERS, PROBLEM_TYPES, useStore } from '../store';
import type { ExceptionType, Pickup } from '../types';
import { Modal, StockPill, useToast } from './ui';

/* ------------------------------------------------------------------ */
/* Stock transfer: Secondary → Main                                    */
/* ------------------------------------------------------------------ */

export function TransferControl({ sku, compact }: { sku: string; compact?: boolean }) {
  const { d, state, dispatch } = useStore();
  const toast = useToast();
  const k = d.skuMap[sku];
  const [qty, setQty] = useState<number>(Math.max(1, k.suggestMove));
  const pending = state.transfers.filter((t) => t.sku === sku && t.status === 'requested');
  const freeSecondary = k.secondary - k.onTheWay;
  useEffect(() => setQty(Math.max(1, k.suggestMove)), [k.suggestMove]);

  return (
    <div className={`transfer ${compact ? 'compact' : ''}`}>
      <div className="transfer-nums">
        <div>
          <span className="tn-label">Main</span>
          <span className={`tn-val ${k.main === 0 ? 'zero' : ''}`}>{k.main}</span>
        </div>
        <div>
          <span className="tn-label">Secondary</span>
          <span className="tn-val">{k.secondary}</span>
        </div>
        <div>
          <span className="tn-label">Waiting orders need</span>
          <span className="tn-val">{k.waiting}</span>
        </div>
        {compact && (
          <div className="tn-status">
            <StockPill status={k.status} />
          </div>
        )}
      </div>

      {!compact && k.waitingOrders.length > 0 && (
        <div className="small muted transfer-who">Waiting for this item: {k.waitingOrders.join(', ')}</div>
      )}

      {pending.map((t) => (
        <div key={t.id} className="transfer-pending">
          <div>
            <strong>
              {t.qty} × {sku}
            </strong>{' '}
            on the way from Secondary <span className="muted small">({t.id}, requested {clock(t.requestedAt)})</span>
          </div>
          <button
            className="btn primary"
            onClick={() => {
              dispatch({ type: 'RECEIVE_TRANSFER', transferId: t.id });
              toast(`${t.qty} × ${sku} now on the shelf at Main`);
            }}
          >
            Stock arrived – put on shelf
          </button>
        </div>
      ))}

      {k.status === 'move' && (
        <div className="transfer-form">
          <label>
            Move
            <input type="number" min={1} max={freeSecondary} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(freeSecondary, Number(e.target.value) || 1)))} />
            from Secondary to Main
          </label>
          <button
            className="btn primary"
            onClick={() => {
              dispatch({ type: 'REQUEST_TRANSFER', sku, qty });
              toast(`Transfer requested: ${qty} × ${sku} from Secondary`);
            }}
          >
            Request transfer
          </button>
          {compact && <span className="muted small">Suggested: {k.suggestMove} (what the waiting orders need)</span>}
        </div>
      )}
      {(k.status === 'short' || k.status === 'out') && (
        <div className="transfer-out">
          {k.status === 'out'
            ? `Main is short by ${k.shortfall} and Secondary has none. Office needs to restock, offer a substitute or contact the customer.`
            : `Secondary only has ${freeSecondary} free – move it, but the order will still be short.`}
          {k.status === 'short' && (
            <button className="btn sm" onClick={() => dispatch({ type: 'REQUEST_TRANSFER', sku, qty: freeSecondary })}>
              Request all {freeSecondary}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Label creation: choose courier pickup                               */
/* ------------------------------------------------------------------ */

const SPEED_RANK: Record<string, number> = { rapid: 1, city: 2, quick: 3, post: 4 };

export function suggestPickup(v: OrderView, pickups: Pickup[], now: number): { options: { p: Pickup; ok: boolean }[]; best?: Pickup; why: string } {
  const upcoming = pickups.filter((p) => p.collectedAt == null && p.time > now && p.time < 1440).sort((a, b) => a.time - b.time);
  const options = upcoming.map((p) => ({ p, ok: p.time <= v.order.shipBy && p.time - now >= v.workLeft }));
  const ok = options.filter((o) => o.ok).map((o) => o.p);
  if (!ok.length) return { options, best: upcoming[0], why: 'No pickup meets the ship-by time – earliest pickup selected.' };
  if (v.order.priority === 'priority') {
    const best = [...ok].sort((a, b) => SPEED_RANK[a.courierId] - SPEED_RANK[b.courierId] || a.time - b.time)[0];
    return { options, best, why: 'Priority order: fastest courier that still makes the ship-by time.' };
  }
  const best = [...ok].sort((a, b) => courierOf(a.courierId).cost - courierOf(b.courierId).cost)[0];
  return { options, best, why: 'Cheapest courier that still makes the ship-by time.' };
}

export function LabelForm({ v, release, onDone }: { v: OrderView; release: boolean; onDone?: () => void }) {
  const { state, d, dispatch } = useStore();
  const toast = useToast();
  const { options, best, why } = suggestPickup(v, state.pickups, d.now);
  const [pick, setPick] = useState(best?.id ?? '');
  if (!options.length) return <p className="muted">No more courier pickups today. The label can be created tomorrow morning.</p>;
  return (
    <div className="label-form">
      <div className="pickup-options">
        {options.map(({ p, ok }) => {
          const c = courierOf(p.courierId);
          return (
            <label key={p.id} className={`pickup-opt ${pick === p.id ? 'sel' : ''} ${ok ? '' : 'late'}`}>
              <input type="radio" name={`pu-${v.order.id}`} checked={pick === p.id} onChange={() => setPick(p.id)} />
              <span className="po-time mono">{clock(p.time)}</span>
              <span className="po-name">
                <strong>{c.name}</strong>
                <span className="muted small">
                  {c.speed} · ₹{c.cost} · Lane {p.lane}
                </span>
              </span>
              <span className={`po-ok ${ok ? 'yes' : 'no'}`}>{ok ? 'Makes ship-by' : 'Too late'}</span>
            </label>
          );
        })}
      </div>
      <p className="small muted">{why}</p>
      <button
        className="btn primary big"
        disabled={!pick}
        onClick={() => {
          dispatch({ type: 'CREATE_LABEL', orderId: v.order.id, pickupId: pick, release });
          const p = state.pickups.find((x) => x.id === pick)!;
          toast(`Label created – ${courierOf(p.courierId).name} ${clock(p.time)}${release ? '. Sent to warehouse.' : ''}`);
          onDone?.();
        }}
      >
        {release ? 'Create label & send to warehouse' : 'Create label'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Log a problem                                                       */
/* ------------------------------------------------------------------ */

export function ProblemForm({ orderId, sku, onClose }: { orderId?: string; sku?: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [type, setType] = useState<ExceptionType>('Other');
  const [prio, setPrio] = useState<'high' | 'medium' | 'low'>('medium');
  const [owner, setOwner] = useState(OWNERS[0]);
  const [order, setOrder] = useState(orderId ?? '');
  const [desc, setDesc] = useState('');
  const validOrder = !order || state.orders.some((o) => o.id === order.trim().toUpperCase());
  return (
    <Modal title="Log an exception" onClose={onClose}>
      <div className="form">
        <label>
          <span>What happened?</span>
          <select value={type} onChange={(e) => setType(e.target.value as ExceptionType)}>
            {PROBLEM_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Order (optional)</span>
          <input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="ORD-24817" disabled={!!orderId} />
          {!validOrder && <span className="err">No order with that number</span>}
        </label>
        <div className="form-row">
          <label>
            <span>How urgent?</span>
            <select value={prio} onChange={(e) => setPrio(e.target.value as typeof prio)}>
              <option value="high">High – blocks shipping today</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label>
            <span>Who will fix it?</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              {OWNERS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          <span>Short description</span>
          <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Box crushed, item inside damaged" />
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!desc.trim() || !validOrder}
            onClick={() => {
              dispatch({ type: 'LOG_PROBLEM', problem: { type, priority: prio, owner, description: desc.trim(), orderId: order ? order.trim().toUpperCase() : undefined, sku } });
              toast(`Exception logged – ${type}`);
              onClose();
            }}
          >
            Log exception
          </button>
        </div>
      </div>
    </Modal>
  );
}

const QUICK_FIXES = ['Fixed on the floor', 'Stock recounted and corrected', 'Customer contacted', 'Courier rebooked', 'Item replaced', 'No action needed'];

export function ResolveForm({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const p = state.problems.find((x) => x.id === id)!;
  const [text, setText] = useState('');
  return (
    <Modal title={`Resolve ${p.id} – ${p.type}`} onClose={onClose}>
      <p className="muted">{p.description}</p>
      <div className="form">
        <span className="form-label">What was done? (tap one or type)</span>
        <div className="quick-fixes">
          {QUICK_FIXES.map((q) => (
            <button key={q} className={`chip-btn ${text === q ? 'sel' : ''}`} onClick={() => setText(q)}>
              {q}
            </button>
          ))}
        </div>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What fixed it, so the team learns from it" />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!text.trim()}
            onClick={() => {
              dispatch({ type: 'RESOLVE_PROBLEM', id, resolution: text.trim() });
              toast(`${id} resolved`);
              onClose();
            }}
          >
            Mark resolved
          </button>
        </div>
      </div>
    </Modal>
  );
}
