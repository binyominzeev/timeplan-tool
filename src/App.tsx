import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

import type { Activity, AppState, DayKey } from './types';
import { DAYS } from './types';
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

    if (!DAYS.includes(day)) return;

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
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">Weekly time planner</span>
          <div className="ml-auto flex items-center gap-2">
            {state.activities.length > 0 && (
              <span className="text-xs text-gray-400">
                {state.activities.length} activities · {state.schedule.length} sessions scheduled
              </span>
            )}
            <button
              onClick={openFilePicker}
              className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1"
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
        <div className="print:hidden">
          <ProgressPanel activities={state.activities} schedule={state.schedule} />
        </div>

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
          {/* Backlog – fixed width */}
          <div className="w-64 shrink-0 overflow-hidden flex flex-col print:hidden">
            <Backlog
              activities={state.activities}
              schedule={state.schedule}
              onAddActivity={addActivity}
              onUpdateActivity={updateActivity}
            />
          </div>

          {/* Planner – fills remaining space */}
          <div className="flex-1 overflow-hidden print:overflow-visible">
            <WeeklyPlanner
              activities={state.activities}
              schedule={state.schedule}
              timeSlots={state.timeSlots}
              onRemoveEntry={removeEntry}
              onAddTimeSlot={addTimeSlot}
            />
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <CSVImport onFile={handleCSVFile} />

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
