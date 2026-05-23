export type WindowPolicy = 'open' | 'code-required';

export interface ScheduleWindow {
  id: string;
  label: string;
  start: Date;
  end: Date;
  policy: WindowPolicy;
  recurring?: boolean;
  recurrenceRule?: 'weekends';
}

const store: ScheduleWindow[] = [];

export function getScheduleWindows(): ScheduleWindow[] {
  return [...store];
}

export function addScheduleWindow(window: Omit<ScheduleWindow, 'id'>): ScheduleWindow {
  const id = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const entry: ScheduleWindow = { ...window, id };
  store.push(entry);
  return entry;
}

export function removeScheduleWindow(id: string): boolean {
  const idx = store.findIndex((w) => w.id === id);
  if (idx === -1) return false;
  store.splice(idx, 1);
  return true;
}

export function clearAdHocWindows(): void {
  store.splice(0, store.length);
}

export function loadAdHocWindows(windows: Omit<ScheduleWindow, 'id' | 'recurring'>[]): void {
  store.splice(0, store.length);
  for (const w of windows) {
    addScheduleWindow({ ...w, recurring: false });
  }
}
