import { Link, useNavigate } from 'react-router-dom';
import { courierOf, pickupState } from '../logic/derive';
import { clock, duration, relative } from '../logic/format';
import { useStore } from '../store';
import type { DisplayStatus } from '../types';

function Kpi({ label, value, sub, to, tone }: { label: string; value: number; sub: string; to: string; tone?: 'red' | 'amber' | 'yellow' | 'green' }) {
  return (
    <Link to={to} className={`kpi ${tone ? 'kpi-' + tone : ''}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-sub">{sub}</span>
    </Link>
  );
}

const FLOW: DisplayStatus[] = ['Processing', 'Picking', 'Packing', 'Packed', 'Staged'];

export default function Dashboard() {
  const { d, state } = useStore();
  const nav = useNavigate();
  const { kpi, attention, now } = d;
  const open = d.views.filter((v) => v.order.stage !== 'shipped');
  const count = (s: DisplayStatus) => open.filter((v) => v.status === s).length;
  const today = state.pickups.filter((p) => p.time >= 0 && p.time < 1440).sort((a, b) => a.time - b.time);
  const reds = attention.filter((a) => a.tone === 'red').length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>What needs attention right now</h1>
          <p className="lede">
            {attention.length === 0
              ? 'Nothing urgent. All open orders are on track.'
              : `${attention.length} thing${attention.length === 1 ? '' : 's'} to sort out${reds ? ` · ${reds} urgent` : ''}. Most urgent first.`}
          </p>
        </div>
      </header>

      <section className="kpis">
        <Kpi label="Orders today" value={kpi.ordersToday} sub={`${kpi.shippedToday} shipped today · ${kpi.openOrders} open incl. yesterday`} to="/orders" />
        <Kpi label="Priority orders open" value={kpi.priorityOpen} sub={kpi.priorityAtRisk ? `${kpi.priorityAtRisk} at risk or late` : `none at risk · ${kpi.priorityDueSoon} due soon`} to="/orders?priority=priority" tone="yellow" />
        <Kpi label="At risk or late" value={kpi.atRisk} sub="may miss ship-by time" to="/orders?issue=risk" tone={kpi.atRisk ? 'red' : 'green'} />
        <Kpi label="Blocked by stock" value={kpi.blocked} sub="item not at Main warehouse" to="/orders?status=Blocked" tone={kpi.blocked ? 'amber' : 'green'} />
        <Kpi
          label="Ready for pickup"
          value={kpi.readyForPickup}
          sub={kpi.nextPickup ? `next: ${courierOf(kpi.nextPickup.courierId).name} ${clock(kpi.nextPickup.time)}` : 'no more pickups today'}
          to="/pickups"
        />
        <Kpi label="Open exceptions" value={kpi.openProblems} sub={`${kpi.highProblems} high priority`} to="/exceptions" tone={kpi.highProblems ? 'red' : undefined} />
      </section>

      <div className="dash-grid">
        <section className="panel attention">
          <div className="panel-head">
            <h2>Needs attention</h2>
            <span className="muted small">Updates automatically from order, stock and pickup data</span>
          </div>
          {attention.length === 0 ? (
            <div className="all-clear">All clear. Nothing is late, blocked or at risk.</div>
          ) : (
            <ol className="att-list">
              {attention.map((a) => (
                <li key={a.key} className={`att att-${a.tone}`} onClick={() => nav(a.link)}>
                  <div className="att-main">
                    <div className="att-top">
                      {a.key.startsWith('ORD') && <span className="mono att-id">{a.key}</span>}
                      {a.priority && <span className="prio">Priority</span>}
                      <span className="att-title">{a.title}</span>
                    </div>
                    <div className="att-detail">{a.detail}</div>
                  </div>
                  <div className="att-side">
                    <span className={`att-when ${a.when.includes('late') || a.when.includes('ago') ? 'late' : ''}`}>{a.when}</span>
                    <Link to={a.link} className="btn sm" onClick={(e) => e.stopPropagation()}>
                      {a.action} →
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="dash-side">
          <section className="panel">
            <div className="panel-head">
              <h2>Courier pickups today</h2>
              <Link to="/pickups" className="link small">
                Staging →
              </Link>
            </div>
            <ul className="pu-mini">
              {today.map((p) => {
                const st = pickupState(p, now);
                const assigned = state.orders.filter((o) => o.label?.pickupId === p.id && o.stage !== 'shipped');
                const inLane = assigned.filter((o) => o.stage === 'staged' && !o.boxMissing).length;
                return (
                  <li key={p.id} className={`pu-row pu-${st}`}>
                    <span className="mono pu-time">{clock(p.time)}</span>
                    <span className="pu-name">
                      {courierOf(p.courierId).name}
                      <span className="muted small"> · Lane {p.lane}</span>
                    </span>
                    <span className="pu-state">
                      {st === 'collected' && `Collected ${p.collectedCount}`}
                      {st === 'missed' && (assigned.length ? `Missed · ${inLane} waiting` : 'Missed · rebooked')}
                      {(st === 'soon' || st === 'later') && `${inLane}/${assigned.length} ready · ${relative(p.time, now)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Where open orders are</h2>
            </div>
            <div className="flow">
              {FLOW.map((s, i) => (
                <Link key={s} to={`/orders?status=${s}`} className="flow-step">
                  <span className="flow-n">{count(s)}</span>
                  <span className="flow-l">{s}</span>
                  {i < FLOW.length - 1 && <span className="flow-arrow">›</span>}
                </Link>
              ))}
            </div>
            <div className="flow-stuck">
              <Link to="/orders?status=Blocked" className="flow-bad amber">
                <strong>{count('Blocked')}</strong> blocked by stock
              </Link>
              <Link to="/orders?status=Exception" className="flow-bad red">
                <strong>{count('Exception')}</strong> held by an exception
              </Link>
            </div>
            {open.some((v) => v.stalledFor) && (
              <p className="small muted stall-note">
                {open.filter((v) => v.stalledFor).length} order(s) have had no progress for over {duration(120)}.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
