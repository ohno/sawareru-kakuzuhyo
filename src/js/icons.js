// The icons of the page: line drawings on a 24 × 24 grid, in the color of the text around them.
// camera, help-circle, moon, music, volume-2 and volume-x are from Feather, Copyright (c) 2013-2023 Cole Bemis,
// MIT License; rotate-ccw and sun are from Lucide, Copyright (c) 2026 Lucide Icons and Contributors, ISC License
// (see THIRD-PARTY-NOTICES). The magnifying glass is drawn for this page.

const NOTE = '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
const SPEAKER = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>';

const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  // a note, and a struck-through one while the sound is off
  soundOn: NOTE,
  soundOff: `${NOTE}<path d="M3 3l18 18"/>`,
  // a speaker with sound waves, and a crossed-out one while the reading is off
  voiceOn: `${SPEAKER}<path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>`,
  voiceOff: `${SPEAKER}<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`,
};
// the magnifying glass sits in a smaller button
const SIZE = { search: 16 };
const STROKE = { search: 2.2 };

/** the SVG of an icon */
export function icon(name) {
  const size = SIZE[name] ?? 18;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${STROKE[name] ?? 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

/** draws the icon each element names in its data-icon attribute */
export function drawIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
}
