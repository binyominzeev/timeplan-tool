import { useState } from 'react';
import type { Activity, DayKey, ScheduledEntry } from '../types';
import { DAY_LABELS, DAYS } from '../types';
import { CalendarSlot } from './CalendarSlot';

interface Props {
  activities: Activity[];
  schedule: ScheduledEntry[];
  timeSlots: string[];
  onRemoveEntry: (entryId: string) => void;
  onAddTimeSlot: (slot: string) => void;
}

export function WeeklyPlanner({
  activities,
  schedule,
  timeSlots,
  onRemoveEntry,
  onAddTimeSlot,
}: Props) {
  const [newSlot, setNewSlot] = useState('');
  const [addingSlot, setAddingSlot] = useState(false);

  const handleAddSlot = () => {
    const val = newSlot.trim();
    if (val && !timeSlots.includes(val)) {
      onAddTimeSlot(val);
    }
    setNewSlot('');
    setAddingSlot(false);
  };

  // Stats per day
  const minutesPerDay = (day: DayKey): number =>
    schedule
      .filter((e) => e.day === day)
      .reduce((sum, e) => {
        const act = activities.find((a) => a.id === e.activityId);
        return sum + (act?.dailyMinutes ?? 0);
      }, 0);

  const totalWeeklyMinutes = DAYS.reduce((sum, d) => sum + minutesPerDay(d), 0);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Week-level stats bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 text-xs text-gray-500 bg-gray-50">
        <span className="font-semibold text-gray-600">Weekly total:</span>
        <span>{Math.round(totalWeeklyMinutes)} min</span>
        <span>·</span>
        <span>{(totalWeeklyMinutes / 60).toFixed(1)} h</span>
        <span>·</span>
        <span>{schedule.length} sessions</span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 sticky top-0 z-10">
              <th className="w-16 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-r border-gray-200 px-2 py-2">
                Time
              </th>
              {DAYS.map((day) => (
                <th
                  key={day}
                  className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide border-b border-r border-gray-200 px-2 py-2"
                >
                  <div>{DAY_LABELS[day]}</div>
                  <div className="text-gray-400 font-normal text-xs">
                    {minutesPerDay(day) > 0 && `${minutesPerDay(day)} min`}
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
                {DAYS.map((day) => {
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
            <tr>
              <td colSpan={6} className="px-2 py-1.5">
                {addingSlot ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={newSlot}
                      onChange={(e) => setNewSlot(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs"
                      autoFocus
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
                  <button
                    onClick={() => setAddingSlot(true)}
                    className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    + Add time slot
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
