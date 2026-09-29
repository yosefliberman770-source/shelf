// How you're reading a book: the ePub inside Shelf (logged automatically),
// a paper copy (you log it), or both at once.
import { updateItem } from '../db/actions';
import type { Item, ReadingFormat } from '../db/types';
import { readingFormat } from '../lib/ebooks';
import { useEbookIds } from '../state/library';
import { Segmented } from './common';

export function useReadingFormat(item: Item): { hasFile: boolean; format: ReadingFormat } {
  const hasFile = useEbookIds().has(item.id);
  return { hasFile, format: readingFormat(item, hasFile) };
}

export const FORMAT_HINT: Record<ReadingFormat, string> = {
  ebook: 'Reading here in Shelf — your reading is logged automatically.',
  print: 'Reading a paper copy — log your pages after you read.',
  both: 'Ebook reading is logged automatically; log paper pages yourself. Both count towards the same progress.',
};

export function FormatPicker({ item }: { item: Item }) {
  const { hasFile, format } = useReadingFormat(item);
  if (!hasFile) return <div className="tiny faint">📖 {FORMAT_HINT.print} Add the ePub to read it here and have it logged for you.</div>;
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="tiny faint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>How I’m reading it</div>
      <Segmented size="sm" value={format} onChange={(v) => updateItem(item.id, { format: v })} options={[{ value: 'ebook', label: '📱 Ebook' }, { value: 'print', label: '📖 Paper copy' }, { value: 'both', label: 'Both' }]} />
      <div className="tiny faint">{FORMAT_HINT[format]}</div>
    </div>
  );
}
