import type { AppState } from '../types';

const STORAGE_KEY = 'timeplan_state';

const DEFAULT_TIME_SLOTS = ['10:00', '11:00', '15:00', '16:00', '17:00'];

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      return {
        activities: parsed.activities ?? [],
        schedule: parsed.schedule ?? [],
        timeSlots: parsed.timeSlots ?? DEFAULT_TIME_SLOTS,
      };
    }
  } catch {
    // ignore corrupt data
  }
  return {
    activities: [],
    schedule: [],
    timeSlots: DEFAULT_TIME_SLOTS,
  };
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}
