import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LabelForm, ProblemForm, ResolveForm, TransferControl } from '../components/forms';
import { Empty, IssueChips, Modal, PriorityTag, RiskPill, StatusPill, useToast } from '../components/ui';
import { boxId, pickupState, productOf, type OrderView } from '../logic/derive';
import { ago, clock, duration, when } from '../logic/format';
import { useStore } from '../store';

function ShelfShortModal({ v, sku, onClose }: { v: OrderView; sku: string; onClose: () => void }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [found, setFound] = useState(0);
  const p = productOf(sku);
  return (
    <Modal title="Item not on the shelf" onClose={onClose} width={440}>
      <p>
        <strong>
          {p.name} – {p.variant}
        </strong>{' '}
        <span className="mono">({sku})</span>, shelf <strong>{p.bin}</strong>
      </p>
      <div className="form">
        <label>
          <span>How many did you actually find on the shelf?</span>
          <div className="stepper">
            <button className="btn" onClick={() => setFound(Math.max(0, found - 1))}>
              −
            </button>
            <span className="stepper-val">{found}</span>
            <button className="btn" onClick={() => setFound(found + 1)}>
              +
            </button>
          </div>
        </label>
        <p className="small muted">Main warehouse stock will be corrected to match the shelf, and an exception is logged so the office can find out where the rest went.</p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              dispatch({ type: 'SHELF_SHORT', orderId: v.order.id, sku, found });
              toast(`Stock for ${sku} corrected and exception logged`);
              onClose();
            }}
          >
            Correct stock & log exception
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NextStep({ v }: { v: OrderView }) {
  const { d, dispatch } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const o = v.order;
  const blocked = v.shortSkus.length > 0;
  const pState = v.pickup ? pickupState(v.pickup, d.now) : undefined;
  const missed = (o.stage === 'staged' || o.stage === 'packed') && pState === 'missed';

  let body: JSX.Element | null = null;
  if (o.stage === 'shipped') {
    const ev = [...o.events].reverse().find((e) => e.text.startsWith('Collected'));
    body = <p className="done-note">Shipped{ev ? ` at ${when(ev.at)}` : ''} with {v.courier?.name}. Tracking {o.label?.tracking}.</p>;
  } else if (o.boxMissing) {
    body = (
      <div className="ns-actions">
        <button className="btn primary big" onClick={() => { dispatch({ type: 'BOX_FOUND', orderId: o.id }); toast(`Box ${boxId(o)} back in Lane ${v.pickup?.lane}`); }}>
          Box found – it is in Lane {v.pickup?.lane}
        </button>
      </div>
    );
  } else if (missed) {
    body = (
      <div className="ns-actions">
        <Link to="/pickups" className="btn primary big">Go to Staging & Pickup to rebook</Link>
      </div>
    );
  } else if (blocked) {
    body = (
      <div className="ns-blocked">
        {v.shortSkus.map((sku) => {
          const p = productOf(sku);
          return (
            <div key={sku} className="ns-short">
              <div className="ns-short-head">
                <span className="mono strong">{sku}</span> {p.name} – {p.variant}
                <span className="muted small"> · shelf {p.bin}</span>
              </div>
              <TransferControl sku={sku} />
            </div>
          );
        })}
      </div>
    );
  } else if (o.stage === 'processing') {
    body = o.label ? (
      <div className="ns-actions">
        <button className="btn primary big" onClick={() => { dispatch({ type: 'SEND_TO_PICKING', orderId: o.id }); toast('Sent to warehouse for picking'); }}>
          Send to warehouse
        </button>
      </div>
    ) : (
      <LabelForm v={v} release />
    );
  } else if (!o.label) {
    body = (
      <div>
        <p className="warn-note">This order is already at {o.stage === 'packing' ? 'the packing bench' : 'the warehouse'} but has no label. It cannot be packed until the office creates one.</p>
        <LabelForm v={v} release={false} />
      </div>
    );
  } else if (o.stage === 'picking') {
    body = (
      <div className="ns-actions">
        <button className="btn primary big" onClick={() => { dispatch({ type: 'PICKED', orderId: o.id }); toast('Moved to packing'); }}>
          All items picked – send to packing
        </button>
        <span className="muted small">Item missing from its shelf? Use “Not on shelf?” next to it below.</span>
      </div>
    );
  } else if (o.stage === 'packing') {
    body = (
      <div className="ns-actions">
        <button className="btn primary big" onClick={() => nav(`/packing/${o.id}`)}>
          Open packing station
        </button>
        <span className="muted small">Items must be scanned and match the order before the box can be marked packed.</span>
      </div>
    );
  } else if (o.stage === 'packed') {
    body = (
      <div className="ns-actions">
        <button className="btn primary big" onClick={() => { dispatch({ type: 'STAGE_BOX', orderId: o.id }); toast(`Box ${boxId(o)} placed in Lane ${v.pickup?.lane}`); }}>
          Box is in Lane {v.pickup?.lane}
        </button>
      </div>
    );
  } else if (o.stage === 'staged') {
    body = (
      <div className="ns-actions">
        <Link to="/pickups" className="btn big">View Lane {v.pickup?.lane}</Link>
        <button className="btn ghost" onClick={() => { dispatch({ type: 'BOX_MISSING', orderId: o.id }); toast(`Box ${boxId(o)} marked missing – exception logged`); }}>
          Box is not in the lane
        </button>
      </div>
    );
  }

  return (
    <section className={`next-step ns-${v.risk}`}>
      <div className="ns-head">
        <span className="ns-kicker">Next step{v.next.who !== '—' ? ` · ${v.next.who}` : ''}</span>
        <h2>{v.next.text}</h2>
      </div>
      {body}
    </section>
  );
}

// Already shown by the status/risk pills or the Next step box, so not repeated as chips.
const HEADER_SKIP = ['at-risk', 'overdue', 'stock', 'label'];

export default function OrderDetail() {
  const { id } = useParams();
  const { d, state } = useStore();
  const [problemOpen, setProblemOpen] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [shortSku, setShortSku] = useState<string | null>(null);
  const v = id ? d.viewMap[id] : undefined;
  if (!v)
    return (
      <div className="page">
        <Empty title={`Order ${id} not found`}>
          <Link to="/orders">Back to orders</Link>
        </Empty>
      </div>
    );
  const o = v.order;
  const alloc = d.alloc.lines[o.id];
  const problems = state.problems.filter((p) => p.orderId === o.id);
  const done = o.stage === 'shipped';

  return (
    <div className="page">
      <Link to="/orders" className="back">
        ← All orders
      </Link>
      <header className={`od-head ${o.priority === 'priority' ? 'is-prio' : ''}`}>
        <div className="od-title">
          <h1 className="mono">{o.id}</h1>
          <PriorityTag p={o.priority} />
          <StatusPill status={v.status} />
          {!(v.risk === 'on-track' && (v.status === 'Blocked' || v.status === 'Exception')) && <RiskPill risk={v.risk} />}
        </div>
        <div className="od-meta">
          {o.customer} · {o.city} · {o.channel} · received {when(o.receivedAt)}
        </div>
        <div className="od-deadline">
          <div>
            <span className="dl-label">Ship by</span>
            <span className="dl-val mono">{when(o.shipBy)}</span>
          </div>
          <div>
            <span className="dl-label">Courier pickup</span>
            <span className="dl-val">{v.pickup ? `${v.courier!.name} ${clock(v.pickup.time)}` : 'Not booked'}</span>
            <span className="dl-sub">
              {v.pickup ? `Lane ${v.pickup.lane} · ` : ''}
              {o.label ? <span className="mono">{o.label.tracking}</span> : <span className="bad-text">No label yet</span>}
              {['packed', 'staged', 'shipped'].includes(o.stage) && <> · box <span className="mono">{boxId(o)}</span></>}
            </span>
          </div>
          <div>
            <span className="dl-label">{done ? 'Result' : 'Time left'}</span>
            <span className={`dl-val ${!done && v.minutesLeft < 0 ? 'late' : ''}`}>
              {done ? 'Shipped' : v.minutesLeft < 0 ? `${duration(-v.minutesLeft)} late` : duration(v.minutesLeft)}
            </span>
          </div>
          {!done && (
            <div>
              <span className="dl-label">Work still to do</span>
              <span className="dl-val">≈ {duration(v.workLeft)}</span>
            </div>
          )}
          {v.issues.some((i) => !HEADER_SKIP.includes(i.key)) && (
            <div className="dl-issues">
              <IssueChips issues={v.issues.filter((i) => !HEADER_SKIP.includes(i.key))} max={5} />
            </div>
          )}
        </div>
      </header>

      <NextStep v={v} />

      <div className="od-grid">
        <div className="od-left">
          <section className="panel">
            <div className="panel-head">
              <h2>Items</h2>
              <span className="muted small">Orders ship only from the Main warehouse</span>
            </div>
            <div className="table-wrap">
            <table className="table items-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Shelf</th>
                  <th>Main / Secondary</th>
                  <th>This order</th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l) => {
                  const p = productOf(l.sku);
                  const k = d.skuMap[l.sku];
                  const a = alloc?.find((x) => x.sku === l.sku);
                  return (
                    <tr key={l.sku}>
                      <td className="mono strong">{l.sku}</td>
                      <td>
                        {p.name}
                        <div className="sub">{p.variant}</div>
                      </td>
                      <td className="num strong">{l.qty}</td>
                      <td className="mono">{p.bin}</td>
                      <td>
                        <span className={k.main === 0 ? 'late strong' : ''}>{k.main}</span> / {k.secondary}
                      </td>
                      <td>
                        {!a ? (
                          <span className="ok-text">{o.stage === 'shipped' ? 'Shipped' : 'Packed in box'}</span>
                        ) : a.reserved ? (
                          <>
                            <span className="ok-text nowrap">✓ Held at Main</span>
                            {o.stage === 'picking' && (
                              <div>
                                <button className="btn ghost sm not-on-shelf" onClick={() => setShortSku(l.sku)}>
                                  Not on shelf?
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="bad-text">Not enough at Main</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Exceptions</h2>
              <button className="btn sm" onClick={() => setProblemOpen(true)}>
                + Log exception
              </button>
            </div>
            {problems.length === 0 ? (
              <p className="muted">No exceptions logged for this order.</p>
            ) : (
              <ul className="prob-mini">
                {problems.map((p) => (
                  <li key={p.id} className={p.status}>
                    <div>
                      <span className="mono small">{p.id}</span> <strong>{p.type}</strong>{' '}
                      <span className={`chip ${p.status === 'open' ? 'tone-red' : 'tone-green'}`}>{p.status === 'open' ? 'Open' : 'Resolved'}</span>
                      <div className="small">{p.description}</div>
                      {p.resolution && <div className="small ok-text">Fix: {p.resolution}</div>}
                      <div className="sub">
                        {p.owner} · {ago(p.createdAt, d.now)}
                      </div>
                    </div>
                    {p.status === 'open' && (
                      <button className="btn sm" onClick={() => setResolveId(p.id)}>
                        Resolve
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="od-right">
          <section className="panel">
            <div className="panel-head">
              <h2>Timeline</h2>
            </div>
            <ol className="timeline">
              {[...o.events].reverse().map((e, i) => (
                <li key={i}>
                  <span className="tl-time mono">{when(e.at)}</span>
                  <span className="tl-text">{e.text}</span>
                  <span className="tl-by">{e.by}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {problemOpen && <ProblemForm orderId={o.id} onClose={() => setProblemOpen(false)} />}
      {resolveId && <ResolveForm id={resolveId} onClose={() => setResolveId(null)} />}
      {shortSku && <ShelfShortModal v={v} sku={shortSku} onClose={() => setShortSku(null)} />}
    </div>
  );
}
