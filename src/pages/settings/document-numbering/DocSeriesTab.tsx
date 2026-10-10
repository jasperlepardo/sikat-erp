import { FieldStack, ReadOnly, Section, bind } from '../../../components/form/fields';
import { MasterList, statusColumn, uniqueRequired, type ListRoute } from '../../../components/form/MasterList';
import type { DocumentSeries } from '../../../mocks/common';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';
import type { ConditionField } from '../../../services/allSeries';
import { ConditionBuilder } from '../components/ConditionBuilder';
import { SegmentBuilder } from '../components/SegmentBuilder';

type Collection = {
  list: () => Promise<DocumentSeries[]>;
  save: (r: DocumentSeries) => Promise<DocumentSeries>;
  snapshot: () => readonly DocumentSeries[];
};

const blank = (): DocumentSeries => ({
  id: newId('ser'),
  name: '',
  prefix: '',
  firstNo: 1,
  manual: false,
  isDefault: false,
  active: true,
});

export function DocSeriesTab({ collection, conditionFields, ...route }: { collection: Collection; conditionFields?: ConditionField[] } & ListRoute) {
  const { rows, setActive, reload } = useCollectionRows(collection);

  const onSave = async (row: DocumentSeries) => {
    if (row.isDefault) {
      const all = collection.snapshot();
      for (const other of all) {
        if (other.id !== row.id && other.isDefault) {
          await collection.save({ ...other, isDefault: false });
        }
      }
    }
    await collection.save(row);
    reload();
  };

  return (
    <MasterList<DocumentSeries>
      {...route}
      sidePanelEdit
      icon="tag"
      title="Document series"
      noun="series"
      description="Each series tracks its own running number. Mark one as default for new documents."
      rows={rows}
      onSetActive={setActive}
      defaultSort={{ key: 'name', direction: 'asc' }}
      columns={[
        { key: 'name', header: 'Name', cell: (s) => s.name },
        { key: 'prefix', header: 'Prefix', cell: (s) => s.prefix || <span className="text-text-placeholder">—</span> },
        {
          key: 'firstNo',
          header: 'First No.',
          cell: (s) => (s.manual ? '—' : s.firstNo.toLocaleString('en-PH')),
        },
        {
          key: 'manual',
          header: 'Numbering',
          cell: (s) => (s.manual ? 'Manual' : 'Automatic'),
        },
        {
          key: 'isDefault',
          header: 'Default',
          cell: (s) => (s.isDefault ? 'Default' : ''),
        },
        statusColumn<DocumentSeries>(),
      ]}
      searchText={(s) => s.name}
      blank={blank}
      label={(s) => s.name}
      validate={(s, all) => {
        const e: Record<string, string> = {};
        uniqueRequired(e, s, all, 'name', 'Name');
        if (!s.manual && (s.firstNo < 1 || !Number.isInteger(s.firstNo))) {
          e.firstNo = 'Must be a whole number of 1 or higher.';
        }
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
              hint: !isNew ? 'Renaming affects how existing documents display their number.' : undefined,
            })}
            {!useSegments
              ? f.text('prefix', 'Prefix', {
                  placeholder: 'e.g. PO- or 2025-',
                  hint: 'Displayed before the running number. Or use segments below for a structured format.',
                })
              : null}
            {f.check('manual', 'Manual numbering')}
            {!s.manual ? f.num('firstNo', 'First No.', {
              error: errors.firstNo,
              hint: 'New numbers start here; existing documents advance this automatically.',
            }) : null}
            {!s.manual ? <ReadOnly label="Next No." value="Computed from existing documents" /> : null}
            {f.check('isDefault', 'Default for new documents')}
            {f.status('active', 'Status')}
            {conditionFields?.length ? (
              <Section icon="filter_list" title="Auto-select when">
                <ConditionBuilder conditions={s.conditions ?? []} fields={conditionFields} onChange={(conditions) => update({ conditions })} />
              </Section>
            ) : null}
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
