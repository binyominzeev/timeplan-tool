// Configuration for calendar zoom (slot duration) in minutes.
// Modify these values to change allowed zoom range and step size.
export const ZOOM_CONFIG = {
  // Minimum slot duration in minutes (e.g. 5 for 5-minute slots)
  minMinutes: 5,
  // Maximum slot duration in minutes (e.g. 60 for 1-hour slots)
  maxMinutes: 60,
  // Step size when zooming in/out in minutes
  stepMinutes: 5,
  // Default starting slot duration
  defaultMinutes: 15,
};

/*
  Where to change values:
  - minMinutes: smallest slot duration allowed (minutes)
  - maxMinutes: largest slot duration allowed (minutes)
  - stepMinutes: how many minutes each zoom click changes
  - defaultMinutes: initial zoom value when the app starts

  Example: to allow zooming down to 1-minute granularity, set minMinutes: 1
*/
