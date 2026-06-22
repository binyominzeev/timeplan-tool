import type { AppState } from '../types';
import { DEFAULT_DAYS, DEFAULT_DAY_LABELS } from '../types';

const STORAGE_KEY = 'timeplan_state';

const DEFAULT_TIME_SLOTS = ['10:00', '11:00', '15:00', '16:00', '17:00'];

function toUniqueStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeDayLabels(
  labels: unknown,
  days: string[],
): Record<string, string> {
  const source =
    labels && typeof labels === 'object' ? (labels as Record<string, unknown>) : {};

  return days.reduce<Record<string, string>>((acc, day) => {
    const candidate = source[day];
    acc[day] = typeof candidate === 'string' && candidate.trim() ? candidate : day;
    return acc;
  }, {});
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      const days = toUniqueStringArray(parsed.days);
      const effectiveDays = days.length > 0 ? days : DEFAULT_DAYS;
      return {
        activities: parsed.activities ?? [],
        schedule: parsed.schedule ?? [],
        timeSlots: parsed.timeSlots ?? DEFAULT_TIME_SLOTS,
        days: effectiveDays,
        dayLabels: normalizeDayLabels(parsed.dayLabels, effectiveDays),
      };
    }
  } catch {
    // ignore corrupt data
  }
  return {
    activities: [],
    schedule: [],
    timeSlots: DEFAULT_TIME_SLOTS,
    days: DEFAULT_DAYS,
    dayLabels: DEFAULT_DAY_LABELS,
  };
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

// ── Favorites ─────────────────────────────────────────────────────────────

export interface Favorite {
  name: string;
  data: AppState;
}

const FAVORITES_KEY = 'timeplan_favorites';
const FAVORITES_COUNT = 4;

export function loadFavorites(): Array<Favorite | null> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown[];
      if (Array.isArray(parsed)) {
        const result: Array<Favorite | null> = [];
        for (let i = 0; i < FAVORITES_COUNT; i++) {
          const item = parsed[i];
          if (
            item &&
            typeof item === 'object' &&
            'name' in item &&
            'data' in item &&
            typeof (item as { name: unknown }).name === 'string'
          ) {
            result.push(item as Favorite);
          } else {
            result.push(null);
          }
        }
        return result;
      }
    }
  } catch {
    // ignore corrupt data
  }
  return Array<null>(FAVORITES_COUNT).fill(null);
}

export function saveFavorites(favorites: Array<Favorite | null>): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // ignore quota errors
  }
}
