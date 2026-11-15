// The viewer's small choices (which panels and sections are folded), kept in the browser's localStorage. Storage may
// be unavailable (private mode, a sandboxed frame); the choices then last for this visit only.

/** what was stored under `key`, laid over `defaults` */
export function recall(key, defaults = {}) {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') };
  } catch {
    return { ...defaults };
  }
}

export function remember(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // not stored: see above
  }
}
