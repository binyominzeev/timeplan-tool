import type { AppState } from '../types';
import { DEFAULT_DAYS, DEFAULT_DAY_LABELS } from '../types';

const STORAGE_KEY = 'timeplan_state';
const UI_VISIBILITY_KEY = 'timeplan_ui_visibility';

export interface UiVisibilityState {
  showProgressPanel: boolean;
  showActivities: boolean;
}

const DEFAULT_UI_VISIBILITY: UiVisibilityState = {
  showProgressPanel: true,
  showActivities: true,
};

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
    acc[day] = typeof candidate === 'string' && candidate.trim() ? candidate : (DEFAULT_DAY_LABELS[day] ?? day);
    return acc;
  }, {});
}

function normalizeTimeString(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (!value) return fallback;

  const match = value.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return fallback;

  let hh = Number(match[1]);
  let mm = Number(match[2] ?? '0');
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallback;

  hh = Math.max(0, Math.min(23, hh));
  mm = Math.max(0, Math.min(59, mm));

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function normalizeSchedule(raw: unknown, days: string[]): {
  schedule: AppState['schedule'];
  legacyNames: Record<string, string>;
} {
  if (!Array.isArray(raw)) return { schedule: [], legacyNames: {} };

  const legacyNames: Record<string, string> = {};

  const schedule = raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry, index) => {
      const entryIdRaw = entry.id;
      const entryId =
        typeof entryIdRaw === 'string'
          ? entryIdRaw
          : (typeof entryIdRaw === 'number' ? String(entryIdRaw) : `legacy-entry-${index}`);

      const activityIdRaw =
        entry.activityId ??
        entry.activityID ??
        entry.activity;
      const activityNameRaw =
        (typeof entry.activityName === 'string' && entry.activityName.trim()
          ? entry.activityName
          : undefined) ??
        (typeof entry.title === 'string' && entry.title.trim() ? entry.title : undefined) ??
        (typeof entry.name === 'string' && entry.name.trim() ? entry.name : undefined);

      const activityId =
        typeof activityIdRaw === 'string'
          ? activityIdRaw
          : (typeof activityIdRaw === 'number' ? String(activityIdRaw) : undefined);

      const fallbackActivityId =
        activityNameRaw
          ? `legacy:${activityNameRaw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'activity'}`
          : 'legacy:unknown';

      const resolvedActivityId = activityId ?? fallbackActivityId;
      if (activityNameRaw) {
        legacyNames[resolvedActivityId] = activityNameRaw;
      }

      const start = normalizeTimeString(entry.startTime, '09:00');
      const slot =
        typeof entry.timeSlot === 'string' && entry.timeSlot
          ? normalizeTimeString(entry.timeSlot, start)
          : start;
      const day =
        typeof entry.day === 'string' && days.includes(entry.day)
          ? entry.day
          : days[0];

      return {
        id: entryId,
        activityId: resolvedActivityId,
        day,
        timeSlot: slot,
        startTime: start,
        endTime: normalizeTimeString(entry.endTime, ''),
      };
    })
    .map((entry) => ({
      ...entry,
      endTime: entry.endTime || undefined,
    }));

  return { schedule, legacyNames };
}

function remapScheduleActivityIds(
  schedule: AppState['schedule'],
  activities: AppState['activities'],
): AppState['schedule'] {
  const existing = new Set(activities.map((a) => a.id));
  const byName = new Map(activities.map((a) => [a.name.trim().toLowerCase(), a.id]));

  return schedule.map((entry) => {
    if (existing.has(entry.activityId)) return entry;

    const fallbackName = String((entry as unknown as { name?: string }).name ?? '').trim().toLowerCase();
    const mapped = fallbackName ? byName.get(fallbackName) : undefined;
    return mapped ? { ...entry, activityId: mapped } : entry;
  });
}

export function normalizeAppState(raw: unknown): AppState {
  const parsed = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const days = toUniqueStringArray(parsed.days);
  const effectiveDays = days.length > 0 ? days : DEFAULT_DAYS;

  const rawActivities = Array.isArray(parsed.activities) ? parsed.activities : [];
  const activities = rawActivities
    .filter((activity): activity is Record<string, unknown> => Boolean(activity) && typeof activity === 'object')
    .map((activity, index) => {
      const rawId = activity.id;
      const id =
        typeof rawId === 'string'
          ? rawId
          : (typeof rawId === 'number' ? String(rawId) : `legacy-activity-${index}`);
      const name = typeof activity.name === 'string' && activity.name.trim() ? activity.name : `Activity ${index + 1}`;
      const category = typeof activity.category === 'string' ? activity.category : '';
      const dailyMinutes = typeof activity.dailyMinutes === 'number' && Number.isFinite(activity.dailyMinutes)
        ? activity.dailyMinutes
        : null;
      const weeklyHours = typeof activity.weeklyHours === 'number' && Number.isFinite(activity.weeklyHours)
        ? activity.weeklyHours
        : null;
      const weeklyCount = typeof activity.weeklyCount === 'number' && Number.isFinite(activity.weeklyCount)
        ? activity.weeklyCount
        : null;
      const notes = typeof activity.notes === 'string' ? activity.notes : '';
      return { id, name, category, dailyMinutes, weeklyHours, weeklyCount, notes };
    });

  const { schedule, legacyNames } = normalizeSchedule(parsed.schedule, effectiveDays);
  const knownActivityIds = new Set(activities.map((activity) => activity.id));

  const syntheticActivities = schedule
    .filter((entry) => !knownActivityIds.has(entry.activityId))
    .map((entry, index) => ({
      id: entry.activityId,
      name: legacyNames[entry.activityId] ?? `Legacy activity ${index + 1}`,
      category: 'Legacy',
      dailyMinutes: null,
      weeklyHours: null,
      weeklyCount: null,
      notes: 'Auto-created from legacy preset.',
    }))
    .filter((activity, index, arr) => arr.findIndex((item) => item.id === activity.id) === index);

  const mergedActivities = [...activities, ...syntheticActivities];

  return {
    activities: mergedActivities,
    schedule: remapScheduleActivityIds(schedule, mergedActivities),
    days: effectiveDays,
    dayLabels: normalizeDayLabels(parsed.dayLabels, effectiveDays),
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeAppState(JSON.parse(raw));
    }
  } catch {
    // ignore corrupt data
  }
  return {
    activities: [],
    schedule: [],
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

export function loadUiVisibility(): UiVisibilityState {
  try {
    const raw = localStorage.getItem(UI_VISIBILITY_KEY);
    if (!raw) return DEFAULT_UI_VISIBILITY;

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_UI_VISIBILITY;

    const source = parsed as Record<string, unknown>;
    return {
      showProgressPanel:
        typeof source.showProgressPanel === 'boolean'
          ? source.showProgressPanel
          : DEFAULT_UI_VISIBILITY.showProgressPanel,
      showActivities:
        typeof source.showActivities === 'boolean'
          ? source.showActivities
          : DEFAULT_UI_VISIBILITY.showActivities,
    };
  } catch {
    return DEFAULT_UI_VISIBILITY;
  }
}

export function saveUiVisibility(state: UiVisibilityState): void {
  try {
    localStorage.setItem(UI_VISIBILITY_KEY, JSON.stringify(state));
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
            const fav = item as { name: string; data: unknown };
            result.push({
              name: fav.name,
              data: normalizeAppState(fav.data),
            });
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
