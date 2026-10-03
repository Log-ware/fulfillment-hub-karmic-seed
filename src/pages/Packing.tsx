import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Empty, PriorityTag, useToast } from '../components/ui';
import { boxId, productOf, type OrderView } from '../logic/derive';
import { clock, duration } from '../logic/format';
import { useStore } from '../store';

type Result = { ok: boolean; title: string; detail: string; logged?: string } | null;

function Station({ v }: { v: OrderView }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const o = v.order;
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState(1);
  const [result, setResult] = useState<Result>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setScanned({});
    setResult(null);
    setSku('');
    setQty(1);
    input.current?.focus();
  }, [o.id]);

  const complete = o.lines.every((l) => (scanned[l.sku] ?? 0) === l.qty);
  const remaining = o.lines.filter((l) => (scanned[l.sku] ?? 0) < l.qty);

  function check() {
    const code = sku.trim().toUpperCase();
    if (!code) return;
    const line = o.lines.find((l) => l.sku === code);
    const prod = productOf(code);
    const known = prod.name !== 'Unknown item';
    const nextProblemId = `EX-${state.seq.problem}`;
    if (!line) {
      // wrong item: same product, different variant is the classic mix-up
      const near = o.lines.find((l) => productOf(l.sku).name === prod.name);
      const expected = near ?? o.lines[0];
      const ep = productOf(expected.sku);
      dispatch({
        type: 'LOG_PROBLEM',
        problem: {
          orderId: o.id, sku: code, type: 'Wrong item', priority: 'medium', owner: 'Ravi (Warehouse)',
          description: `Caught at packing: scanned ${code}${known ? ` (${prod.variant})` : ''}, order needs ${expected.sku} (${ep.variant}). Check shelf ${known ? prod.bin : ep.bin} for mixed-up stock.`,
        },
      });
      setResult({
        ok: false,
        title: near ? 'Wrong size or color – do not pack' : 'Wrong item – not in this order',
        detail: `You scanned ${code}${known ? ` (${prod.name}, ${prod.variant})` : ''}. This order needs ${expected.sku} (${ep.name}, ${ep.variant}). Put it back on shelf ${known ? prod.bin : '—'}.`,
        logged: nextProblemId,
      });
    } else {
      const have = scanned[code] ?? 0;
      if (have + qty > line.qty) {
        // Counting slip at the bench: blocked here, nothing wrong on the shelf, so no problem is logged.
        setResult({ ok: false, title: 'Too many', detail: `This order needs ${line.qty} × ${code}. You have scanned ${have + qty}. Take ${have + qty - line.qty} out of the box.` });
      } else {
        setScanned({ ...scanned, [code]: have + qty });
        setResult({ ok: true, title: 'Correct', detail: `${prod.name} – ${prod.variant}: ${have + qty} of ${line.qty}` });
      }
    }
    setSku('');
    setQty(1);
    input.current?.focus();
  }

  if (o.stage === 'packed' || o.stage === 'staged') {
    return (
      <div className="station">
        <div className="pack-done">
          <div className="pd-check">✓</div>
          <h2>Box {boxId(o)} is packed</h2>
          {o.stage === 'packed' ? (
            <>
              <p>
                Put it in <strong>Lane {v.pickup?.lane}</strong> for {v.courier?.name} ({clock(v.pickup!.time)}).
              </p>
              <button
                className="btn primary big"
                onClick={() => {
                  dispatch({ type: 'STAGE_BOX', orderId: o.id });
                  toast(`Box ${boxId(o)} placed in Lane ${v.pickup?.lane}`);
                }}
              >
                Done – box is in Lane {v.pickup?.lane}
              </button>
            </>
          ) : (
            <p>
              In Lane {v.pickup?.lane}, waiting for {v.courier?.name} at {clock(v.pickup!.time)}. <Link to="/pickups">View lanes →</Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="station">
      <div className="station-head">
        <div>
          <div className="station-id">
            <span className="mono">{o.id}</span> <PriorityTag p={o.priority} compact />
          </div>
          <div className="muted">
            {o.customer} · {v.courier ? `${v.courier.name}, pickup ${clock(v.pickup!.time)} · Lane ${v.pickup!.lane}` : 'no courier yet'}
            {v.order.stage !== 'shipped' && ` · ${v.minutesLeft < 0 ? duration(-v.minutesLeft) + ' late' : duration(v.minutesLeft) + ' left'}`}
          </div>
        </div>
        <Link to={`/orders/${o.id}`} className="link small">
          Order details →
        </Link>
      </div>

      {!o.label && (
        <div className="banner red">
          <strong>No shipping label.</strong> You can check the items, but the box cannot be marked packed until the office creates the label.{' '}
          <Link to={`/orders/${o.id}`}>Create label on order page →</Link>
        </div>
      )}

      <h3 className="station-sub">1. Put these items in the box</h3>
      <div className="expect">
        {o.lines.map((l) => {
          const p = productOf(l.sku);
          const n = scanned[l.sku] ?? 0;
          const ok = n === l.qty;
          return (
            <div key={l.sku} className={`expect-item ${ok ? 'ok' : ''}`}>
              <div className="ei-qty">
                <span className="ei-n">{l.qty}×</span>
              </div>
              <div className="ei-main">
                <div className="ei-name">{p.name}</div>
                <div className="ei-variant">{p.variant}</div>
                <div className="ei-sku mono">{l.sku}</div>
              </div>
              <div className="ei-state">{ok ? <span className="ei-ok">✓ Checked</span> : <span className="ei-count">{n} of {l.qty}</span>}</div>
            </div>
          );
        })}
      </div>

      <h3 className="station-sub">2. Scan each item (or type the SKU from its tag)</h3>
      <form
        className="scan"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <input ref={input} className="scan-input mono" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Scan or type SKU" aria-label="SKU" autoComplete="off" spellCheck={false} />
        <div className="scan-qty">
          <span>Qty</span>
          <button type="button" className="btn" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Less">
            −
          </button>
          <span className="stepper-val">{qty}</span>
          <button type="button" className="btn" onClick={() => setQty(qty + 1)} aria-label="More">
            +
          </button>
        </div>
        <button type="submit" className="btn primary big" disabled={!sku.trim()}>
          Check item
        </button>
      </form>

      {result && (
        <div className={`result ${result.ok ? 'good' : 'bad'}`} role="status">
          <div className="result-title">{result.ok ? '✓ ' : '✕ '}{result.title}</div>
          <div>{result.detail}</div>
          {result.logged && <div className="small">Logged as {result.logged} so the shelf gets checked.</div>}
        </div>
      )}

      <h3 className="station-sub">3. Close the box</h3>
      <div className="pack-actions">
        <button
          className="btn primary big"
          disabled={!complete || !o.label}
          onClick={() => {
            dispatch({ type: 'PACKED', orderId: o.id });
            toast(`Box ${boxId(o)} packed`);
          }}
        >
          Mark as packed
        </button>
        {!complete && <span className="muted">Still to check: {remaining.map((l) => `${l.qty - (scanned[l.sku] ?? 0)} × ${l.sku}`).join(', ')}</span>}
        {complete && !o.label && <span className="bad-text">Waiting for label</span>}
        {Object.keys(scanned).length > 0 && (
          <button
            className="btn ghost sm"
            onClick={() => {
              setScanned({});
              setResult(null);
            }}
          >
            Start over
          </button>
        )}
      </div>
    </div>
  );
}

export default function Packing() {
  const { id } = useParams();
  const { d } = useStore();
  const nav = useNavigate();
  const queue = d.views
    .filter((v) => v.order.stage === 'packing')
    .sort((a, b) => (a.order.priority === b.order.priority ? 0 : a.order.priority === 'priority' ? -1 : 1) || a.deadline - b.deadline);
  const selected = id ? d.viewMap[id] : queue[0];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Packing station</h1>
          <p className="lede">Check every item before it goes in the box. Wrong items are stopped here, not at the customer.</p>
        </div>
      </header>
      <div className="pack-grid">
        <aside className="panel queue">
          <div className="panel-head">
            <h2>Waiting to pack</h2>
            <span className="muted small">{queue.length}</span>
          </div>
          {queue.length === 0 && <p className="muted">Nothing waiting at the packing bench.</p>}
          <ul>
            {queue.map((v) => (
              <li key={v.order.id}>
                <button className={`queue-item ${selected?.order.id === v.order.id ? 'sel' : ''} ${v.order.priority === 'priority' ? 'is-prio' : ''}`} onClick={() => nav(`/packing/${v.order.id}`)}>
                  <span className="mono strong">{v.order.id}</span>
                  {v.order.priority === 'priority' && <span className="prio">Priority</span>}
                  <span className="qi-sub">
                    {v.order.lines.length} item{v.order.lines.length === 1 ? '' : 's'} · {v.courier ? `${v.courier.name} ${clock(v.pickup!.time)}` : <span className="bad-text">no label</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="panel">
          {!selected ? (
            <Empty title="Pick an order from the list">Orders appear here once their items have been picked.</Empty>
          ) : ['packing', 'packed', 'staged'].includes(selected.order.stage) ? (
            <Station v={selected} />
          ) : (
            <Empty title={`${selected.order.id} is not at the packing bench`}>
              Current status: {selected.status}. <Link to={`/orders/${selected.order.id}`}>Open the order →</Link>
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}
