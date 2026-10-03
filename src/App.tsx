import { useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Modal, ToastProvider, useToast } from './components/ui';
import { clock, todayLabel } from './logic/format';
import Dashboard from './pages/Dashboard';
import Exceptions from './pages/Exceptions';
import Inventory from './pages/Inventory';
import OrderDetail from './pages/OrderDetail';
import Orders from './pages/Orders';
import Packing from './pages/Packing';
import Pickups from './pages/Pickups';
import { StoreProvider, useStore } from './store';

function Nav() {
  const { d, state } = useStore();
  const packingCount = state.orders.filter((o) => o.stage === 'packing').length;
  const items = [
    { to: '/', label: 'Dashboard', hint: 'What needs attention', count: d.attention.length, tone: d.attention.some((a) => a.tone === 'red') ? 'red' : 'amber' },
    { to: '/orders', label: 'Orders', hint: 'Find any order', count: d.kpi.openOrders, tone: 'plain' },
    { to: '/packing', label: 'Packing', hint: 'Scan & check items', count: packingCount, tone: 'plain' },
    { to: '/inventory', label: 'Inventory', hint: 'Stock & transfers', count: d.skus.filter((k) => ['move', 'short', 'out'].includes(k.status)).length, tone: 'amber' },
    { to: '/pickups', label: 'Staging & Pickup', hint: 'Lanes & couriers', count: d.kpi.readyForPickup, tone: 'plain' },
    { to: '/exceptions', label: 'Exceptions', hint: 'Log & resolve problems', count: d.kpi.openProblems, tone: 'red' },
  ];
  return (
    <nav className="nav">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <span className="nav-text">
            <span className="nav-label">{i.label}</span>
            <span className="nav-hint">{i.hint}</span>
          </span>
          {i.count > 0 && <span className={`nav-count nc-${i.tone}`}>{i.count}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

function DemoClock() {
  const { d, state, dispatch } = useStore();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="demo">
      <div className="demo-date">{todayLabel()}</div>
      <div className="demo-time">
        <span className="demo-label">Demo time</span>
        <span className="demo-clock mono">{clock(d.now)}</span>
      </div>
      <div className="demo-btns">
        <button className="btn ghost-dark sm" onClick={() => dispatch({ type: 'CLOCK', delta: 15 })} title="Move the demo clock forward to see deadlines approach">
          +15 min
        </button>
        {state.clockOffset > 0 && (
          <button className="btn ghost-dark sm" onClick={() => dispatch({ type: 'CLOCK', delta: -state.clockOffset })}>
            Back to {clock(d.now - state.clockOffset)}
          </button>
        )}
        <button className="btn ghost-dark sm" onClick={() => setConfirmReset(true)}>
          Reset data
        </button>
      </div>
      {confirmReset && (
        <Modal title="Reset sample data?" onClose={() => setConfirmReset(false)} width={420}>
          <p>All changes made in this demo (transfers, packed boxes, resolved exceptions) will be undone and the original sample day restored.</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={() => {
                dispatch({ type: 'RESET' });
                setConfirmReset(false);
                toast('Sample data restored');
              }}
            >
              Reset
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Shell() {
  const loc = useLocation();
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
            <path d="M6 10.5 16 5.5l10 5v11l-10 5-10-5z" fill="none" stroke="#f5c400" strokeWidth="2.6" strokeLinejoin="round" />
            <path d="M6 10.5 16 15.5l10-5M16 15.5v11" fill="none" stroke="#f5c400" strokeWidth="2" strokeLinejoin="round" opacity=".55" />
          </svg>
          <div>
            <div className="brand-name">Fulfillment Hub</div>
            <div className="brand-sub">XYZ · Main warehouse</div>
          </div>
        </div>
        <Nav />
        <DemoClock />
      </aside>
      <main className="main" key={loc.pathname.split('/')[1]}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/packing" element={<Packing />} />
          <Route path="/packing/:id" element={<Packing />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/pickups" element={<Pickups />} />
          <Route path="/exceptions" element={<Exceptions />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Shell />
        </HashRouter>
      </ToastProvider>
    </StoreProvider>
  );
}
