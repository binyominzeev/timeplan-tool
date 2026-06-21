import { useState } from 'react';
import type { Activity, DayKey, ScheduledEntry } from '../types';
import { DEFAULT_FILL_WINDOWS, minutesToHoursString, totalWindowsMinutes } from '../utils/time';
import { CalendarSlot } from './CalendarSlot';

interface Props {
  activities: Activity[];
  schedule: ScheduledEntry[];
  timeSlots: string[];
  days: DayKey[];
  dayLabels: Record<DayKey, string>;
  onRemoveEntry: (entryId: string) => void;
  onAddTimeSlot: (slot: string) => void;
  onAddDay: (label: string) => void;
  onRemoveDay: (day: DayKey) => void;
}

export function WeeklyPlanner({
  activities,
  schedule,
  timeSlots,
  days,
  dayLabels,
  onRemoveEntry,
  onAddTimeSlot,
  onAddDay,
  onRemoveDay,
}: Props) {
  const [newSlot, setNewSlot] = useState('');
  const [addingSlot, setAddingSlot] = useState(false);
  const [pendingDeleteDay, setPendingDeleteDay] = useState<DayKey | null>(null);

  const handleAddSlot = () => {
    const raw = newSlot.trim();
    const parsed = parseFlexibleTime(raw);
    const val = parsed ?? raw;
    if (val && !timeSlots.includes(val)) {
      onAddTimeSlot(val);
    }
    setNewSlot('');
    setAddingSlot(false);
  };

  function parseFlexibleTime(input: string): string | null {
    const s = input.trim().toLowerCase();
    if (!s) return null;

    // Accept formats: '9', '9:00', '09:00', '9:00 am', '9am', '12:30pm'
    const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return null;
    let hh = Number(m[1]);
    const mm = m[2] ? Number(m[2]) : 0;
    const ampm = m[3] ? m[3].toLowerCase() : null;
    if (mm < 0 || mm > 59) return null;
    if (ampm) {
      if (hh === 12 && ampm === 'am') hh = 0;
      else if (ampm === 'pm' && hh < 12) hh += 12;
    }
    if (hh < 0 || hh > 23) return null;
    const hhStr = String(hh).padStart(2, '0');
    const mmStr = String(mm).padStart(2, '0');
    return `${hhStr}:${mmStr}`;
  }

  // Stats per day
  const minutesPerDay = (day: DayKey): number =>
    schedule
      .filter((e) => e.day === day)
      .reduce((sum, e) => {
        const act = activities.find((a) => a.id === e.activityId);
        return sum + (act?.dailyMinutes ?? 0);
      }, 0);

  const totalWeeklyMinutes = days.reduce((sum, d) => sum + minutesPerDay(d), 0);
  const windowTotal = totalWindowsMinutes(DEFAULT_FILL_WINDOWS);
  const weeklyRemaining = Math.max(0, windowTotal * days.length - totalWeeklyMinutes);

  const handleAddDay = () => {
    const label = window.prompt('New day name (for example: Sunday):')?.trim();
    if (!label) return;
    onAddDay(label);
  };

  const handleRemoveDay = (day: DayKey) => {
    if (days.length <= 1) {
      alert('At least one day must remain.');
      return;
    }
    setPendingDeleteDay(day);
  };

  return (
    <div className="relative flex flex-col h-full bg-white">
      <div className="hidden print:block px-4 pt-4 text-sm font-semibold text-gray-700">
        Weekly schedule
      </div>
      {/* Week-level stats bar */}
      <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b border-gray-200 text-xs text-gray-500 bg-gray-50 print:flex print:bg-white">
        <span className="font-semibold text-gray-600">Weekly total:</span>
        <span>{minutesToHoursString(totalWeeklyMinutes)}</span>
        <span>·</span>
        <span>{schedule.length} sessions</span>
        <span>·</span>
        <span className="text-gray-500">Kitölthető: {DEFAULT_FILL_WINDOWS.map(w=>`${w.start}-${w.end}`).join(', ')} ({minutesToHoursString(windowTotal)} / nap)</span>
        <span>·</span>
        <span className="text-orange-500">Heti szabad: {minutesToHoursString(weeklyRemaining)}</span>
      </div>

      <div className="flex-1 overflow-auto print:overflow-visible">
        <table className="w-full border-collapse text-sm print:text-xs">
          <thead>
            <tr className="bg-gray-50 sticky top-0 z-10 print:static print:bg-white">
              <th className="w-16 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-r border-gray-200 px-2 py-2">
                Time
              </th>
              {days.map((day) => (
                  <th
                  key={day}
                  className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide border-b border-r border-gray-200 px-2 py-2"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>{dayLabels[day] ?? day}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDay(day)}
                      className="print:hidden text-[10px] font-bold text-gray-300 hover:text-red-500 transition-colors cursor-pointer"
                      title={`Delete ${(dayLabels[day] ?? day)}`}
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-gray-400 font-normal text-xs">
                    {minutesToHoursString(Math.max(0, totalWindowsMinutes(DEFAULT_FILL_WINDOWS) - minutesPerDay(day)))} szabad
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((slot) => (
              <tr key={slot} className="border-b border-gray-100">
                <td className="text-xs text-gray-400 font-mono border-r border-gray-200 px-2 py-1 align-top whitespace-nowrap">
                  {slot}
                </td>
                {days.map((day) => {
                  const entries = schedule.filter(
                    (e) => e.day === day && e.timeSlot === slot,
                  );
                  return (
                    <td
                      key={day}
                      className="border-r border-gray-100 px-1 py-1 align-top"
                    >
                      <CalendarSlot
                        day={day}
                        timeSlot={slot}
                        entries={entries}
                        activities={activities}
                        onRemoveEntry={onRemoveEntry}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Add slot row */}
            <tr className="print:hidden">
              <td colSpan={days.length + 1} className="px-2 py-1.5">
                {addingSlot ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newSlot}
                      onChange={(e) => setNewSlot(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs"
                      autoFocus
                      placeholder="09:00 or 9:00 AM"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddSlot();
                        if (e.key === 'Escape') setAddingSlot(false);
                      }}
                    />
                    <button
                      onClick={handleAddSlot}
                      className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setAddingSlot(false)}
                      className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setAddingSlot(true)}
                      className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      + Add time slot
                    </button>
                    <button
                      onClick={handleAddDay}
                      className="text-xs text-gray-400 hover:text-emerald-600 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      + Add day
                    </button>
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {pendingDeleteDay && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-900/30 px-4 print:hidden">
          <div className="w-full max-w-sm rounded-xl bg-white border border-gray-200 shadow-lg p-4">
            <p className="text-sm font-semibold text-gray-800">Delete day</p>
            <p className="mt-2 text-xs text-gray-500">
              Delete "{dayLabels[pendingDeleteDay] ?? pendingDeleteDay}" and all entries scheduled in it?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteDay(null)}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemoveDay(pendingDeleteDay);
                  setPendingDeleteDay(null);
                }}
                className="text-xs px-3 py-1.5 rounded-md bg-red-500 hover:bg-red-600 text-white cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
