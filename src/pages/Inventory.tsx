import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TransferControl } from '../components/forms';
import { Empty, StockPill } from '../components/ui';
import { when } from '../logic/format';
import { useStore } from '../store';

export default function Inventory() {
  const { d, state } = useStore();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'action' | 'low'>('all');
  const needs = d.skus.filter((k) => ['move', 'on-the-way', 'short', 'out'].includes(k.status));
  const needle = q.trim().toLowerCase();
  const rows = d.skus.filter((k) => {
    if (show === 'action' && !['move', 'on-the-way', 'short', 'out'].includes(k.status)) return false;
    if (show === 'low' && k.status !== 'low') return false;
    if (needle && !`${k.sku} ${k.product.name} ${k.product.variant}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const transfers = state.transfers;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Inventory</h1>
          <p className="lede">Orders ship only from the Main warehouse. When Main runs short, bring stock over from Secondary before picking.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h2>Stock blocking orders</h2>
          <span className="muted small">{needs.length ? `${needs.length} item${needs.length === 1 ? '' : 's'}` : ''}</span>
        </div>
        {needs.length === 0 ? (
          <div className="all-clear">No orders are waiting for stock.</div>
        ) : (
          <div className="block-cards">
            {needs.map((k) => (
              <div key={k.sku} className={`block-card bc-${k.status}`}>
                <div className="bc-head">
                  <div>
                    <span className="mono strong">{k.sku}</span>
                    <div className="sub">
                      {k.product.name} – {k.product.variant} · shelf {k.product.bin}
                    </div>
                  </div>
                </div>
                <TransferControl sku={k.sku} compact />
                <div className="bc-orders small">
                  Waiting:{' '}
                  {k.waitingOrders.map((id, i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <Link to={`/orders/${id}`} className="mono">
                        {id}
                      </Link>
                      {d.viewMap[id]?.order.priority === 'priority' && <span className="prio xs">P</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {transfers.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Transfers today</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Transfer</th>
                <th>SKU</th>
                <th>Qty</th>
                <th>Requested</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.id}</td>
                  <td className="mono">{t.sku}</td>
                  <td className="num">{t.qty}</td>
                  <td>{when(t.requestedAt)}</td>
                  <td>{t.status === 'requested' ? <span className="pill sk-on-the-way">On the way</span> : <span className="pill sk-ok">On shelf at Main {t.receivedAt != null && when(t.receivedAt)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>All stock</h2>
          <div className="seg">
            {(['all', 'action', 'low'] as const).map((s) => (
              <button key={s} className={show === s ? 'on' : ''} onClick={() => setShow(s)}>
                {s === 'all' ? 'All' : s === 'action' ? 'Blocking orders' : 'Low'}
              </button>
            ))}
          </div>
        </div>
        <div className="filters tight">
          <input className="search" placeholder="Search SKU or product…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stock" />
          <span className="muted small legend">
            <strong>Reserved</strong> = held for open orders · <strong>Available</strong> = Main − Reserved · <strong>Open demand</strong> = units on orders not yet packed
          </span>
        </div>
        {rows.length === 0 ? (
          <Empty title="No items match" />
        ) : (
          <div className="table-wrap">
            <table className="table inv-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Shelf</th>
                  <th className="num">Main</th>
                  <th className="num">Secondary</th>
                  <th className="num">Reserved</th>
                  <th className="num">Available</th>
                  <th className="num">Open demand</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => (
                  <tr key={k.sku} className={['move', 'short', 'out'].includes(k.status) ? 'row-warn' : ''}>
                    <td className="mono strong">{k.sku}</td>
                    <td>
                      {k.product.name}
                      <div className="sub">{k.product.variant}</div>
                    </td>
                    <td className="mono">{k.product.bin}</td>
                    <td className={`num strong ${k.main === 0 ? 'late' : ''}`}>{k.main}</td>
                    <td className="num">{k.secondary}</td>
                    <td className="num">{k.reserved}</td>
                    <td className={`num ${k.available <= 0 ? 'late' : ''}`}>{k.available}</td>
                    <td className="num">{k.demand}</td>
                    <td>
                      <StockPill status={k.status} />
                      {k.onTheWay > 0 && k.status !== 'on-the-way' && <div className="sub">{k.onTheWay} on the way</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
