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
import { loadState, saveState } from './utils/storage';
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

function App() {
  const [state, setState] = useState<AppState>(loadState);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [showMobileActivities, setShowMobileActivities] = useState(false);
  const handlePrintSchedule = useCallback(() => window.print(), []);

  // Active drag item (for DragOverlay)
  const [activeActivityId, setActiveActivityId] = useState<string | null>(null);

  // Persist on every state change
  useEffect(() => {
    saveState(state);
  }, [state]);

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
              onClick={() => setShowMobileActivities((prev) => !prev)}
              className="sm:hidden text-xs bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-md transition-colors cursor-pointer"
            >
              {showMobileActivities ? 'Hide Activities' : 'Activities'}
            </button>
            <button
              onClick={openFilePicker}
              className="hidden sm:flex text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-md transition-colors cursor-pointer items-center gap-1"
            >
              ↑ Import CSV
            </button>
            <button
              onClick={exportAsJson}
              className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-md transition-colors cursor-pointer"
            >
              Save JSON
            </button>
            <button
              onClick={openJsonPicker}
              className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md transition-colors cursor-pointer"
            >
              Load JSON
            </button>
            {state.schedule.length > 0 && (
              <button
                onClick={handlePrintSchedule}
                className="text-xs bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded-md transition-colors cursor-pointer"
              >
                Print
              </button>
            )}
            {state.activities.length > 0 && (
              <button
                onClick={() =>
                  setState((prev) => ({ ...prev, activities: [], schedule: [] }))
                }
                className="text-xs text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                title="Clear all data"
              >
                Clear
              </button>
            )}
          </div>
        </header>

        {/* Progress bar */}
        <div className="hidden sm:block print:hidden">
          <ProgressPanel activities={state.activities} schedule={state.schedule} />
        </div>

        {/* Main area */}
        <div className="relative flex flex-1 overflow-hidden print:block print:overflow-visible">
          {/* Backlog – fixed width */}
          <div className="hidden sm:flex w-64 shrink-0 overflow-hidden flex-col print:hidden">
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
              onAddTimeSlot={addTimeSlot}
              onAddDay={addDay}
              onRemoveDay={removeDay}
            />
          </div>
        </div>
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
