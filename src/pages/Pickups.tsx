import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal, StatusPill, useToast } from '../components/ui';
import { boxId, courierOf, pickupState, type OrderView } from '../logic/derive';
import { clock, duration, when } from '../logic/format';
import { useStore } from '../store';
import type { Pickup } from '../types';

function BoxRow({ v, missed }: { v: OrderView; missed: boolean }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const o = v.order;
  let state: { text: string; cls: string };
  if (o.stage === 'shipped') state = { text: 'Picked up', cls: 'bx-done' };
  else if (o.boxMissing) state = { text: 'Missing – not in lane', cls: 'bx-bad' };
  else if (o.stage === 'staged') state = missed ? { text: 'Pickup missed – still in lane', cls: 'bx-bad' } : { text: `In Lane ${v.pickup?.lane}`, cls: 'bx-ok' };
  else if (o.stage === 'packed') state = { text: 'Packed – not in lane yet', cls: 'bx-warn' };
  else state = { text: 'Not packed yet', cls: 'bx-wait' };
  const hasBox = ['packed', 'staged', 'shipped'].includes(o.stage);

  return (
    <li className={`bx ${state.cls}`}>
      <span className="mono bx-id">{hasBox ? boxId(o) : '—'}</span>
      <Link to={`/orders/${o.id}`} className="mono bx-order">
        {o.id}
      </Link>
      <span className="bx-prio">{o.priority === 'priority' && <span className="prio">Priority</span>}</span>
      <span className="bx-state">{hasBox ? state.text : <StatusPill status={v.status} />}</span>
      <span className="bx-act">
        {o.stage === 'packed' && (
          <button className="btn sm primary" onClick={() => { dispatch({ type: 'STAGE_BOX', orderId: o.id }); toast(`Box ${boxId(o)} placed in Lane ${v.pickup?.lane}`); }}>
            Put in Lane {v.pickup?.lane}
          </button>
        )}
        {o.stage === 'staged' && !o.boxMissing && (
          <button className="btn sm ghost" onClick={() => { dispatch({ type: 'BOX_MISSING', orderId: o.id }); toast(`Box ${boxId(o)} marked missing – exception logged`); }}>
            Can't find box
          </button>
        )}
        {o.boxMissing && (
          <button className="btn sm primary" onClick={() => { dispatch({ type: 'BOX_FOUND', orderId: o.id }); toast(`Box ${boxId(o)} found`); }}>
            Found it
          </button>
        )}
        {!hasBox && <span className="muted small">{v.next.text}</span>}
      </span>
    </li>
  );
}

function CollectModal({ p, boxes, onClose }: { p: Pickup; boxes: OrderView[]; onClose: () => void }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const c = courierOf(p.courierId);
  const inLane = boxes.filter((v) => v.order.stage === 'staged' && !v.order.boxMissing);
  const left = boxes.filter((v) => !(v.order.stage === 'staged' && !v.order.boxMissing));
  return (
    <Modal title={`${c.name} is here`} onClose={onClose} width={460}>
      <p>
        Count the boxes in <strong>Lane {p.lane}</strong> with the driver. There should be <strong className="big-num">{inLane.length}</strong>.
      </p>
      <ul className="count-list mono">
        {inLane.map((v) => (
          <li key={v.order.id}>{boxId(v.order)}</li>
        ))}
      </ul>
      {left.length > 0 && <p className="warn-note">{left.length} order(s) for this pickup are not in the lane and will stay behind: {left.map((v) => v.order.id).join(', ')}.</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={inLane.length === 0}
          onClick={() => {
            dispatch({ type: 'COLLECT', pickupId: p.id });
            toast(`${inLane.length} box${inLane.length === 1 ? '' : 'es'} handed to ${c.name}`);
            onClose();
          }}
        >
          Count matches – hand over {inLane.length}
        </button>
      </div>
    </Modal>
  );
}

function MoveForm({ p, count }: { p: Pickup; count: number }) {
  const { state, d, dispatch } = useStore();
  const toast = useToast();
  const options = state.pickups.filter((x) => x.id !== p.id && x.collectedAt == null && x.time > d.now).sort((a, b) => a.time - b.time);
  const [to, setTo] = useState(options[0]?.id ?? '');
  if (!options.length) return <span className="muted small">No other pickups left today.</span>;
  return (
    <div className="move-form">
      <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Move to pickup">
        {options.map((x) => {
          const c = courierOf(x.courierId);
          return (
            <option key={x.id} value={x.id}>
              {c.name} {clock(x.time)} · Lane {x.lane} · ₹{c.cost}
            </option>
          );
        })}
      </select>
      <button
        className="btn primary"
        onClick={() => {
          const tp = state.pickups.find((x) => x.id === to)!;
          dispatch({ type: 'MOVE_PICKUP', fromPickupId: p.id, toPickupId: to });
          toast(`${count} order(s) relabelled for ${courierOf(tp.courierId).name} – move boxes to Lane ${tp.lane}`);
        }}
      >
        Relabel & move {count} box{count === 1 ? '' : 'es'}
      </button>
    </div>
  );
}

function PickupCard({ p }: { p: Pickup }) {
  const { d, state } = useStore();
  const [collect, setCollect] = useState(false);
  const st = pickupState(p, d.now);
  const c = courierOf(p.courierId);
  const theirs = d.views
    .filter((v) => v.order.label?.pickupId === p.id && (st === 'collected' ? true : v.order.stage !== 'shipped'))
    .sort((a, b) => ['staged', 'packed', 'packing', 'picking', 'processing', 'shipped'].indexOf(a.order.stage) - ['staged', 'packed', 'packing', 'picking', 'processing', 'shipped'].indexOf(b.order.stage));
  const inLane = theirs.filter((v) => v.order.stage === 'staged' && !v.order.boxMissing);
  const notReady = theirs.filter((v) => v.order.stage !== 'staged' || v.order.boxMissing);
  const missedProblem = state.problems.find((x) => x.pickupId === p.id && x.status === 'open');

  if (st === 'missed' && theirs.length === 0) {
    return (
      <section className="pk pk-collected">
        <div className="pk-head">
          <span className="pk-time mono">{clock(p.time)}</span>
          <div className="pk-name">
            <strong>{c.name}</strong>
            <span className="muted small">Lane {p.lane}</span>
          </div>
          <span className="pk-state">Missed – all boxes rebooked</span>
        </div>
      </section>
    );
  }

  if (st === 'collected') {
    return (
      <section className="pk pk-collected">
        <div className="pk-head">
          <span className="pk-time mono">{clock(p.time)}</span>
          <div className="pk-name">
            <strong>{c.name}</strong>
            <span className="muted small">Lane {p.lane}</span>
          </div>
          <span className="pk-state ok">Collected {p.collectedCount} at {clock(p.collectedAt!)}</span>
        </div>
      </section>
    );
  }

  return (
    <section className={`pk pk-${st}`}>
      <div className="pk-head">
        <span className="pk-time mono">{clock(p.time)}</span>
        <div className="pk-name">
          <strong>{c.name}</strong>
          <span className="muted small">
            Lane {p.lane} · {c.speed}
          </span>
        </div>
        <span className={`pk-state ${st}`}>
          {st === 'missed' ? `Missed · ${duration(d.now - p.time)} ago` : `in ${duration(p.time - d.now)}`}
        </span>
      </div>
      <div className="pk-summary">
        <span>
          <strong>{inLane.length}</strong> in lane
        </span>
        {notReady.length > 0 && (
          <span className={st === 'soon' || st === 'missed' ? 'late' : ''}>
            <strong>{notReady.length}</strong> not ready
          </span>
        )}
      </div>
      {theirs.length === 0 ? (
        <p className="muted small pk-empty">No orders booked on this pickup yet.</p>
      ) : (
        <ul className="bx-list">
          {theirs.map((v) => (
            <BoxRow key={v.order.id} v={v} missed={st === 'missed'} />
          ))}
        </ul>
      )}
      <div className="pk-actions">
        {st === 'missed' ? (
          <>
            <div className="pk-missed-note">
              {c.name} did not collect. Book these boxes on another pickup today:
              {missedProblem && (
                <span className="small muted">
                  {' '}
                  (logged as <Link to="/exceptions">{missedProblem.id}</Link>)
                </span>
              )}
            </div>
            <MoveForm p={p} count={theirs.length} />
            <button className="btn ghost sm" disabled={inLane.length === 0} onClick={() => setCollect(true)}>
              Courier came late – hand over
            </button>
          </>
        ) : (
          <button className="btn" disabled={inLane.length === 0} onClick={() => setCollect(true)}>
            Courier is here – hand over {inLane.length}
          </button>
        )}
      </div>
      {collect && <CollectModal p={p} boxes={theirs} onClose={() => setCollect(false)} />}
    </section>
  );
}

export default function Pickups() {
  const { state, d } = useStore();
  const today = state.pickups.filter((p) => p.time >= 0 && p.time < 1440).sort((a, b) => {
    const rank = (p: Pickup) => { const st = pickupState(p, d.now); if (st === 'missed' && !state.orders.some((o) => o.label?.pickupId === p.id && o.stage !== 'shipped')) return 3; return { missed: 0, soon: 1, later: 2, collected: 3 }[st]; };
    return rank(a) - rank(b) || a.time - b.time;
  });
  const packedNotStaged = d.views.filter((v) => v.order.stage === 'packed');
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Staging & pickup</h1>
          <p className="lede">Each courier has its own lane. A box is only safe once it is in the right lane before the pickup time.</p>
        </div>
      </header>
      {packedNotStaged.length > 0 && (
        <div className="banner amber">
          <strong>
            {packedNotStaged.length} packed box{packedNotStaged.length === 1 ? ' is' : 'es are'} not in a lane yet:
          </strong>{' '}
          {packedNotStaged.map((v) => `${boxId(v.order)} → Lane ${v.pickup?.lane}`).join(', ')}
        </div>
      )}
      <div className="pk-grid">
        {today.map((p) => (
          <PickupCard key={p.id} p={p} />
        ))}
      </div>
      <p className="muted small foot-note">Times are today ({when(d.now)} now). Pickups are simulated – no courier system is connected.</p>
    </div>
  );
}
