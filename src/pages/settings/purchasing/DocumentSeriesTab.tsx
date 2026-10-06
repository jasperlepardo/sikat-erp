import { FieldStack, bind } from '../../../components/form/fields';
import { MasterList, statusColumn, uniqueRequired, type ListRoute } from '../../../components/form/MasterList';
import type { DocumentSeries } from '../../../mocks/common';
import { poSeries } from '../../../services/allSeries';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

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
        return (
          <FieldStack>
            {f.text('name', 'Name', {
              required: true,
              error: errors.name,
              disabled: !isNew,
              hint: !isNew ? 'Renaming changes how existing POs display their number.' : undefined,
            })}
            {!s.manual
              ? f.num('firstNo', 'First number', {
                  error: errors.firstNo,
                  hint: 'New numbers start here; existing PO numbers are not affected.',
                })
              : null}
            {f.check('manual', 'Manual numbering')}
            {f.check('active', 'Active')}
          </FieldStack>
        );
      }}
    />
  );
}
