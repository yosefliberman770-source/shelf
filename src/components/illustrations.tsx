// Small warm illustrations for empty states and celebrations. Colours come
// from the theme, so they work in light and dark mode.

export type IllusName = 'shelf' | 'reading' | 'notes' | 'map' | 'magic' | 'finished' | 'search' | 'chart';

const star = (x: number, y: number, r: number) => `M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28} Z`;

export function Illustration({ name, className = 'illus', label }: { name: IllusName; className?: string; label?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 150" role={label ? 'img' : undefined} aria-hidden={label ? undefined : true} aria-label={label}>
      <ellipse cx="100" cy="132" rx="84" ry="9" fill="var(--surface-3)" opacity="0.75" />
      {ART[name]}
    </svg>
  );
}

const lines = (x0: number, x1: number, ys: number[]) => ys.map((y, i) => `M${x0} ${y} H${x1 - (i % 3) * 5}`).join(' ');

const ART: Record<IllusName, React.ReactNode> = {
  shelf: (
    <>
      <rect x="64" y="50" width="17" height="70" rx="2.5" fill="var(--accent)" />
      <rect x="64" y="60" width="17" height="4" fill="#fff" opacity="0.35" />
      <rect x="64" y="104" width="17" height="4" fill="#fff" opacity="0.35" />
      <rect x="83" y="42" width="15" height="78" rx="2.5" fill="var(--primary)" />
      <rect x="83" y="52" width="15" height="3" fill="#fff" opacity="0.3" />
      <rect x="100" y="58" width="19" height="62" rx="2.5" fill="var(--gold)" />
      <rect x="104" y="70" width="11" height="12" rx="1.5" fill="#fff" opacity="0.4" />
      <g transform="rotate(13 136 120)">
        <rect x="122" y="52" width="15" height="68" rx="2.5" fill="var(--ai)" />
        <rect x="122" y="62" width="15" height="3" fill="#fff" opacity="0.3" />
      </g>
      <rect x="22" y="118" width="156" height="9" rx="3" fill="var(--wood)" />
      <rect x="22" y="125" width="156" height="3" rx="1.5" fill="var(--wood-2)" />
      <path d="M152 118 L148 99 H170 L166 118 Z" fill="var(--accent-ink)" />
      <path d="M159 99 C152 89 148 80 150 70 C158 76 161 87 159 99Z" fill="var(--good)" />
      <path d="M160 99 C164 87 170 81 178 79 C176 89 170 96 160 99Z" fill="var(--good)" opacity="0.85" />
      <path d="M159 99 C158 85 160 73 166 65 C170 75 166 89 159 99Z" fill="var(--good)" opacity="0.7" />
      <ellipse cx="42" cy="109" rx="19" ry="9.5" fill="var(--text-2)" />
      <circle cx="28" cy="105" r="8" fill="var(--text-2)" />
      <path d="M22 100 L23 91.5 L28.5 98 Z M29.5 98 L35 91.5 L35.5 100 Z" fill="var(--text-2)" />
      <path d="M60 111 C67 115 63 121 53 119" stroke="var(--text-2)" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M23.8 105 q1.9 1.8 3.8 0 M29.6 105 q1.9 1.8 3.8 0" stroke="var(--surface)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <text x="10" y="88" fontFamily="var(--hand)" fontSize="15" fill="var(--text-3)">z z</text>
    </>
  ),
  reading: (
    <>
      <path d={star(62, 34, 6)} fill="var(--gold)" />
      <path d={star(138, 26, 4)} fill="var(--gold)" opacity="0.8" />
      <path d="M36 118 C58 111 82 111 100 119 C118 111 142 111 164 118 V123 C142 116 118 116 100 124 C82 116 58 116 36 123 Z" fill="var(--accent)" />
      <path d="M100 115 C84 106 60 106 42 112 V60 C60 54 84 54 100 63 Z" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2" />
      <path d="M100 115 C116 106 140 106 158 112 V60 C140 54 116 54 100 63 Z" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2" />
      <path d={lines(52, 90, [72, 80, 88, 96])} stroke="var(--border-strong)" strokeWidth="2.2" strokeLinecap="round" />
      <path d={lines(110, 148, [72, 80, 88, 96])} stroke="var(--border-strong)" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="164" y="96" width="22" height="24" rx="4" fill="var(--primary)" />
      <path d="M186 102 c7 0 7 12 0 12" stroke="var(--primary)" strokeWidth="3.2" fill="none" />
      <path d="M170 90 c-3 -5 3 -8 0 -13 M178 90 c-3 -5 3 -8 0 -13" stroke="var(--text-3)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  notes: (
    <>
      <rect x="48" y="30" width="86" height="96" rx="9" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2" />
      {[42, 54, 66, 78, 90, 102, 114].map((y) => <circle key={y} cx="48" cy={y} r="3.2" fill="var(--wood-2)" />)}
      <path d={lines(62, 122, [52, 64, 76, 88, 100])} stroke="var(--border-strong)" strokeWidth="2.2" strokeLinecap="round" />
      <g transform="rotate(34 152 92)">
        <rect x="147" y="48" width="11" height="58" rx="2" fill="var(--gold)" />
        <path d="M147 106 L152.5 119 L158 106 Z" fill="var(--wood)" />
        <path d="M151 115 L152.5 119 L154 115 Z" fill="var(--text-2)" />
        <rect x="147" y="44" width="11" height="7" rx="2" fill="var(--accent)" />
      </g>
      <path d="M120 16 h48 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 h-28 l-10 9 v-9 h-10 a8 8 0 0 1 -8 -8 v-18 a8 8 0 0 1 8 -8z" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
      <text x="131" y="44" fontFamily="var(--serif)" fontSize="28" fontWeight="700" fill="var(--accent)">“ ”</text>
    </>
  ),
  map: (
    <>
      <path d="M38 38 L80 28 L120 38 L162 28 V112 L120 122 L80 112 L38 122 Z" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M80 28 L120 38 V122 L80 112 Z" fill="var(--accent-soft)" />
      <path d="M80 28 V112 M120 38 V122" stroke="var(--border-strong)" strokeWidth="2" />
      <path d="M52 102 C70 80 90 98 100 78 S128 62 140 52" stroke="var(--accent)" strokeWidth="2.6" strokeDasharray="3 7" fill="none" strokeLinecap="round" />
      <circle cx="52" cy="102" r="5" fill="var(--primary)" />
      <path d="M135 45 l11 11 m0 -11 l-11 11" stroke="var(--bad)" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="62" cy="58" r="7" fill="var(--good)" opacity="0.5" />
      <circle cx="146" cy="96" r="9" fill="var(--good)" opacity="0.4" />
    </>
  ),
  magic: (
    <>
      <circle cx="100" cy="72" r="50" fill="var(--ai-soft)" />
      <path d="M52 116 C70 110 88 110 100 117 C112 110 130 110 148 116 V120 C130 114 112 114 100 121 C88 114 70 114 52 120 Z" fill="var(--ai)" />
      <path d="M100 113 C88 106 70 106 56 110 V72 C70 67 88 67 100 74 Z" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2" />
      <path d="M100 113 C112 106 130 106 144 110 V72 C130 67 112 67 100 74 Z" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2" />
      <path d={star(100, 42, 11)} fill="var(--ai)" />
      <path d={star(72, 52, 6)} fill="var(--gold)" />
      <path d={star(130, 50, 7)} fill="var(--accent)" />
      <path d={star(118, 26, 4)} fill="var(--gold)" opacity="0.8" />
    </>
  ),
  finished: (
    <>
      <path d="M82 92 L72 128 L87 120 L95 133 L101 98 Z" fill="var(--accent)" />
      <path d="M118 92 L128 128 L113 120 L105 133 L99 98 Z" fill="var(--accent-ink)" />
      <circle cx="100" cy="64" r="36" fill="var(--gold)" />
      <circle cx="100" cy="64" r="27" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="3 4" opacity="0.8" />
      <path d={star(100, 64, 15)} fill="#fff" />
      <path d={star(48, 40, 6)} fill="var(--gold)" />
      <path d={star(154, 34, 5)} fill="var(--ai)" />
      <path d={star(160, 86, 4)} fill="var(--accent)" />
    </>
  ),
  search: (
    <>
      <rect x="44" y="60" width="16" height="62" rx="2.5" fill="var(--primary)" />
      <rect x="62" y="52" width="14" height="70" rx="2.5" fill="var(--accent)" />
      <rect x="78" y="66" width="18" height="56" rx="2.5" fill="var(--gold)" />
      <rect x="36" y="120" width="72" height="7" rx="3" fill="var(--wood)" />
      <circle cx="132" cy="66" r="26" fill="var(--surface)" stroke="var(--text-2)" strokeWidth="6" />
      <path d="M150 86 L170 108" stroke="var(--text-2)" strokeWidth="9" strokeLinecap="round" />
      <path d="M120 56 a14 14 0 0 1 12 -6" stroke="var(--border-strong)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  chart: (
    <>
      <rect x="44" y="84" width="20" height="40" rx="4" fill="var(--seq-2)" />
      <rect x="70" y="60" width="20" height="64" rx="4" fill="var(--accent)" />
      <rect x="96" y="72" width="20" height="52" rx="4" fill="var(--gold)" />
      <rect x="122" y="42" width="20" height="82" rx="4" fill="var(--primary)" />
      <path d="M40 124 H150" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M50 70 L80 48 L104 58 L134 30" stroke="var(--ai)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 5" />
      <path d="M160 124 L157 110 H173 L170 124 Z" fill="var(--accent-ink)" />
      <path d="M165 110 C160 102 158 96 160 88 C166 93 168 101 165 110Z" fill="var(--good)" />
      <path d="M166 110 C169 101 173 97 179 96 C178 103 173 108 166 110Z" fill="var(--good)" opacity="0.8" />
    </>
  ),
};
