# TimePlan Tool

A single-page weekly time-planning application built with React, TypeScript, Vite, Tailwind CSS, and dnd-kit.

## Features

- **CSV Import** — upload a CSV exported directly from your spreadsheet; category header rows are detected automatically
- **Activity Backlog** — left panel listing all imported activities grouped by category, with duration and weekly-target details
- **Weekly Time-Grid Planner** — Google Calendar-like weekly view with continuous timeline (00:00-24:00), scroll, and overlap support
- **JSON Save/Load** — export the full ready schedule to a named JSON file on your machine, then import it back anytime
- **Custom Days** — add or remove day columns (e.g. Sunday) the same way as managing time slots
- **Drag-and-Drop** — powered by FullCalendar interaction plugin; drag backlog items into the calendar, move/resize events in 15-minute steps
- **Now Indicator** — a red line marks the current time in the weekly view
- **Progress Tracking** — per-activity scheduled / target / remaining count with a progress bar
- **Statistics** — total scheduled minutes per day and for the full week
- **Persistence** — state is auto-saved to `localStorage` and restored on reload

## CSV Format

The CSV must match the following column layout (exported from the spreadsheet exactly):

| A — Tevékenység | B — Napi (perc) | C — Heti (óra) | D — Heti alkalmak | E — Megjegyzés |
|---|---|---|---|---|

Rows where columns B–D are all empty are treated as **category headers** (e.g. `Minőségi`, `Technikai`, `Magán`).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), click **Import CSV**, and select your spreadsheet export.

## Build

```bash
npm run build
```
