import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DisplayStatus, Priority } from '../types';
import type { Issue, Risk, SkuView } from '../logic/derive';

export function StatusPill({ status }: { status: DisplayStatus }) {
  return <span className={`pill st-${status.toLowerCase()}`}>{status}</span>;
}

const RISK_TEXT: Record<Risk, string> = { done: 'Done', overdue: 'Late', 'at-risk': 'At risk', 'due-soon': 'Due soon', 'on-track': 'On track' };
export function RiskPill({ risk }: { risk: Risk }) {
  return <span className={`risk rk-${risk}`}>{RISK_TEXT[risk]}</span>;
}

export function PriorityTag({ p, compact }: { p: Priority; compact?: boolean }) {
  if (p !== 'priority') return compact ? null : <span className="prio-std">Standard</span>;
  return <span className="prio">Priority</span>;
}

export function IssueChips({ issues, max = 3 }: { issues: Issue[]; max?: number }) {
  if (!issues.length) return <span className="muted">—</span>;
  const shown = issues.slice(0, max);
  return (
    <span className="chips">
      {shown.map((i) => (
        <span key={i.key} className={`chip tone-${i.tone}`}>
          {i.label}
        </span>
      ))}
      {issues.length > max && <span className="chip tone-grey">+{issues.length - max}</span>}
    </span>
  );
}

const STOCK_TEXT: Record<SkuView['status'], string> = {
  ok: 'In stock',
  low: 'Low',
  move: 'Move from Secondary',
  'on-the-way': 'Transfer on the way',
  short: 'Short – Secondary not enough',
  out: 'Short – none in Secondary',
};
export function StockPill({ status }: { status: SkuView['status'] }) {
  return <span className={`pill sk-${status}`}>{STOCK_TEXT[status]}</span>;
}

export function Modal({ title, onClose, children, width = 520 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

/* ---- toast ---- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msgs, setMsgs] = useState<{ id: number; text: string }[]>([]);
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setMsgs((m) => [...m.slice(-1), { id, text }]);
    setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className="toast">
            {m.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
