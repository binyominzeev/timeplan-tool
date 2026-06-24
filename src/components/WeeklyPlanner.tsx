import { useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventReceiveArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import type {
  EventContentArg,
  EventDropArg,
  EventInput,
  EventMountArg,
} from '@fullcalendar/core';
import type { Activity, DayKey, ScheduledEntry } from '../types';
import { getCategoryColorSet } from '../utils/categoryColors';
import { minutesToHoursString, parseTimeToMinutes } from '../utils/time';

interface Props {
  activities: Activity[];
  schedule: ScheduledEntry[];
  days: DayKey[];
  dayLabels: Record<DayKey, string>;
  snapMinutes: number;
  onRemoveEntry: (entryId: string) => void;
  onUpdateEntryTime: (entryId: string, day: DayKey, startTime: string, endTime: string) => void;
  onCreateEntry: (activityId: string, day: DayKey, startTime: string, endTime: string) => boolean;
  onAddDay: (label: string) => void;
  onRemoveDay: (day: DayKey) => void;
  zoomMinutes: number;
}

function getDateForIndex(index: number): string {
  // Fixed reference week where Monday is 2026-01-05.
  const safeIndex = Math.max(0, index);
  const base = new Date('2026-01-05T00:00:00');
  const d = new Date(base);
  d.setDate(base.getDate() + safeIndex);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function timeFromDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getReferenceNow(dayCount: number): Date {
  const current = new Date();
  const jsDay = current.getDay();
  const mondayBasedIndex = (jsDay + 6) % 7;
  const mappedIndex = Math.min(Math.max(0, mondayBasedIndex), Math.max(0, dayCount - 1));
  const reference = new Date(`${getDateForIndex(mappedIndex)}T00:00:00`);
  reference.setHours(current.getHours(), current.getMinutes(), current.getSeconds(), current.getMilliseconds());
  return reference;
}

function dateKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatEventRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return '';
  return `${timeFromDate(start)}-${timeFromDate(end)}`;
}

function normalizeClock(value: string): string {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return '09:00';
  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2] ?? '0')));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function plusMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function minutesToDurationString(minutes: number): string {
  const safeMinutes = Math.max(5, Math.round(minutes));
  return `00:${String(safeMinutes).padStart(2, '0')}:00`;
}

function dayFromDate(date: Date, dayColumns: { day: DayKey; label: string; date: string }[]): DayKey | undefined {
  const target = dateKeyFromDate(date);
  return dayColumns.find((column) => column.date === target)?.day;
}

export function WeeklyPlanner({
  activities,
  schedule,
  days,
  dayLabels,
  snapMinutes,
  zoomMinutes,
  onRemoveEntry,
  onUpdateEntryTime,
  onCreateEntry,
  onAddDay,
  onRemoveDay,
}: Props) {
  const plannerContainerRef = useRef<HTMLDivElement>(null);

  const centerNowIndicatorInView = () => {
    const root = plannerContainerRef.current;
    if (!root) return;

    const scrollerCandidates = Array.from(root.querySelectorAll<HTMLElement>('.fc-scroller'))
      .filter((element) => element.scrollHeight > element.clientHeight + 20);
    const scroller =
      scrollerCandidates.find((element) => element.closest('.fc-timegrid'))
      ?? scrollerCandidates[0]
      ?? null;
    const nowLine = root.querySelector<HTMLElement>('.fc-timegrid-now-indicator-line');

    if (!scroller || !nowLine) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const lineRect = nowLine.getBoundingClientRect();
    const lineOffsetInScroll = lineRect.top - scrollerRect.top + scroller.scrollTop;
    const targetScrollTop = Math.max(0, lineOffsetInScroll - scroller.clientHeight / 2);

    // Use immediate scrolling so repeated zoom clicks do not queue smooth animations.
    scroller.scrollTo({ top: targetScrollTop, behavior: 'auto' });
  };

  useEffect(() => {
    // Wait for FullCalendar layout updates caused by zoom change, then recenter.
    let frame2 = 0;
    let timeoutId = 0;
    const frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        centerNowIndicatorInView();

        // A short delayed pass makes repeated rapid zoom clicks more stable.
        timeoutId = window.setTimeout(() => {
          centerNowIndicatorInView();
        }, 100);
      });
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      if (frame2) {
        window.cancelAnimationFrame(frame2);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [zoomMinutes]);

  const dayColumns = days.map((day, index) => ({
    day,
    label: dayLabels[day] ?? day,
    date: getDateForIndex(index),
  }));

  const events: EventInput[] = schedule
    .map((entry) => {
      const activity = activities.find((a) => a.id === entry.activityId);

      const date = dayColumns.find((column) => column.day === entry.day)?.date ?? dayColumns[0]?.date ?? getDateForIndex(0);
      const startTime = normalizeClock(entry.startTime ?? entry.timeSlot);
      const durationMinutes = Math.max(15, activity?.dailyMinutes ?? 60);
      const endTime =
        (entry.endTime ? normalizeClock(entry.endTime) : undefined) ??
        `${String(Math.floor((parseTimeToMinutes(startTime) + durationMinutes) / 60) % 24).padStart(2, '0')}:${String((parseTimeToMinutes(startTime) + durationMinutes) % 60).padStart(2, '0')}`;

      return {
        id: entry.id,
        title: activity?.name ?? `Unknown activity (${entry.activityId.slice(0, 6)})`,
        start: `${date}T${startTime}:00`,
        end: `${date}T${endTime}:00`,
        extendedProps: {
          day: entry.day,
          activityId: entry.activityId,
          category: activity?.category ?? 'Legacy',
        },
      } satisfies EventInput;
    })
    .filter(Boolean) as EventInput[];

  const totalWeeklyMinutes = schedule.reduce((sum, e) => {
    const activity = activities.find((a) => a.id === e.activityId);
    const start = parseTimeToMinutes(e.startTime ?? e.timeSlot);
    const fallbackEnd = start + (activity?.dailyMinutes ?? 60);
    const end = e.endTime ? parseTimeToMinutes(e.endTime) : fallbackEnd;
    return sum + Math.max(0, end - start);
  }, 0);

  const handleEventDrop = (arg: EventDropArg) => {
    const event = arg.event;
    const start = event.start;
    const end = event.end;
    if (!start || !end) {
      arg.revert();
      return;
    }

    const day = dayFromDate(start, dayColumns);
    if (!day) {
      arg.revert();
      return;
    }

    onUpdateEntryTime(event.id, day, timeFromDate(start), timeFromDate(end));
  };

  const handleEventResize = (arg: EventResizeDoneArg) => {
    const event = arg.event;
    const start = event.start;
    const end = event.end;
    if (!start || !end) {
      arg.revert();
      return;
    }

    const day = dayFromDate(start, dayColumns);
    if (!day) {
      arg.revert();
      return;
    }

    onUpdateEntryTime(event.id, day, timeFromDate(start), timeFromDate(end));
  };

  const handleExternalReceive = (arg: EventReceiveArg) => {
    const event = arg.event;
    const start = event.start;
    const rawEnd = event.end;
    const rawActivityId = String(event.extendedProps.activityId ?? '');

    if (!start) {
      arg.revert();
      return;
    }

    const day = dayFromDate(start, dayColumns);
    if (!day) {
      arg.revert();
      return;
    }

    const activity = activities.find((a) => a.id === rawActivityId)
      ?? activities.find((a) => a.name === event.title);
    const activityId = activity?.id;
    if (!activityId) {
      arg.revert();
      return;
    }

    const fallbackMinutes = Math.max(15, activity?.dailyMinutes ?? 60);
    const end = rawEnd ?? plusMinutes(start, fallbackMinutes);

    const created = onCreateEntry(activityId, day, timeFromDate(start), timeFromDate(end));
    if (!created) {
      arg.revert();
      return;
    }

    // Remove the temporary event inserted by external drag, since app state is source-of-truth.
    arg.event.remove();
  };

  const renderEventContent = (arg: EventContentArg) => {
    const category = String(arg.event.extendedProps.category ?? '');
    const colors = getCategoryColorSet(category);
    const timeRange = formatEventRange(arg.event.start, arg.event.end);
    return (
      <div className={`h-full rounded-md border px-1.5 py-1 text-[11px] leading-tight shadow-sm ${colors.event}`}>
        <div className="font-semibold truncate">{arg.event.title}</div>
        {timeRange && <div className="truncate text-[10px] font-medium" style={{ color: colors.eventStyle.accent }}>{timeRange}</div>}
        {category && <div className="truncate text-[10px] opacity-85 uppercase tracking-wide">{category}</div>}
      </div>
    );
  };

  const handleEventMount = (arg: EventMountArg) => {
    const category = String(arg.event.extendedProps.category ?? '');
    const colors = getCategoryColorSet(category);
    arg.el.style.backgroundColor = colors.eventStyle.background;
    arg.el.style.borderColor = colors.eventStyle.border;
    arg.el.style.color = colors.eventStyle.text;
  };

  return (
    <div className="relative flex flex-col h-full bg-white">
      <div className="hidden print:block px-4 pt-4 text-sm font-semibold text-gray-700">
        Weekly schedule
      </div>

      <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b border-gray-200 text-xs text-gray-500 bg-gray-50 print:flex print:bg-white">
        <span className="font-semibold text-gray-600">Weekly total:</span>
        <span>{minutesToHoursString(totalWeeklyMinutes)}</span>
        <span>·</span>
        <span>{schedule.length} sessions</span>
        <span>·</span>
        <button
          type="button"
          onClick={() => {
            const label = window.prompt('New day name (for example: Sunday):')?.trim();
            if (!label) return;
            onAddDay(label);
          }}
          className="print:hidden text-xs text-gray-500 hover:text-emerald-600 transition-colors cursor-pointer"
        >
          + Add day
        </button>
      </div>

      <div ref={plannerContainerRef} className="flex-1 overflow-auto print:overflow-visible p-2">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="customTimeGrid"
          views={{
            customTimeGrid: {
              type: 'timeGrid',
              duration: { days: Math.max(1, dayColumns.length) },
            },
          }}
          initialDate={dayColumns[0]?.date ?? getDateForIndex(0)}
          headerToolbar={false}
          allDaySlot={false}
          now={() => getReferenceNow(dayColumns.length)}
          nowIndicator
          editable
          droppable
          eventOverlap
          slotDuration={minutesToDurationString(zoomMinutes)}
          snapDuration={minutesToDurationString(snapMinutes)}
          slotLabelInterval={
            // Choose a sensible label interval based on zoom level
            zoomMinutes <= 5 ? '00:15:00' : zoomMinutes <= 15 ? '00:30:00' : '01:00:00'
          }
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          scrollTime="08:00:00"
          height="100%"
          dayHeaderContent={(args) => {
            const key = dayColumns.find((column) => column.date === dateKeyFromDate(args.date))?.day;
            if (!key) return args.text;
            return (
              <div className="flex items-center justify-center gap-1">
                <span>{dayLabels[key] ?? key}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (days.length <= 1) {
                      alert('At least one day must remain.');
                      return;
                    }
                    onRemoveDay(key);
                  }}
                  className="print:hidden text-[10px] font-bold text-gray-300 hover:text-red-500 transition-colors cursor-pointer"
                  title={`Delete ${(dayLabels[key] ?? key)}`}
                >
                  ×
                </button>
              </div>
            );
          }}
          events={events}
          eventContent={renderEventContent}
          eventDidMount={handleEventMount}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventReceive={handleExternalReceive}
          eventClick={(arg) => {
            const confirmed = window.confirm(`Delete "${arg.event.title}"?`);
            if (!confirmed) return;
            onRemoveEntry(arg.event.id);
          }}
          eventDataTransform={(input) => ({
            ...input,
            duration: input.end ? undefined : '01:00',
          })}
          dropAccept=".tp-backlog-draggable"
        />
      </div>
    </div>
  );
}
