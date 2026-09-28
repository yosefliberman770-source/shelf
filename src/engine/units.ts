// Measurement system. Items track progress in a unit appropriate to their
// type; internally amounts are stored in base units (hours → minutes) and
// converted only for display.
import type { ContentType, Item, UnitKind } from '../db/types';

export interface UnitInfo {
  kind: UnitKind;
  singular: string;
  plural: string;
  /** Base units per displayed unit (hours = 60 minutes). */
  factor: number;
  /** The base unit family used for normalization and aggregates. */
  family: UnitKind;
  /** Whether the unit is time. */
  time: boolean;
}

export const UNITS: Record<UnitKind, UnitInfo> = {
  pages: { kind: 'pages', singular: 'page', plural: 'pages', factor: 1, family: 'pages', time: false },
  chapters: { kind: 'chapters', singular: 'chapter', plural: 'chapters', factor: 1, family: 'chapters', time: false },
  sections: { kind: 'sections', singular: 'section', plural: 'sections', factor: 1, family: 'sections', time: false },
  minutes: { kind: 'minutes', singular: 'minute', plural: 'minutes', factor: 1, family: 'minutes', time: true },
  hours: { kind: 'hours', singular: 'hour', plural: 'hours', factor: 60, family: 'minutes', time: true },
  lessons: { kind: 'lessons', singular: 'lesson', plural: 'lessons', factor: 1, family: 'lessons', time: false },
  episodes: { kind: 'episodes', singular: 'episode', plural: 'episodes', factor: 1, family: 'episodes', time: false },
  documents: { kind: 'documents', singular: 'document', plural: 'documents', factor: 1, family: 'documents', time: false },
  percent: { kind: 'percent', singular: '%', plural: '%', factor: 1, family: 'percent', time: false },
  custom: { kind: 'custom', singular: 'unit', plural: 'units', factor: 1, family: 'custom', time: false },
};

export const CONTENT_TYPES: { type: ContentType; label: string; icon: string; unit: UnitKind }[] = [
  { type: 'book', label: 'Book', icon: '📕', unit: 'pages' },
  { type: 'ebook', label: 'Ebook', icon: '📱', unit: 'pages' },
  { type: 'audiobook', label: 'Audiobook', icon: '🎧', unit: 'hours' },
  { type: 'textbook', label: 'Textbook', icon: '📘', unit: 'pages' },
  { type: 'academic', label: 'Academic text', icon: '🎓', unit: 'pages' },
  { type: 'comic', label: 'Comic / Graphic novel', icon: '💬', unit: 'pages' },
  { type: 'article', label: 'Article', icon: '📰', unit: 'documents' },
  { type: 'podcast', label: 'Podcast', icon: '🎙️', unit: 'episodes' },
  { type: 'course', label: 'Course', icon: '🧑‍🏫', unit: 'lessons' },
  { type: 'research', label: 'Research material', icon: '🔬', unit: 'documents' },
  { type: 'other', label: 'Other', icon: '📄', unit: 'pages' },
  { type: 'custom', label: 'Custom type', icon: '✳️', unit: 'custom' },
];

export function contentTypeInfo(t: ContentType) {
  return CONTENT_TYPES.find((c) => c.type === t) ?? CONTENT_TYPES[0];
}

export function contentLabel(item: Pick<Item, 'contentType' | 'customType'>): string {
  if (item.contentType === 'custom' && item.customType) return item.customType;
  return contentTypeInfo(item.contentType).label;
}

export function unitInfo(item: Pick<Item, 'unit'>): UnitInfo {
  return UNITS[item.unit] ?? UNITS.pages;
}

export function unitLabel(item: Pick<Item, 'unit' | 'customUnit'>, n = 2): string {
  const u = unitInfo(item);
  if (item.unit === 'custom') return item.customUnit?.trim() || (n === 1 ? 'unit' : 'units');
  return n === 1 ? u.singular : u.plural;
}

/** Base units → display units. */
export function toDisplay(item: Pick<Item, 'unit'>, base: number): number {
  return base / unitInfo(item).factor;
}

/** Display units → base units. */
export function toBase(item: Pick<Item, 'unit'>, display: number): number {
  return display * unitInfo(item).factor;
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function fmtNum(n: number | undefined, digits = 0): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  return round(n, digits).toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** "327 pages", "4.5 hours", "12 lessons". */
export function fmtUnits(item: Pick<Item, 'unit' | 'customUnit'>, base: number | undefined, digits?: number): string {
  if (base === undefined || !Number.isFinite(base)) return '—';
  const v = toDisplay(item, base);
  const d = digits ?? (unitInfo(item).factor > 1 || (item.unit === 'percent' && v > 0 && v < 10) ? 1 : 0);
  if (item.unit === 'percent') return `${fmtNum(v, d)}%`;
  return `${fmtNum(v, d)} ${unitLabel(item, round(v, d))}`;
}

export function fmtDuration(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec) || sec <= 0) return '0m';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function fmtHours(sec: number): string {
  return `${fmtNum(sec / 3600, sec >= 36_000 ? 0 : 1)}h`;
}

/** Length of an item in pages-equivalent where possible (for pages-based analytics). */
export function pagesOf(item: Pick<Item, 'unit' | 'total' | 'pageCount'>): number | undefined {
  if (item.unit === 'pages' && item.total) return item.total;
  return item.pageCount || undefined;
}
