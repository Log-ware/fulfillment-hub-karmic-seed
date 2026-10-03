import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProblemForm, ResolveForm } from '../components/forms';
import { Empty } from '../components/ui';
import { ago, when } from '../logic/format';
import { OWNERS, PROBLEM_TYPES, useStore } from '../store';

const PRIO_RANK = { high: 0, medium: 1, low: 2 };

export default function Exceptions() {
  const { state, d } = useStore();
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [type, setType] = useState('all');
  const [owner, setOwner] = useState('all');
  const [logOpen, setLogOpen] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);

  const openCount = state.problems.filter((p) => p.status === 'open').length;
  const resolvedCount = state.problems.length - openCount;
  const rows = state.problems
    .filter((p) => p.status === tab && (type === 'all' || p.type === type) && (owner === 'all' || p.owner === owner))
    .sort((a, b) => (tab === 'open' ? PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.createdAt - b.createdAt : (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0)));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Exceptions</h1>
          <p className="lede">Every problem gets an owner and stays here until someone writes down how it was fixed.</p>
        </div>
        <button className="btn primary" onClick={() => setLogOpen(true)}>
          + Log exception
        </button>
      </header>

      <div className="filters">
        <div className="seg big">
          <button className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>
            Open <span className="seg-n">{openCount}</span>
          </button>
          <button className={tab === 'resolved' ? 'on' : ''} onClick={() => setTab('resolved')}>
            Resolved <span className="seg-n">{resolvedCount}</span>
          </button>
        </div>
        <label>
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            {PROBLEM_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Owner</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="all">Everyone</option>
            {OWNERS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <Empty title={tab === 'open' ? 'No open exceptions' : 'Nothing resolved yet'}>{tab === 'open' ? 'Everything logged has been dealt with.' : ''}</Empty>
      ) : (
        <div className="ex-list">
          {rows.map((p) => {
            const ov = p.orderId ? d.viewMap[p.orderId] : undefined;
            return (
              <article key={p.id} className={`ex ex-${p.priority} ${p.status}`}>
                <div className="ex-left">
                  <div className="ex-top">
                    <span className="mono ex-id">{p.id}</span>
                    <span className={`ex-prio ep-${p.priority}`}>{p.priority === 'high' ? 'High' : p.priority === 'medium' ? 'Medium' : 'Low'}</span>
                    <strong className="ex-type">{p.type}</strong>
                    {p.orderId && (
                      <Link to={`/orders/${p.orderId}`} className="mono ex-order">
                        {p.orderId}
                      </Link>
                    )}
                    {ov?.order.priority === 'priority' && <span className="prio">Priority</span>}
                    {p.sku && <span className="mono small muted">{p.sku}</span>}
                  </div>
                  <p className="ex-desc">{p.description}</p>
                  {p.resolution && (
                    <p className="ex-res">
                      <strong>Fix:</strong> {p.resolution}
                    </p>
                  )}
                  <div className="ex-meta">
                    Owner <strong>{p.owner}</strong> · logged {when(p.createdAt)} ({ago(p.createdAt, d.now)})
                    {p.resolvedAt != null && ` · resolved ${when(p.resolvedAt)}`}
                  </div>
                </div>
                {p.status === 'open' && (
                  <div className="ex-right">
                    <button className="btn primary" onClick={() => setResolveId(p.id)}>
                      Resolve
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {logOpen && <ProblemForm onClose={() => setLogOpen(false)} />}
      {resolveId && <ResolveForm id={resolveId} onClose={() => setResolveId(null)} />}
    </div>
  );
}
