import type { ScheduleWindow, WindowPolicy } from './schedule-store';
import { getScheduleWindows, loadAdHocWindows } from './schedule-store';

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

function getWeekendWindow(date: Date): ScheduleWindow | null {
  if (!isWeekend(date)) return null;

  const year = date.getFullYear();
  const month = date.getMonth();
  const dayOfWeek = date.getDay();

  // Get start of weekend (Saturday 00:00 UTC)
  const saturday = new Date(year, month, dayOfWeek === 0 ? date.getDate() - 1 : date.getDate(), 0, 0, 0, 0);
  // Get end of weekend (Sunday 23:59:59 UTC)
  const sunday = new Date(year, month, dayOfWeek === 0 ? date.getDate() : date.getDate() + 1, 23, 59, 59, 999);

  return {
    id: 'weekend-standing',
    label: 'Weekend live demo',
    start: saturday,
    end: sunday,
    policy: 'open',
    recurring: true,
    recurrenceRule: 'weekends',
  };
}

export interface AdHocWindowDef {
  label: string;
  start: string; // ISO date string
  end: string; // ISO date string
  policy: WindowPolicy;
}

export function initScheduleFromEnv(env: { LIVE_SCHEDULE_ADHOC_WINDOWS?: string }): void {
  const raw = env.LIVE_SCHEDULE_ADHOC_WINDOWS;
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as AdHocWindowDef[];
    if (!Array.isArray(parsed)) return;
    const windows = parsed.map((w): Omit<ScheduleWindow, 'id' | 'recurring'> => ({
      label: w.label,
      start: new Date(w.start),
      end: new Date(w.end),
      policy: w.policy,
    }));
    loadAdHocWindows(windows);
  } catch {
    // Invalid JSON, skip
  }
}

export function getCurrentWindow(now?: Date): ScheduleWindow | null {
  const current = now ?? new Date();

  // Check standing weekend window first
  const weekendWindow = getWeekendWindow(current);
  if (weekendWindow && current >= weekendWindow.start && current <= weekendWindow.end) {
    return weekendWindow;
  }

  // Check ad-hoc windows from store
  const windows = getScheduleWindows();
  for (const window of windows) {
    if (current >= window.start && current <= window.end) {
      return window;
    }
  }

  return null;
}

export function isWindowActive(now?: Date): boolean {
  return getCurrentWindow(now) !== null;
}

export function getWindowPolicy(now?: Date): WindowPolicy | null {
  const window = getCurrentWindow(now);
  return window?.policy ?? null;
}

export function isLiveAccessRequired(now?: Date): boolean {
  const policy = getWindowPolicy(now);
  return policy === 'code-required';
}

export function getAvailabilityState(now?: Date): 'offline' | 'open' | 'code-required' {
  const window = getCurrentWindow(now);
  if (!window) return 'offline';
  return window.policy;
}