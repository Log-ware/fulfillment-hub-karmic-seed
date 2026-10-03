import { useSearchParams, useNavigate } from 'react-router-dom';
import { Empty, IssueChips, PriorityTag, RiskPill, StatusPill } from '../components/ui';
import type { OrderView, Risk } from '../logic/derive';
import { ago, clock, duration, when } from '../logic/format';
import { useStore } from '../store';

const STATUSES = ['Processing', 'Picking', 'Packing', 'Packed', 'Staged', 'Blocked', 'Exception', 'Shipped'];
const ISSUES: Record<string, { label: string; test: (v: OrderView) => boolean }> = {
  risk: { label: 'At risk or late', test: (v) => v.risk === 'at-risk' || v.risk === 'overdue' },
  stock: { label: 'Waiting for stock', test: (v) => v.shortSkus.length > 0 },
  label: { label: 'No label', test: (v) => v.issues.some((i) => i.key === 'label') },
  stalled: { label: 'No progress 2h+', test: (v) => v.stalledFor > 0 },
  pickup: { label: 'Pickup missed', test: (v) => v.issues.some((i) => i.key === 'missed') },
  problem: { label: 'Has open exception', test: (v) => v.openProblems.length > 0 || !!v.order.boxMissing },
  any: { label: 'Any issue', test: (v) => v.issues.length > 0 },
};
const RISK_ORDER: Record<Risk, number> = { overdue: 0, 'at-risk': 1, 'due-soon': 2, 'on-track': 3, done: 4 };

export default function Orders() {
  const { d } = useStore();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const status = sp.get('status') ?? 'open';
  const priority = sp.get('priority') ?? 'all';
  const issue = sp.get('issue') ?? 'all';
  const set = (k: string, v: string, def: string) => {
    // functional update so two quick changes never overwrite each other
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (v === def) n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );
  };

  const needle = q.trim().toLowerCase();
  const rows = d.views
    .filter((v) => {
      const o = v.order;
      if (status === 'open' && o.stage === 'shipped') return false;
      if (status !== 'open' && status !== 'all' && v.status !== status) return false;
      if (priority !== 'all' && o.priority !== priority) return false;
      if (issue !== 'all' && !ISSUES[issue].test(v)) return false;
      if (needle) {
        const hay = [o.id, o.customer, o.city, o.channel, v.courier?.name ?? '', ...o.lines.map((l) => l.sku), o.label?.tracking ?? ''].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        RISK_ORDER[a.risk] - RISK_ORDER[b.risk] ||
        (a.order.priority === b.order.priority ? 0 : a.order.priority === 'priority' ? -1 : 1) ||
        a.deadline - b.deadline,
    );
  const filtered = q || status !== 'open' || priority !== 'all' || issue !== 'all';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Orders</h1>
          <p className="lede">Every order and exactly where it is. Most urgent at the top.</p>
        </div>
      </header>

      <div className="filters">
        <input className="search" placeholder="Search order, customer, SKU, tracking…" value={q} onChange={(e) => set('q', e.target.value, '')} aria-label="Search orders" />
        <label>
          <span>Status</span>
          <select value={status} onChange={(e) => set('status', e.target.value, 'open')}>
            <option value="open">All open</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="all">All (incl. shipped)</option>
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select value={priority} onChange={(e) => set('priority', e.target.value, 'all')}>
            <option value="all">All</option>
            <option value="priority">Priority only</option>
            <option value="standard">Standard only</option>
          </select>
        </label>
        <label>
          <span>Issue</span>
          <select value={issue} onChange={(e) => set('issue', e.target.value, 'all')}>
            <option value="all">All</option>
            {Object.entries(ISSUES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <button className="btn ghost sm" onClick={() => setSp(new URLSearchParams(), { replace: true })}>
            Clear filters
          </button>
        )}
        <span className="muted small count">{rows.length} order{rows.length === 1 ? '' : 's'}</span>
      </div>

      {rows.length === 0 ? (
        <Empty title="No orders match these filters">Try clearing the filters or searching for something else.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Ship by</th>
                <th>Status</th>
                <th>Courier</th>
                <th>Risk / issue</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const o = v.order;
                const units = o.lines.reduce((n, l) => n + l.qty, 0);
                return (
                  <tr key={o.id} className={`click ${o.priority === 'priority' ? 'row-prio' : ''}`} onClick={() => nav(`/orders/${o.id}`)}>
                    <td>
                      <div className="mono strong">{o.id}</div>
                      <div className="sub">
                        <PriorityTag p={o.priority} compact /> {o.channel}
                      </div>
                    </td>
                    <td>
                      <div>{o.customer}</div>
                      <div className="sub">{o.city}</div>
                    </td>
                    <td>
                      <div className="mono small">{o.lines.map((l) => (l.qty > 1 ? `${l.qty}× ${l.sku}` : l.sku)).join(', ')}</div>
                      <div className="sub">
                        {units} unit{units === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td>
                      <div className="mono">{when(o.shipBy)}</div>
                      {o.stage !== 'shipped' && (
                        <div className={`sub ${v.minutesLeft < 0 ? 'late' : ''}`}>{v.minutesLeft < 0 ? 'late' : `${clock(v.deadline) === clock(o.shipBy) ? '' : 'pickup ' + clock(v.deadline) + ' · '}${duration(v.minutesLeft)} left`}</div>
                      )}
                    </td>
                    <td>
                      <StatusPill status={v.status} />
                    </td>
                    <td>{v.courier ? v.courier.name : <span className="muted">No label yet</span>}</td>
                    <td>
                      <div className="risk-cell">
                        {!(v.risk === 'on-track' && (v.status === 'Blocked' || v.status === 'Exception')) && <RiskPill risk={v.risk} />}
                        {v.issues.some((i) => i.key !== 'at-risk' && i.key !== 'overdue') && <IssueChips issues={v.issues.filter((i) => i.key !== 'at-risk' && i.key !== 'overdue')} max={2} />}
                      </div>
                    </td>
                    <td className="sub nowrap">{ago(v.updated, d.now)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
