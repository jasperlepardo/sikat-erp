import { Button, Icon, IconButton, Select, Text, TextField } from '@jasperlepardo/sikat-design-system';
import type { SeriesSegment, SegmentType } from '../../../mocks/common';
import { formatDocNum } from '../../../services/allSeries';
import { todayISO } from '../../../services/dates';

const SEGMENT_OPTIONS: { value: SegmentType; label: string }[] = [
  { value: 'literal', label: 'Text' },
  { value: 'year', label: 'Year (2026)' },
  { value: 'year_short', label: 'Year (26)' },
  { value: 'month', label: 'Month (10)' },
  { value: 'month_name', label: 'Month (OCT)' },
  { value: 'sequence', label: 'Sequence' },
];

const defaultSegment = (type: SegmentType): SeriesSegment => {
  if (type === 'literal') return { type, value: '' };
  if (type === 'sequence') return { type, padding: 4 };
  return { type };
};

interface Props {
  segments: SeriesSegment[];
  onChange: (segments: SeriesSegment[]) => void;
  seriesName: string;
}

export function SegmentBuilder({ segments, onChange, seriesName }: Props) {
  const today = todayISO();

  const update = (i: number, patch: Partial<SeriesSegment>) =>
    onChange(segments.map((s, n) => (n === i ? { ...s, ...patch } : s)));

  const remove = (i: number) => onChange(segments.filter((_, n) => n !== i));

  const add = () => onChange([...segments, { type: 'literal', value: '' }]);

  const move = (i: number, dir: -1 | 1) => {
    const next = [...segments];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };

  const preview = segments.length
    ? formatDocNum({ name: seriesName, prefix: '', segments }, 1, today)
    : null;

  return (
    <div className="flex flex-col gap-2">
      {segments.map((seg, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="flex shrink-0 flex-col">
            <IconButton type="button" label="Move up" size="small" shape="pill" intent="white" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>
              <Icon size={14}>arrow_upward</Icon>
            </IconButton>
            <IconButton type="button" label="Move down" size="small" shape="pill" intent="white" variant="ghost" disabled={i === segments.length - 1} onClick={() => move(i, 1)}>
              <Icon size={14}>arrow_downward</Icon>
            </IconButton>
          </div>
          {i > 0 && <Text variant="small" tone="muted" className="shrink-0 select-none">—</Text>}
          <Select
            aria-label="Segment type"
            className="w-36 shrink-0"
            options={SEGMENT_OPTIONS}
            value={seg.type}
            onValueChange={(t) => update(i, defaultSegment(t as SegmentType))}
          />
          {seg.type === 'literal' && (
            <TextField
              aria-label="Text value"
              className="w-24"
              placeholder="e.g. SO"
              value={seg.value ?? ''}
              onChange={(e) => update(i, { value: e.currentTarget.value })}
            />
          )}
          {seg.type === 'sequence' && (
            <TextField
              aria-label="Padding"
              type="number"
              min={1}
              max={10}
              className="w-20"
              prefix="pad"
              value={String(seg.padding ?? 4)}
              onChange={(e) => update(i, { padding: Math.max(1, Number(e.currentTarget.value)) })}
            />
          )}
          <IconButton type="button" label="Remove" size="small" shape="pill" intent="white" variant="ghost" onClick={() => remove(i)}>
            <Icon size={14}>close</Icon>
          </IconButton>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={14}>add</Icon>} onClick={add}>
          Add segment
        </Button>
        {preview && (
          <Text variant="small" tone="muted">
            Preview: <strong>{preview}</strong>
          </Text>
        )}
      </div>
    </div>
  );
}
