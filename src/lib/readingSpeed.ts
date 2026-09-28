// Personal reading speed, learned from page turns in the ebook reader (like
// Kindle's "time left in chapter"). Stored per device in characters per
// minute; only recent reading counts, so the estimate follows you over time.

const KEY = 'shelf.readingSpeed';
/** About 230 words a minute, a typical adult pace, until we've learned yours. */
const DEFAULT_CPM = 1400;
/** Reading needed before the estimate counts as learned. */
const LEARNED_MS = 5 * 60_000;
/** Only this much recent reading is remembered. */
const WINDOW_MS = 3 * 60 * 60_000;
export const CHARS_PER_WORD = 6;
/** A printed page holds roughly this many characters. */
export const CHARS_PER_PAGE = 1800;

interface Stored { chars: number; ms: number }

function load(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    if (s && s.chars > 0 && s.ms > 0) return s;
  } catch { /* ignore */ }
  return { chars: 0, ms: 0 };
}

export function readingSpeed(): { cpm: number; wpm: number; learned: boolean } {
  const s = load();
  const learned = s.ms >= LEARNED_MS;
  // Blend towards the default until there's enough of your own reading.
  const weight = Math.min(1, s.ms / LEARNED_MS);
  const own = s.ms ? (s.chars / s.ms) * 60_000 : DEFAULT_CPM;
  const cpm = own * weight + DEFAULT_CPM * (1 - weight);
  return { cpm, wpm: Math.round(cpm / CHARS_PER_WORD), learned };
}

/** Add a stretch of continuous reading. Implausible stretches are ignored. */
export function recordReading(chars: number, ms: number): void {
  if (chars <= 0 || ms < 15_000) return;
  const cpm = (chars / ms) * 60_000;
  if (cpm < 150 || cpm > 6000) return; // skimming or idle, not reading
  const s = load();
  let next = { chars: s.chars + chars, ms: s.ms + ms };
  if (next.ms > WINDOW_MS) {
    const f = WINDOW_MS / next.ms;
    next = { chars: next.chars * f, ms: WINDOW_MS };
  }
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

export function resetReadingSpeed(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** "12 min", "3 h 20 min". */
export function fmtMinutes(min: number): string {
  if (!Number.isFinite(min) || min < 1) return 'less than a minute';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function timeForChars(chars: number): string {
  return fmtMinutes(chars / readingSpeed().cpm);
}
