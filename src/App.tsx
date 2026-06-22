import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

import type { Activity, AppState, DayKey } from './types';
import { DEFAULT_DAYS, DEFAULT_DAY_LABELS } from './types';
import { parseCSV } from './utils/csvParser';
import { loadFavorites, loadState, saveFavorites, saveState } from './utils/storage';
import type { Favorite } from './utils/storage';
import {
  buildTimeRange,
  getActivityDurationMinutes,
  minutesToTime,
  parseTimeToMinutes,
} from './utils/time';

import { Backlog } from './components/Backlog';
import { WeeklyPlanner } from './components/WeeklyPlanner';
import { ProgressPanel } from './components/ProgressPanel';
import { CSVImport } from './components/CSVImport';
import { ActivityCard } from './components/ActivityCard';

function getNextTimeRangeInDay(
  prev: AppState,
  day: DayKey,
  timeSlot: string,
  activityId: string,
  excludeEntryId?: string,
): { startTime: string; endTime: string } {
  const activity = prev.activities.find((a) => a.id === activityId);
  const durationMinutes = getActivityDurationMinutes(activity);

  const slotStartMinutes = parseTimeToMinutes(timeSlot);
  const dayIntervals = prev.schedule
    .filter(
      (entry) => entry.day === day && entry.id !== excludeEntryId,
    )
    .map((entry) => {
      const entryActivity = prev.activities.find((a) => a.id === entry.activityId);
      const entryDuration = getActivityDurationMinutes(entryActivity);
      const entryStart = entry.startTime ?? entry.timeSlot;
      const entryEnd = entry.endTime ?? buildTimeRange(entryStart, entryDuration).endTime;
      return {
        start: parseTimeToMinutes(entryStart),
        end: parseTimeToMinutes(entryEnd),
      };
    })
    .sort((a, b) => a.start - b.start);

  let nextStartMinutes = slotStartMinutes;
  for (const interval of dayIntervals) {
    if (interval.end <= nextStartMinutes) continue;
    const candidateEnd = nextStartMinutes + durationMinutes;

    if (candidateEnd <= interval.start) {
      break;
    }

    nextStartMinutes = interval.end;
  }

  return {
    startTime: minutesToTime(nextStartMinutes),
    endTime: minutesToTime(nextStartMinutes + durationMinutes),
  };
}

function getEntryRangeMinutes(
  state: AppState,
  entry: AppState['schedule'][number],
): { start: number; end: number } {
  const activity = state.activities.find((a) => a.id === entry.activityId);
  const duration = getActivityDurationMinutes(activity);
  const start = parseTimeToMinutes(entry.startTime ?? entry.timeSlot);
  const end = parseTimeToMinutes(entry.endTime ?? buildTimeRange(entry.startTime ?? entry.timeSlot, duration).endTime);
  return { start, end };
}

function shiftEntryByMinutesWithCascade(
  prev: AppState,
  entryId: string,
  minutes: number,
): AppState {
  const delta = Math.round(minutes);
  if (!Number.isFinite(minutes) || delta === 0) return prev;

  const target = prev.schedule.find((entry) => entry.id === entryId);
  if (!target) return prev;

  const dayEntries = prev.schedule
    .filter((entry) => entry.day === target.day)
    .sort((a, b) => {
      const aStart = parseTimeToMinutes(a.startTime ?? a.timeSlot);
      const bStart = parseTimeToMinutes(b.startTime ?? b.timeSlot);
      if (aStart !== bStart) return aStart - bStart;
      return a.id.localeCompare(b.id);
    });

  const targetIndex = dayEntries.findIndex((entry) => entry.id === entryId);
  if (targetIndex === -1) return prev;

  const updates = new Map<string, { startTime: string; endTime: string }>();
  const targetRange = getEntryRangeMinutes(prev, target);

  if (delta > 0) {
    let chainEnd = targetRange.end + delta;

    updates.set(target.id, {
      startTime: minutesToTime(targetRange.start + delta),
      endTime: minutesToTime(chainEnd),
    });

    for (let index = targetIndex + 1; index < dayEntries.length; index += 1) {
      const current = dayEntries[index];
      const currentRange = getEntryRangeMinutes(prev, current);

      if (currentRange.start >= chainEnd) {
        break;
      }

      const shiftBy = chainEnd - currentRange.start;
      const nextStart = currentRange.start + shiftBy;
      const nextEnd = currentRange.end + shiftBy;

      updates.set(current.id, {
        startTime: minutesToTime(nextStart),
        endTime: minutesToTime(nextEnd),
      });

      chainEnd = nextEnd;
    }
  } else {
    let chainStart = targetRange.start + delta;

    updates.set(target.id, {
      startTime: minutesToTime(chainStart),
      endTime: minutesToTime(targetRange.end + delta),
    });

    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      const current = dayEntries[index];
      const currentRange = getEntryRangeMinutes(prev, current);

      if (currentRange.end <= chainStart) {
        break;
      }

      const shiftBy = chainStart - currentRange.end;
      const nextStart = currentRange.start + shiftBy;
      const nextEnd = currentRange.end + shiftBy;

      updates.set(current.id, {
        startTime: minutesToTime(nextStart),
        endTime: minutesToTime(nextEnd),
      });

      chainStart = nextStart;
    }
  }

  if (updates.size === 0) return prev;

  return {
    ...prev,
    schedule: prev.schedule.map((entry) => {
      const update = updates.get(entry.id);
      return update ? { ...entry, ...update } : entry;
    }),
  };
}

function App() {
  const [state, setState] = useState<AppState>(loadState);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showProgressPanel, setShowProgressPanel] = useState(true);
  const [showDesktopActivities, setShowDesktopActivities] = useState(true);
  const [showMobileActivities, setShowMobileActivities] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [favorites, setFavorites] = useState<Array<Favorite | null>>(loadFavorites);
  const handlePrintSchedule = useCallback(() => window.print(), []);

  // Active drag item (for DragOverlay)
  const [activeActivityId, setActiveActivityId] = useState<string | null>(null);

  // Persist on every state change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Persist favorites
  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  // Close menu on outside click
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── CSV import ────────────────────────────────────────────────────────────
  const handleCSVFile = useCallback((text: string) => {
    const imported = parseCSV(text);
    if (imported.length === 0) {
      alert('No activities found in the CSV. Please check the file format.');
      return;
    }
    setState((prev) => ({
      ...prev,
      activities: imported,
      // Clear schedule when re-importing so stale activityIds are removed
      schedule: [],
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

      const incoming = candidate as Partial<AppState>;
      const days = Array.isArray(incoming.days)
        ? Array.from(
            new Set(
              incoming.days
                .filter((day): day is string => typeof day === 'string')
                .map((day) => day.trim())
                .filter(Boolean),
            ),
          )
        : DEFAULT_DAYS;

      const dayLabels = days.reduce<Record<string, string>>((acc, day) => {
        const label = incoming.dayLabels?.[day];
        acc[day] =
          typeof label === 'string' && label.trim()
            ? label
            : (DEFAULT_DAY_LABELS[day] ?? day);
        return acc;
      }, {});

      setState({
        activities: Array.isArray(incoming.activities) ? incoming.activities : [],
        schedule: Array.isArray(incoming.schedule)
          ? incoming.schedule.filter((entry) => days.includes(entry.day))
          : [],
        timeSlots: Array.isArray(incoming.timeSlots) ? incoming.timeSlots : [],
        days,
        dayLabels,
      });
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

  // ── Schedule mutations ────────────────────────────────────────────────────
  const removeEntry = useCallback((entryId: string) => {
    setState((prev) => ({
      ...prev,
      schedule: prev.schedule.filter((e) => e.id !== entryId),
    }));
  }, []);

  const shiftEntryLater = useCallback((entryId: string) => {
    const raw = window.prompt('Hány perccel tolod későbbre a kezdést?', '15')?.trim();
    if (!raw) return;

    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes === 0) {
      alert('Adj meg egy nem nulla perc értéket.');
      return;
    }

    setState((prev) => shiftEntryByMinutesWithCascade(prev, entryId, minutes));
  }, []);

  const addTimeSlot = useCallback((slot: string) => {
    setState((prev) => {
      const sorted = [...prev.timeSlots, slot].sort();
      return { ...prev, timeSlots: sorted };
    });
  }, []);

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

  // ── Favorites ────────────────────────────────────────────────────────────
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
      setState(fav.data);
      setMenuOpen(false);
    },
    [favorites],
  );

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith('activity:')) {
      setActiveActivityId(id.replace('activity:', ''));
    } else if (id.startsWith('slot:')) {
      const data = event.active.data.current as { activityId: string };
      setActiveActivityId(data.activityId);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveActivityId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // over must be a droppable slot: "slot:Mon:10:00"
    if (!overId.startsWith('slot:')) return;

    const parts = overId.split(':');
    // Format: slot:<Day>:<HH>:<MM>
    const day = parts[1] as DayKey;
    const timeSlot = `${parts[2]}:${parts[3]}`;

    if (!state.days.includes(day)) return;

    if (activeId.startsWith('activity:')) {
      // Drop from backlog → create new entry
      const activityId = activeId.replace('activity:', '');
      setState((prev) => ({
        ...prev,
        schedule: [
          ...prev.schedule,
          {
            id: crypto.randomUUID(),
            activityId,
            day,
            timeSlot,
            ...getNextTimeRangeInDay(prev, day, timeSlot, activityId),
          },
        ],
      }));
    } else if (activeId.startsWith('slot:')) {
      // Move existing slot entry
      const slotEntryId = activeId.replace('slot:', '');
      setState((prev) => {
        const movedEntry = prev.schedule.find((e) => e.id === slotEntryId);
        if (!movedEntry) return prev;
        const nextRange = getNextTimeRangeInDay(
          prev,
          day,
          timeSlot,
          movedEntry.activityId,
          slotEntryId,
        );
        return {
          ...prev,
          schedule: prev.schedule.map((e) => {
            if (e.id !== slotEntryId) return e;
            return { ...e, day, timeSlot, ...nextRange };
          }),
        };
      });
    }
  };

  // ── Active overlay card ───────────────────────────────────────────────────
  const activeActivity: Activity | undefined = activeActivityId
    ? state.activities.find((a) => a.id === activeActivityId)
    : undefined;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="printable-root flex flex-col h-screen bg-gray-100 overflow-hidden print:h-auto print:overflow-visible print:bg-white">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0 print:hidden">
          <h1 className="text-lg font-bold text-gray-800 tracking-tight">📅 TimePlan</h1>
          <span className="hidden sm:inline text-gray-300">|</span>
          <span className="hidden sm:inline text-sm text-gray-500">Weekly time planner</span>
          <div className="ml-auto flex items-center gap-2">
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
            {/* Main menu */}
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
                  {/* Favorites section */}
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

                  {/* JSON actions */}
                  <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Fájl
                  </p>
                  <button
                    type="button"
                    onClick={() => { exportAsJson(); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    💾 Save JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => { openJsonPicker(); setMenuOpen(false); }}
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
                          setState((prev) => ({ ...prev, activities: [], schedule: [] }));
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

        {/* Progress bar */}
        {showProgressPanel && (
          <div className="hidden sm:block print:hidden">
            <ProgressPanel activities={state.activities} schedule={state.schedule} />
          </div>
        )}

        {/* Main area */}
        <div className="relative flex flex-1 overflow-hidden print:block print:overflow-visible">
          {/* Backlog – fixed width */}
          <div className={`${showDesktopActivities ? 'hidden sm:flex' : 'hidden'} w-64 shrink-0 overflow-hidden flex-col print:hidden`}>
            <Backlog
              activities={state.activities}
              schedule={state.schedule}
              onAddActivity={addActivity}
              onUpdateActivity={updateActivity}
            />
          </div>

          {/* Mobile activities drawer */}
          {showMobileActivities && (
            <div className="sm:hidden absolute inset-0 z-30 bg-gray-900/30 print:hidden">
              <div className="h-full w-[88%] max-w-sm bg-white shadow-xl">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
                  <p className="text-sm font-semibold text-gray-700">Activities</p>
                  <button
                    type="button"
                    onClick={() => setShowMobileActivities(false)}
                    className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                <div className="h-[calc(100%-42px)]">
                  <Backlog
                    activities={state.activities}
                    schedule={state.schedule}
                    onAddActivity={addActivity}
                    onUpdateActivity={updateActivity}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Planner – fills remaining space */}
          <div className="flex-1 overflow-hidden print:overflow-visible">
            <WeeklyPlanner
              activities={state.activities}
              schedule={state.schedule}
              timeSlots={state.timeSlots}
              days={state.days}
              dayLabels={state.dayLabels}
              onRemoveEntry={removeEntry}
              onShiftEntryLater={shiftEntryLater}
              onAddTimeSlot={addTimeSlot}
              onAddDay={addDay}
              onRemoveDay={removeDay}
            />
          </div>
        </div>
      </div>

      <div className="fixed right-4 bottom-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setShowProgressPanel((prev) => !prev)}
          className="text-xs bg-white/95 hover:bg-white text-gray-700 px-3 py-1.5 rounded-md border border-gray-200 shadow-sm transition-colors cursor-pointer backdrop-blur"
        >
          {showProgressPanel ? 'Hide Weekly Progress' : 'Show Weekly Progress'}
        </button>
        <button
          type="button"
          onClick={() => setShowMobileActivities((prev) => !prev)}
          className="sm:hidden text-xs bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-md shadow-sm transition-colors cursor-pointer"
        >
          {showMobileActivities ? 'Hide Activities' : 'Show Activities'}
        </button>
        <button
          type="button"
          onClick={() => setShowDesktopActivities((prev) => !prev)}
          className="hidden sm:inline-flex text-xs bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-md shadow-sm transition-colors cursor-pointer"
        >
          {showDesktopActivities ? 'Hide Activities' : 'Show Activities'}
        </button>
      </div>

      {/* Hidden file input */}
      <CSVImport onFile={handleCSVFile} />
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleJsonFileChange}
      />

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeActivity && (
          <div className="w-52 opacity-90 rotate-2 shadow-xl">
            <ActivityCard
              activity={activeActivity}
              schedule={state.schedule}
              inSlot={false}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default App;
