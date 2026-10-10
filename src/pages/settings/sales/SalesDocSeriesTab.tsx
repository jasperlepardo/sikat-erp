import { FieldStack, ReadOnly, Section, bind } from '../../../components/form/fields';
import { MasterList, statusColumn, uniqueRequired, type ListRoute } from '../../../components/form/MasterList';
import type { DocumentSeries } from '../../../mocks/common';
import { soSeries } from '../../../services/allSeries';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';
import { DOC_TYPES } from '../../../services/allSeries';
import { ConditionBuilder } from '../components/ConditionBuilder';
const SO_CONDITION_FIELDS = DOC_TYPES.find((d) => d.key === 'sales-orders')?.conditionFields ?? [];
import { SegmentBuilder } from '../components/SegmentBuilder';

const blank = (): DocumentSeries => ({
  id: newId('sos'),
  name: '',
  prefix: 'SO-',
  firstNo: 1,
  manual: false,
  isDefault: false,
  active: true,
});

export function SalesDocSeriesTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(soSeries);

  const onSave = async (row: DocumentSeries) => {
    if (row.isDefault) {
      const all = soSeries.snapshot();
      for (const other of all) {
        if (other.id !== row.id && other.isDefault) await soSeries.save({ ...other, isDefault: false });
      }
    }
    await save(row);
  };

  return (
    <MasterList<DocumentSeries>
      {...route}
      icon="tag"
      title="Document series"
      noun="series"
      description="Each series tracks its own running number. Use 'Auto-select for' to route government orders to their own series automatically."
      rows={rows}
      onSetActive={setActive}
      defaultSort={{ key: 'name', direction: 'asc' }}
      columns={[
        { key: 'name', header: 'Name', cell: (s) => s.name },
        { key: 'prefix', header: 'Prefix', cell: (s) => s.prefix || '—' },
        { key: 'firstNo', header: 'First No.', cell: (s) => (s.manual ? '—' : s.firstNo.toLocaleString('en-PH')) },
        { key: 'conditions', header: 'Auto-select when', cell: (s) => s.conditions?.length ? s.conditions.map((c) => `${c.field}=${c.value}`).join(', ') : '—' },
        { key: 'isDefault', header: 'Default', cell: (s) => (s.isDefault ? 'Default' : '') },
        statusColumn<DocumentSeries>(),
      ]}
      searchText={(s) => `${s.name} ${s.conditions?.map((c) => c.value).join(' ') ?? ''}`}
      blank={blank}
      label={(s) => s.name}
      validate={(s, all) => {
        const e: Record<string, string> = {};
        uniqueRequired(e, s, all, 'name', 'Name');
        if (!s.manual && (s.firstNo < 1 || !Number.isInteger(s.firstNo))) e.firstNo = 'Must be a whole number of 1 or higher.';
        return e;
      }}
      onSave={onSave}
      editor={(s, update, errors, isNew) => {
        const f = bind(s, update);
        const useSegments = !!(s.segments?.length);
        return (
          <FieldStack>
            {f.text('name', 'Name', {
              required: true,
              error: errors.name,
              disabled: !isNew,
              hint: !isNew ? 'Renaming affects how existing orders display their number.' : undefined,
            })}
            {!useSegments
              ? f.text('prefix', 'Prefix', { placeholder: 'e.g. SO-', hint: 'Displayed before the running number. Or use segments below for a structured format.' })
              : null}
            {f.check('manual', 'Manual numbering')}
            {!s.manual ? f.num('firstNo', 'First No.', { error: errors.firstNo, hint: 'New numbers start here.' }) : null}
            {!s.manual ? <ReadOnly label="Next No." value="Computed from existing documents" /> : null}
            {f.check('isDefault', 'Default for new documents')}
            {f.status('active', 'Status')}
            <Section icon="filter_list" title="Auto-select when">
              <ConditionBuilder
                conditions={s.conditions ?? []}
                fields={SO_CONDITION_FIELDS}
                onChange={(conditions) => update({ conditions })}
              />
            </Section>
            <Section icon="tag" title="Number format">
              <SegmentBuilder
                segments={s.segments ?? []}
                seriesName={s.name}
                onChange={(segments) => update({ segments, prefix: segments.length ? '' : s.prefix })}
              />
            </Section>
          </FieldStack>
        );
      }}
    />
  );
}
