import { FieldStack, Section, bind } from '../../../components/form/fields';
import { MasterList, statusColumn, uniqueRequired, type ListRoute } from '../../../components/form/MasterList';
import type { DocumentSeries } from '../../../mocks/common';
import { poSeries } from '../../../services/allSeries';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';
import { DOC_TYPES } from '../../../services/allSeries';
import { ConditionBuilder } from '../components/ConditionBuilder';
const PO_CONDITION_FIELDS = DOC_TYPES.find((d) => d.key === 'purchase-orders')?.conditionFields ?? [];
import { SegmentBuilder } from '../components/SegmentBuilder';

const blank = (): DocumentSeries => ({
  id: newId('ser'),
  name: '',
  prefix: '',
  firstNo: 1,
  manual: false,
  isDefault: false,
  active: true,
});

export function DocumentSeriesTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(poSeries);

  return (
    <MasterList<DocumentSeries>
      {...route}
      icon="tag"
      title="Document series"
      noun="series"
      description="Each series tracks its own running number. Manual series let you type the number on each document."
      rows={rows}
      onSetActive={setActive}
      defaultSort={{ key: 'name', direction: 'asc' }}
      columns={[
        { key: 'name', header: 'Name', cell: (s) => s.name },
        {
          key: 'firstNo',
          header: 'First number',
          cell: (s) => (s.manual ? '—' : s.firstNo.toLocaleString('en-PH')),
        },
        {
          key: 'manual',
          header: 'Numbering',
          cell: (s) => (s.manual ? 'Manual' : 'Automatic'),
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
      onSave={async (s) => save(s)}
      editor={(s, update, errors, isNew) => {
        const f = bind(s, update);
        const useSegments = !!(s.segments?.length);
        return (
          <FieldStack>
            {f.text('name', 'Name', {
              required: true,
              error: errors.name,
              disabled: !isNew,
              hint: !isNew ? 'Renaming changes how existing POs display their number.' : undefined,
            })}
            {!useSegments ? f.text('prefix', 'Prefix', { placeholder: 'e.g. PO-', hint: 'Displayed before the running number.' }) : null}
            {f.check('manual', 'Manual numbering')}
            {!s.manual ? f.num('firstNo', 'First number', { error: errors.firstNo, hint: 'New numbers start here; existing PO numbers are not affected.' }) : null}
            {f.check('isDefault', 'Default for new documents')}
            {f.status('active', 'Status')}
            <Section icon="filter_list" title="Auto-select when">
              <ConditionBuilder conditions={s.conditions ?? []} fields={PO_CONDITION_FIELDS} onChange={(conditions) => update({ conditions })} />
            </Section>
            <Section icon="tag" title="Number format">
              <SegmentBuilder segments={s.segments ?? []} seriesName={s.name} onChange={(segments) => update({ segments, prefix: segments.length ? '' : s.prefix })} />
            </Section>
          </FieldStack>
        );
      }}
    />
  );
}
