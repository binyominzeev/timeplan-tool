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

function getLocalDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

  const { schedule, legacyNames: weeklyLegacyNames } = normalizeSchedule(parsed.schedule, effectiveDays);
  const today = getLocalDateKey();
  const dailyScheduleIsCurrent = parsed.dailyScheduleDate === today;
  const { schedule: dailySchedule, legacyNames: dailyLegacyNames } = normalizeSchedule(
    dailyScheduleIsCurrent ? parsed.dailySchedule : [],
    ['Today'],
  );
  const legacyNames = { ...weeklyLegacyNames, ...dailyLegacyNames };
  const knownActivityIds = new Set(activities.map((activity) => activity.id));

  const syntheticActivities = [...schedule, ...dailySchedule]
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
  const mergedActivityIds = new Set(mergedActivities.map((activity) => activity.id));
  const starredActivityIds = toUniqueStringArray(parsed.starredActivityIds)
    .filter((activityId) => mergedActivityIds.has(activityId));

  return {
    activities: mergedActivities,
    schedule: remapScheduleActivityIds(schedule, mergedActivities),
    dailySchedule: dailyScheduleIsCurrent
      ? remapScheduleActivityIds(dailySchedule, mergedActivities)
      : [],
    dailyScheduleDate: today,
    starredActivityIds,
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
    dailySchedule: [],
    dailyScheduleDate: getLocalDateKey(),
    starredActivityIds: [],
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

export interface PlannerCloudDocument {
  state: AppState;
  favorites: Array<Favorite | null>;
}

export interface PlannerCloudResponse {
  document: PlannerCloudDocument;
  updatedAt: string;
}

const FAVORITES_KEY = 'timeplan_favorites';
const FAVORITES_COUNT = 4;
const RECOVERY_KEY = 'timeplan_recovery';
const LOCAL_MIGRATION_KEY = 'timeplan_local_migration_complete';

export function hasCompletedLocalMigration(): boolean {
  try {
    return localStorage.getItem(LOCAL_MIGRATION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markLocalMigrationComplete(): void {
  try {
    localStorage.setItem(LOCAL_MIGRATION_KEY, 'true');
  } catch {
    // Migration state is best-effort when browser storage is unavailable.
  }
}

export function normalizeFavorites(raw: unknown): Array<Favorite | null> {
  if (!Array.isArray(raw)) return Array<null>(FAVORITES_COUNT).fill(null);

  return Array.from({ length: FAVORITES_COUNT }, (_, index) => {
    const item = raw[index];
    if (
      !item || typeof item !== 'object' ||
      !('name' in item) || !('data' in item) ||
      typeof item.name !== 'string' || !item.data || typeof item.data !== 'object'
    ) return null;
    return { name: item.name, data: normalizeAppState(item.data) };
  });
}

export function saveRecoverySnapshot(
  state: AppState,
  favorites: Array<Favorite | null>,
): void {
  try {
    const previous = JSON.parse(localStorage.getItem(RECOVERY_KEY) || '[]') as unknown;
    const snapshots = Array.isArray(previous) ? previous : [];
    snapshots.push({ savedAt: new Date().toISOString(), state, favorites });
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(snapshots.slice(-5)));
  } catch {
    // Recovery is best-effort when browser storage is unavailable.
  }
}

export function loadFavorites(): Array<Favorite | null> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) {
      return normalizeFavorites(JSON.parse(raw) as unknown);
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
