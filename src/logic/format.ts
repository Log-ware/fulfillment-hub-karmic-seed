import type { Min } from '../types';

export function clock(m: Min): string {
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}

/** "14:10", "Yesterday 16:40", "Tomorrow 18:00" */
export function when(m: Min): string {
  if (m < 0) return `Yesterday ${clock(m)}`;
  if (m >= 1440) return `Tomorrow ${clock(m)}`;
  return clock(m);
}

export function duration(min: number): string {
  const v = Math.abs(Math.round(min));
  if (v < 60) return `${v} min`;
  const h = Math.floor(v / 60);
  const r = v % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** "in 1h 20m" / "35 min late" */
export function relative(target: Min, now: Min): string {
  const d = target - now;
  if (d >= 0) return `in ${duration(d)}`;
  return `${duration(d)} late`;
}

export function ago(at: Min, now: Min): string {
  const d = now - at;
  if (d < 1) return 'just now';
  return `${duration(d)} ago`;
}

export function todayLabel(): string {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}
