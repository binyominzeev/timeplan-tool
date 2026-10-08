import { useCallback, useEffect, useRef, useState } from 'react';
import { Draggable } from '@fullcalendar/interaction';

import type { Activity, AppState, CompletionRecord, DayKey } from './types';
import { useAuth } from './auth/useAuth';
import { parseCSV } from './utils/csvParser';
import {
  loadFavorites,
  loadState,
  loadUiVisibility,
  hasCompletedLocalMigration,
  markLocalMigrationComplete,
  normalizeFavorites,
  normalizeAppState,
  saveRecoverySnapshot,
  saveUiVisibility,
} from './utils/storage';
import type { Favorite, PlannerCloudResponse } from './utils/storage';

import { Backlog } from './components/Backlog';
import { WeeklyPlanner } from './components/WeeklyPlanner';
import { ProgressPanel } from './components/ProgressPanel';
import { CSVImport } from './components/CSVImport';
import { CompletionLogDialog } from './components/CompletionLogDialog';
import { ZOOM_CONFIG } from './config/zoomConfig';

type SnapMinutes = 5 | 15;
type PlannerViewMode = 'weekly' | 'daily';

function getLocalDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function App() {
  const {
    status: authStatus,
    userName,
    sessionKey: authSessionKey,
    error: authError,
    login,
    logout,
    requestForSession,
  } = useAuth();
  const initialUiVisibility = loadUiVisibility();
  const [state, setState] = useState<AppState>(loadState);
  const [now, setNow] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<PlannerViewMode>('weekly');
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const snapToastTimeoutRef = useRef<number | null>(null);
  const [showProgressPanel, setShowProgressPanel] = useState(initialUiVisibility.showProgressPanel);
  const [showActivities, setShowActivities] = useState(initialUiVisibility.showActivities);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCompletionLog, setShowCompletionLog] = useState(false);
  const [favorites, setFavorites] = useState<Array<Favorite | null>>(loadFavorites);
  const [hydratedSessionKey, setHydratedSessionKey] = useState<string | null>(null);
  const [cloudErrorState, setCloudErrorState] = useState<{ sessionKey: string; error: string } | null>(null);
  const [cloudSyncState, setCloudSyncState] = useState<{
    sessionKey: string;
    status: 'loading' | 'saving' | 'saved' | 'error';
  } | null>(null);
  const [hydrateAttempt, setHydrateAttempt] = useState(0);
  const cloudQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const cloudReady = authStatus === 'authenticated' && hydratedSessionKey === authSessionKey;
  const cloudError = cloudErrorState?.sessionKey === authSessionKey ? cloudErrorState.error : null;
  const syncStatus = cloudSyncState?.sessionKey === authSessionKey
    ? cloudSyncState.status
    : authStatus === 'authenticated' ? 'loading' : 'idle';
  const [snapMinutes, setSnapMinutes] = useState<SnapMinutes>(15);
  const [zoomMinutes, setZoomMinutes] = useState<number>(ZOOM_CONFIG.defaultMinutes);
  const [snapToast, setSnapToast] = useState<string | null>(null);
  const handlePrintSchedule = useCallback(() => window.print(), []);

  const showSnapToast = useCallback((nextSnapMinutes: SnapMinutes) => {
    if (snapToastTimeoutRef.current) {
      window.clearTimeout(snapToastTimeoutRef.current);
    }

    setSnapToast(
      nextSnapMinutes === 5
        ? 'Fine snap enabled: 5-minute steps'
        : 'Normal snap enabled: 15-minute steps',
    );

    snapToastTimeoutRef.current = window.setTimeout(() => {
      setSnapToast(null);
      snapToastTimeoutRef.current = null;
    }, 1800);
  }, []);

  const toggleSnapMinutes = useCallback(() => {
    let nextSnapMinutes: SnapMinutes = 15;
    setSnapMinutes((prev) => {
      nextSnapMinutes = prev === 15 ? 5 : 15;
      return nextSnapMinutes;
    });
    showSnapToast(nextSnapMinutes);
  }, [showSnapToast]);

  const clampZoom = useCallback((next: number) => {
    return Math.max(ZOOM_CONFIG.minMinutes, Math.min(ZOOM_CONFIG.maxMinutes, next));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomMinutes((prev) => clampZoom(prev + ZOOM_CONFIG.stepMinutes));
  }, [clampZoom]);

  const zoomIn = useCallback(() => {
    setZoomMinutes((prev) => clampZoom(prev - ZOOM_CONFIG.stepMinutes));
  }, [clampZoom]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    let active = true;
    const sessionKey = authSessionKey;
    const localState = loadState();
    const localFavorites = loadFavorites();
    const shouldMigrateLocalData = !hasCompletedLocalMigration();

    void (async () => {
      try {
        const stored = await requestForSession<PlannerCloudResponse>(sessionKey, '/state');
        if (!active) return;

        if (stored?.document) {
          if (shouldMigrateLocalData) saveRecoverySnapshot(localState, localFavorites);
          markLocalMigrationComplete();
          setState(normalizeAppState(stored.document.state));
          setFavorites(normalizeFavorites(stored.document.favorites));
          const storedUi = stored.document.ui;
          if (typeof storedUi?.showProgressPanel === 'boolean') setShowProgressPanel(storedUi.showProgressPanel);
          if (typeof storedUi?.showActivities === 'boolean') setShowActivities(storedUi.showActivities);
        } else {
          const initialState = shouldMigrateLocalData ? localState : normalizeAppState({});
          const initialFavorites = shouldMigrateLocalData ? localFavorites : normalizeFavorites([]);
          setState(initialState);
          setFavorites(initialFavorites);
          const saved = await requestForSession(sessionKey, '/state', {
            method: 'PUT',
            body: JSON.stringify({
              state: initialState,
              favorites: initialFavorites,
              ui: loadUiVisibility(),
            }),
          });
          if (!active) return;
          if (saved === null) throw new Error('Could not initialize your cloud planner.');
          markLocalMigrationComplete();
        }

        if (active) {
          setHydratedSessionKey(sessionKey);
          setCloudSyncState({ sessionKey, status: 'saved' });
        }
      } catch (error) {
        if (!active) return;
        setCloudErrorState({
          sessionKey,
          error: error instanceof Error ? error.message : 'Could not load your planner data.',
        });
        setCloudSyncState({ sessionKey, status: 'error' });
      }
    })();

    return () => {
      active = false;
    };
  }, [authStatus, authSessionKey, requestForSession, hydrateAttempt]);

  useEffect(() => {
    if (!cloudReady || authStatus !== 'authenticated') return;
    const sessionKey = authSessionKey;
    const document = { state, favorites, ui: { showProgressPanel, showActivities } };

    const timeoutId = window.setTimeout(() => {
      setCloudSyncState({ sessionKey, status: 'saving' });
      setCloudErrorState(null);
      cloudQueueRef.current = cloudQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const saved = await requestForSession(sessionKey, '/state', {
            method: 'PUT',
            body: JSON.stringify(document),
          });
          if (saved !== null) setCloudSyncState({ sessionKey, status: 'saved' });
        })
        .catch((error: unknown) => {
          setCloudErrorState({
            sessionKey,
            error: error instanceof Error ? error.message : 'Could not save your planner data.',
          });
          setCloudSyncState({ sessionKey, status: 'error' });
        });
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [state, favorites, showProgressPanel, showActivities, cloudReady, authStatus, authSessionKey, requestForSession]);

  useEffect(() => {
    const refreshDailySchedule = () => {
      setNow(new Date());
      const today = getLocalDateKey();
      setState((prev) => prev.dailyScheduleDate === today
        ? prev
        : { ...prev, dailySchedule: [], dailyScheduleDate: today });
    };
    const intervalId = window.setInterval(refreshDailySchedule, 60_000);
    window.addEventListener('focus', refreshDailySchedule);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshDailySchedule);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Control' || event.repeat) return;
      if (isTextInputTarget(event.target)) return;
      toggleSnapMinutes();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSnapMinutes]);

  useEffect(() => () => {
    if (snapToastTimeoutRef.current) {
      window.clearTimeout(snapToastTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const roots = Array.from(document.querySelectorAll<HTMLElement>('.tp-backlog-root'));
    if (roots.length === 0) return;

    const draggables = roots.map(
      (root) =>
        new Draggable(root, {
          itemSelector: '.tp-backlog-draggable',
          eventData: (eventEl) => {
            const activityId = eventEl.getAttribute('data-activity-id');
            const title = eventEl.getAttribute('data-activity-title') ?? 'Activity';
            const rawDuration = Number(eventEl.getAttribute('data-duration-minutes') ?? '60');
            // Round duration to nearest configured step and enforce configured minimum
            const durationMinutes = Math.max(
              ZOOM_CONFIG.minMinutes,
              Math.round(rawDuration / ZOOM_CONFIG.stepMinutes) * ZOOM_CONFIG.stepMinutes,
            );
            const hours = Math.floor(durationMinutes / 60);
            const mins = durationMinutes % 60;

            return {
              title,
              duration: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`,
              extendedProps: {
                activityId,
              },
            };
          },
        }),
    );

    return () => {
      draggables.forEach((draggable) => draggable.destroy());
    };
  }, [state.activities, showActivities]);

  useEffect(() => {
    saveUiVisibility({ showProgressPanel, showActivities });
  }, [showProgressPanel, showActivities]);

  const handleCSVFile = useCallback((text: string) => {
    const imported = parseCSV(text);
    if (imported.length === 0) {
      alert('No activities found in the CSV. Please check the file format.');
      return;
    }
    setState((prev) => ({
      ...prev,
      activities: imported,
      schedule: [],
      dailySchedule: [],
      dailyScheduleDate: getLocalDateKey(),
      starredActivityIds: [],
    }));
  }, []);

  const openFilePicker = () => {
    document.getElementById('csv-file-input')?.click();
  };

  const openJsonPicker = () => {
    jsonInputRef.current?.click();
  };

  const buildUniqueDayKey = useCallback((label: string, existingDays: DayKey[]): DayKey => {
    const normalized = label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const base = normalized || 'Day';

    if (!existingDays.includes(base)) return base;

    let index = 2;
    let candidate = `${base}_${index}`;
    while (existingDays.includes(candidate)) {
      index += 1;
      candidate = `${base}_${index}`;
    }

    return candidate;
  }, []);

  const exportAsJson = useCallback(() => {
    const suggestedName = `orarend-${new Date().toISOString().slice(0, 10)}`;
    const inputName = window.prompt('Export file name:', suggestedName)?.trim();
    if (!inputName) return;

    const safeName = inputName.replace(/[\\/:*?"<>|]+/g, '_') || suggestedName;
    const payload = {
      name: inputName,
      exportedAt: new Date().toISOString(),
      version: 1,
      data: state,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeName}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [state]);

  const importFromJson = useCallback((text: string) => {
    try {
      const parsed = JSON.parse(text) as unknown;
      const candidate =
        parsed && typeof parsed === 'object' && 'data' in parsed
          ? (parsed as { data?: unknown }).data
          : parsed;

      if (!candidate || typeof candidate !== 'object') {
        alert('Invalid JSON file.');
        return;
      }

      setState(normalizeAppState(candidate));
    } catch {
      alert('Could not parse JSON file.');
    }
  }, []);

  const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') {
        importFromJson(text);
      }
    };
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
  };

  const activeScheduleKey = viewMode === 'daily' ? 'dailySchedule' : 'schedule';

  const updateActiveSchedule = useCallback((
    updater: (schedule: AppState['schedule']) => AppState['schedule'],
  ) => {
    const today = getLocalDateKey();
    setState((prev) => {
      if (activeScheduleKey === 'schedule') {
        return { ...prev, schedule: updater(prev.schedule) };
      }
      const currentDailySchedule = prev.dailyScheduleDate === today ? prev.dailySchedule : [];
      return {
        ...prev,
        dailySchedule: updater(currentDailySchedule),
        dailyScheduleDate: today,
      };
    });
  }, [activeScheduleKey]);

  const removeEntry = useCallback((entryId: string) => {
    updateActiveSchedule((schedule) => schedule.filter((entry) => entry.id !== entryId));
  }, [updateActiveSchedule]);

  const updateEntryTime = useCallback((entryId: string, day: DayKey, startTime: string, endTime: string) => {
    updateActiveSchedule((schedule) => schedule.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              day,
              timeSlot: startTime,
              startTime,
              endTime,
            }
          : entry,
        ));
    }, [updateActiveSchedule]);

  const createEntry = useCallback((activityId: string, day: DayKey, startTime: string, endTime: string): boolean => {
    const exists = state.activities.some((a) => a.id === activityId);
    if (!exists) return false;

    updateActiveSchedule((schedule) => [
        ...schedule,
        {
          id: crypto.randomUUID(),
          activityId,
          day,
          timeSlot: startTime,
          startTime,
          endTime,
        },
      ]);

    return true;
  }, [state.activities, updateActiveSchedule]);

  const addDay = useCallback(
    (label: string) => {
      setState((prev) => {
        const cleanLabel = label.trim();
        if (!cleanLabel) return prev;
        const exists = Object.values(prev.dayLabels).some(
          (currentLabel) => currentLabel.toLowerCase() === cleanLabel.toLowerCase(),
        );
        if (exists) return prev;

        const key = buildUniqueDayKey(cleanLabel, prev.days);

        return {
          ...prev,
          days: [...prev.days, key],
          dayLabels: {
            ...prev.dayLabels,
            [key]: cleanLabel,
          },
        };
      });
    },
    [buildUniqueDayKey],
  );

  const removeDay = useCallback((day: DayKey) => {
    setState((prev) => {
      if (!prev.days.includes(day) || prev.days.length <= 1) return prev;
      const nextDayLabels = { ...prev.dayLabels };
      delete nextDayLabels[day];

      return {
        ...prev,
        days: prev.days.filter((d) => d !== day),
        dayLabels: nextDayLabels,
        schedule: prev.schedule.filter((entry) => entry.day !== day),
      };
    });
  }, []);

  const addActivity = useCallback((activity: Omit<Activity, 'id'>) => {
    setState((prev) => ({
      ...prev,
      activities: [...prev.activities, { id: crypto.randomUUID(), ...activity }],
    }));
  }, []);

  const updateActivity = useCallback((activityId: string, activity: Omit<Activity, 'id'>) => {
    setState((prev) => ({
      ...prev,
      activities: prev.activities.map((current) =>
        current.id === activityId ? { ...current, ...activity } : current,
      ),
    }));
  }, []);

  const removeActivity = useCallback((activityId: string) => {
    setState((prev) => ({
      ...prev,
      activities: prev.activities.filter((activity) => activity.id !== activityId),
      schedule: prev.schedule.filter((entry) => entry.activityId !== activityId),
      dailySchedule: prev.dailySchedule.filter((entry) => entry.activityId !== activityId),
      starredActivityIds: prev.starredActivityIds.filter((id) => id !== activityId),
    }));
  }, []);

  const toggleStar = useCallback((activityId: string) => {
    setState((prev) => ({
      ...prev,
      starredActivityIds: prev.starredActivityIds.includes(activityId)
        ? prev.starredActivityIds.filter((id) => id !== activityId)
        : [...prev.starredActivityIds, activityId],
    }));
  }, []);

  const toggleCompletion = useCallback((completion: Omit<CompletionRecord, 'completedAt'>) => {
    setState((prev) => {
      const alreadyCompleted = prev.completions.some(
        (record) => record.entryId === completion.entryId && record.date === completion.date,
      );
      return {
        ...prev,
        completions: alreadyCompleted
          ? prev.completions.filter((record) => record.entryId !== completion.entryId || record.date !== completion.date)
          : [...prev.completions, { ...completion, completedAt: new Date().toISOString() }],
      };
    });
  }, []);

  const handleSaveToFavorite = useCallback(
    (index: number) => {
      const current = favorites[index];
      const suggested = current?.name ?? `Preset ${index + 1}`;
      const name = window
        .prompt(`Adj nevet a(z) ${index + 1}. presetnek (ez menti felül a meglévőt):`, suggested)
        ?.trim();
      if (!name) return;
      setFavorites((prev) => {
        const next = [...prev];
        next[index] = { name, data: state };
        return next;
      });
      setMenuOpen(false);
    },
    [favorites, state],
  );

  const handleLoadFavorite = useCallback(
    (index: number) => {
      const fav = favorites[index];
      if (!fav) return;
      setState((prev) => ({ ...normalizeAppState(fav.data), completions: prev.completions }));
      setMenuOpen(false);
    },
    [favorites],
  );

  if (authStatus !== 'authenticated' || !cloudReady) {
    const loading = authStatus === 'initializing'
      || (authStatus === 'authenticated' && syncStatus === 'loading');
    const message = cloudError || authError;

    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
        <section className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-800">TimePlan</h1>
          <p className="mt-2 text-sm text-gray-600">
            {loading
              ? 'Loading your planner...'
              : authStatus === 'authenticated'
                ? 'Your planner could not be synchronized.'
                : 'Sign in to access your planner.'}
          </p>
          {message && <p role="alert" className="mt-3 break-words text-sm text-red-600">{message}</p>}
          {authStatus === 'authenticated' && !loading ? (
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCloudErrorState(null);
                  setHydrateAttempt((attempt) => attempt + 1);
                }}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Sign out
              </button>
            </div>
          ) : authStatus === 'anonymous' || authStatus === 'error' ? (
            <button
              type="button"
              onClick={() => {
                setCloudErrorState(null);
                void login().catch((error: unknown) => {
                  setCloudErrorState({
                    sessionKey: authSessionKey,
                    error: error instanceof Error ? error.message : 'Could not start sign-in.',
                  });
                });
              }}
              className="mt-5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sign in with Pocket ID
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <div className="printable-root flex flex-col h-screen bg-gray-100 overflow-hidden print:h-auto print:overflow-visible print:bg-white">
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0 print:hidden">
        <h1 className="text-lg font-bold text-gray-800 tracking-tight">📅 TimePlan</h1>
        <span className="hidden sm:inline text-gray-300">|</span>
        <span className="hidden sm:inline text-sm text-gray-500">Weekly time planner</span>
        <div className="ml-auto flex items-center gap-2">
          <span
            role="status"
            title={cloudError || undefined}
            className={`hidden md:inline text-xs ${syncStatus === 'error' ? 'text-red-600' : 'text-gray-500'}`}
          >
            {syncStatus === 'saving' ? 'Saving…' : syncStatus === 'error' ? 'Save failed' : 'Saved'}
          </span>
          <span className="hidden lg:inline max-w-32 truncate text-xs text-gray-500">{userName}</span>
          <button
            type="button"
            onClick={logout}
            className="text-xs rounded-md border border-gray-200 px-2.5 py-1.5 text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
          {/* Zoom controls for calendar slot duration */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={zoomIn}
              title={`Zoom in (decrease slot duration) — min ${ZOOM_CONFIG.minMinutes} min`}
              className="text-xs bg-white hover:bg-gray-50 text-gray-700 px-2 py-1 rounded-md border border-gray-200 shadow-sm transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <div className="text-xs text-gray-600 px-2 py-1">{zoomMinutes} min</div>
            <button
              type="button"
              onClick={zoomOut}
              title={`Zoom out (increase slot duration) — max ${ZOOM_CONFIG.maxMinutes} min`}
              className="text-xs bg-white hover:bg-gray-50 text-gray-700 px-2 py-1 rounded-md border border-gray-200 shadow-sm transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </button>
          </div>
          {state.activities.length > 0 && (
            <span className="hidden sm:inline text-xs text-gray-400">
              {state.activities.length} activities · {state.schedule.length} sessions scheduled
            </span>
          )}
          <button
            onClick={openFilePicker}
            className="hidden sm:flex text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-md transition-colors cursor-pointer items-center gap-1"
          >
            ↑ Import CSV
          </button>
          {state.schedule.length > 0 && (
            <button
              onClick={handlePrintSchedule}
              className="text-xs bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded-md transition-colors cursor-pointer"
            >
              Print
            </button>
          )}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="text-xs bg-white hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-md border border-gray-200 shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
              title="Menü"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>Menü</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Kedvencek
                </p>
                {favorites.map((fav, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 px-2 mx-1 rounded-md group"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadFavorite(i)}
                      disabled={!fav}
                      className={`flex-1 text-left text-sm py-1.5 px-1 truncate transition-colors ${
                        fav
                          ? 'text-gray-700 hover:text-indigo-600 cursor-pointer'
                          : 'text-gray-300 cursor-default italic'
                      }`}
                      title={fav ? `Betölt: ${fav.name}` : 'Üres preset'}
                    >
                      {fav ? fav.name : `— Üres preset ${i + 1} —`}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveToFavorite(i)}
                      className="shrink-0 p-1 rounded text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors cursor-pointer"
                      title={`Ide menti az aktuális napirendet (${i + 1}. preset)`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V3m0 4h8M8 3h8v4"
                        />
                      </svg>
                    </button>
                  </div>
                ))}

                <hr className="my-1 border-gray-100" />

                <button
                  type="button"
                  onClick={() => {
                    setShowCompletionLog(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <span>Elvégzett feladatok</span>
                  <span className="text-xs tabular-nums text-gray-400">{state.completions.length}</span>
                </button>

                <hr className="my-1 border-gray-100" />

                <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Fájl
                </p>
                <button
                  type="button"
                  onClick={() => {
                    exportAsJson();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  💾 Save JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openJsonPicker();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  📂 Load JSON
                </button>
                {state.activities.length > 0 && (
                  <>
                    <hr className="my-1 border-gray-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setState((prev) => ({
                          ...prev,
                          activities: [],
                          schedule: [],
                          dailySchedule: [],
                          dailyScheduleDate: getLocalDateKey(),
                          starredActivityIds: [],
                          completions: [],
                        }));
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-1.5 text-sm text-red-400 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      🗑 Clear all data
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {showProgressPanel && (
        <div className="hidden sm:block print:hidden">
          <ProgressPanel activities={state.activities} schedule={state.schedule} />
        </div>
      )}

      <div className="relative flex flex-1 overflow-hidden print:block print:overflow-visible">
        <div className={`${showActivities ? 'hidden sm:flex' : 'hidden'} w-64 shrink-0 overflow-hidden flex-col print:hidden`}>
          <Backlog
            activities={state.activities}
            schedule={state.schedule}
            starredActivityIds={state.starredActivityIds}
            onAddActivity={addActivity}
            onUpdateActivity={updateActivity}
            onRemoveActivity={removeActivity}
            onToggleStar={toggleStar}
          />
        </div>

        {showActivities && (
          <div className="sm:hidden absolute inset-0 z-30 bg-gray-900/30 print:hidden">
            <div className="h-full w-[88%] max-w-sm bg-white shadow-xl">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
                <p className="text-sm font-semibold text-gray-700">Activities</p>
                <button
                  type="button"
                  onClick={() => setShowActivities(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="h-[calc(100%-42px)]">
                <Backlog
                  activities={state.activities}
                  schedule={state.schedule}
                  starredActivityIds={state.starredActivityIds}
                  onAddActivity={addActivity}
                  onUpdateActivity={updateActivity}
                  onRemoveActivity={removeActivity}
                  onToggleStar={toggleStar}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden print:overflow-visible">
          <WeeklyPlanner
            activities={state.activities}
            schedule={activeScheduleKey === 'dailySchedule'
              ? (state.dailyScheduleDate === getLocalDateKey() ? state.dailySchedule : [])
              : state.schedule}
            completions={state.completions}
            now={now}
            onToggleCompletion={toggleCompletion}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            days={viewMode === 'daily' ? ['Today'] : state.days}
            dayLabels={viewMode === 'daily' ? { Today: 'Mai nap' } : state.dayLabels}
            snapMinutes={snapMinutes}
            zoomMinutes={zoomMinutes}
            onRemoveEntry={removeEntry}
            onUpdateEntryTime={updateEntryTime}
            onCreateEntry={createEntry}
            onAddDay={addDay}
            onRemoveDay={removeDay}
          />
        </div>
      </div>

      <div className="fixed right-4 bottom-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 print:hidden">
        {snapToast && (
          <div className="rounded-full border border-emerald-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-lg backdrop-blur">
            {snapToast}
          </div>
        )}

        <div className="flex max-w-[calc(100vw-2rem)] flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={toggleSnapMinutes}
            className={`text-xs px-3 py-1.5 rounded-md border shadow-sm transition-colors cursor-pointer backdrop-blur ${
              snapMinutes === 5
                ? 'border-emerald-300 bg-emerald-50/95 text-emerald-700 hover:bg-emerald-100'
                : 'border-gray-200 bg-white/95 text-gray-700 hover:bg-white'
            }`}
            title="Toggle snap granularity (Ctrl)"
          >
            Snap: {snapMinutes} min · Ctrl
          </button>
          <button
            type="button"
            onClick={() => setShowProgressPanel((prev) => !prev)}
            className="text-xs bg-white/95 hover:bg-white text-gray-700 px-3 py-1.5 rounded-md border border-gray-200 shadow-sm transition-colors cursor-pointer backdrop-blur"
          >
            {showProgressPanel ? 'Hide Weekly Progress' : 'Show Weekly Progress'}
          </button>
          <button
            type="button"
            onClick={() => setShowActivities((prev) => !prev)}
            className="sm:hidden text-xs bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-md shadow-sm transition-colors cursor-pointer"
          >
            {showActivities ? 'Hide Activities' : 'Show Activities'}
          </button>
          <button
            type="button"
            onClick={() => setShowActivities((prev) => !prev)}
            className="hidden sm:inline-flex text-xs bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-md shadow-sm transition-colors cursor-pointer"
          >
            {showActivities ? 'Hide Activities' : 'Show Activities'}
          </button>
        </div>
      </div>

      <CSVImport onFile={handleCSVFile} />
      {showCompletionLog && (
        <CompletionLogDialog
          completions={state.completions}
          onClose={() => setShowCompletionLog(false)}
        />
      )}
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleJsonFileChange}
      />
    </div>
  );
}

export default App;
