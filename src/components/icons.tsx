// Line icons used for navigation and key actions (24×24, stroke-based, so
// they take the current text colour).
import type { CSSProperties } from 'react';

const PATHS = {
  home: <><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9.3V19a1.5 1.5 0 0 0 1.5 1.5h3.2v-5.2h3.6v5.2H17a1.5 1.5 0 0 0 1.5-1.5V9.3" /></>,
  library: <><rect x="4" y="4" width="3.6" height="16" rx="1" /><rect x="9.2" y="6" width="3.6" height="14" rx="1" /><path d="m14.6 6.3 3.4-.9 3.3 13.8-3.4.9z" /></>,
  book: <><path d="M3 5.8c2.8-1.6 6-1.6 9 .6 3-2.2 6.2-2.2 9-.6v13c-2.8-1.4-6-1.4-9 .6-3-2-6.2-2-9-.6z" /><path d="M12 6.4v13" /></>,
  sparkle: <><path d="M11 3.5 12.9 8.6 18 10.5 12.9 12.4 11 17.5 9.1 12.4 4 10.5 9.1 8.6z" /><path d="M18.5 14.5 19.3 16.7 21.5 17.5 19.3 18.3 18.5 20.5 17.7 18.3 15.5 17.5 17.7 16.7z" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.8" /><circle cx="12" cy="12" r="1.2" /></>,
  chart: <><path d="M3.5 20.5h17" /><rect x="5" y="11" width="3.4" height="7" rx="1" /><rect x="10.3" y="5" width="3.4" height="13" rx="1" /><rect x="15.6" y="8.5" width="3.4" height="9.5" rx="1" /></>,
  bulb: <><path d="M9.5 18h5M10.3 21h3.4" /><path d="M12 3a6 6 0 0 0-3.4 10.9c.6.5 1 1.2 1 2V16h4.8v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></>,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.6 8.4-2 5.2-5.2 2 2-5.2z" /></>,
  clock: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.6 2.4M9.5 2.5h5" /></>,
  pencil: <><path d="M4 20h4.2L19 9.2a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.6 6.6 3.8 3.8" /></>,
  quote: <path d="M9.5 7H6.5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v.8a3.2 3.2 0 0 1-3.2 3.2M19.5 7h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v.8a3.2 3.2 0 0 1-3.2 3.2" />,
  logPlus: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8.2v7.6M8.2 12h7.6" /></>,
  bookmark: <path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  filter: <><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="17" r="2" /></>,
  list: <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />,
  heart: <path d="M12 20s-7.2-4.4-9.3-9A5 5 0 0 1 12 6.2a5 5 0 0 1 9.3 4.8C19.2 15.6 12 20 12 20z" />,
  flame: <path d="M12 21.5c3.9 0 6.8-2.6 6.8-6.4 0-3.3-2.3-5.6-3.9-7.2-.4 1.6-1.3 2.7-2.5 3.1.4-3.1-.7-6.4-3.2-8.9.2 2.9-1.4 5.1-2.9 6.8-1.3 1.4-2 3-2 5 0 4.3 3.4 7.6 7.7 7.6z" />,
  file: <><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" /><path d="M14 3.5V8h4.5" /></>,
  gift: <><path d="M20 12v7.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V12M3 8h18v4H3zM12 20.5V8M12 8S10.4 3.5 7.9 4.1C6.2 4.5 6.5 7.5 12 8zM12 8s1.6-4.5 4.1-3.9C17.8 4.5 17.5 7.5 12 8z" /></>,
  download: <path d="M12 4v11.5m0 0-4.2-4.2m4.2 4.2 4.2-4.2M4.5 20h15" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  arrowRight: <path d="M5 12h14m-5.5-5.5L19 12l-5.5 5.5" />,
  user: <><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.2.9-1.2 1.6v.5M12 16.8h.01" /></>,
  shelf: <><path d="M3 20.5h18M3 14.5h18" /><rect x="5" y="5" width="3" height="9.5" rx=".6" /><rect x="9" y="7" width="3" height="7.5" rx=".6" /><path d="m14 6.2 2.9.6-1.5 7.7-2.9-.6z" /></>,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  tag: <><path d="M3.5 12V4.5h7.5l9.5 9.5-7.5 7.5z" /><circle cx="7.8" cy="8.8" r="1.3" /></>,
  map: <><path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z" /><path d="M9 4.5v13M15 6.5v13" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  dots: <><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />,
  queue: <><path d="M4 6h11M4 11h11M4 16h7" /><path d="m17 14 3 3-3 3" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.6 3.5M16 6h3.5a3 3 0 0 1-3.6 3.5M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z" /></>,
  layers: <><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z" /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" /></>,
  send: <path d="M4 12 20 4l-4 16-4.5-6.5zm7.5 1.5L20 4" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />,
  upload: <path d="M12 16V4.5m0 0L7.8 8.7M12 4.5l4.2 4.2M4.5 20h15" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size, className = '', style, title }: { name: IconName; size?: number; className?: string; style?: CSSProperties; title?: string }) {
  return (
    <svg
      className={`icon-svg ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={size ? { width: size, height: size, ...style } : style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

/** Colours for icon tiles (hub pages, quick actions). */
export const TONES = {
  terracotta: 'linear-gradient(135deg, #c86b3f, #a54f2a)',
  green: 'linear-gradient(135deg, #3f6b53, #2b4a3a)',
  gold: 'linear-gradient(135deg, #deae4c, #c08a26)',
  plum: 'linear-gradient(135deg, #8a68b8, #6a4b95)',
  blue: 'linear-gradient(135deg, #5b82b8, #3f6394)',
  teal: 'linear-gradient(135deg, #4d978a, #33756a)',
  rose: 'linear-gradient(135deg, #c96f7c, #a4505e)',
  brown: 'linear-gradient(135deg, #8d6a4d, #6c4f37)',
  ai: 'linear-gradient(135deg, var(--ai), var(--ai-2))',
} as const;
export type Tone = keyof typeof TONES;
