import { TableStatus } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import type { ExciseCategory } from '../../../mocks/taxes';
import { exciseCategories } from '../../../services/masterData';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

const blank = (): ExciseCategory => ({
  id: newId('ex'),
  code: '',
  name: '',
  basis: 'Specific',
  rate: '',
  effective: String(new Date().getFullYear()),
  legalBasis: '',
  active: true,
  notes: '',
});

export function ExciseTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(exciseCategories);
  return (
    <MasterList<ExciseCategory>
      {...route}
      icon="local_bar"
      title="Excise tax"
      noun="excise category"
      description="Excise on top of VAT for sin and other covered products. Items flagged as excise-taxable pick one of these. Sin-tax rates step up every January — update them yearly."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'code', header: 'Code', cell: (x) => <span className="font-semibold">{x.code}</span> },
        { key: 'name', header: 'Products', cell: (x) => x.name },
        { key: 'basis', header: 'Basis', cell: (x) => x.basis },
        {
          key: 'rate',
          header: 'Rate',
          cell: (x) => x.rate || <span className="text-warning">Enter current rate</span>,
        },
        { key: 'effective', header: 'Since', cell: (x) => x.effective },
        {
          key: 'active',
          header: 'Status',
          cell: (x) => (
            <TableStatus intent={x.active ? 'success' : 'default'}>{x.active ? 'Active' : 'Inactive'}</TableStatus>
          ),
        },
      ]}
      searchText={(x) => `${x.code} ${x.name} ${x.legalBasis}`}
      blank={blank}
      label={(x) => `${x.code} · ${x.name}`}
      validate={(x, all) => {
        const e: Record<string, string> = {};
        if (!x.code.trim()) e.code = 'Code is required.';
        else if (all.some((o) => o.id !== x.id && o.code.toLowerCase() === x.code.trim().toLowerCase()))
          e.code = `${x.code} already exists.`;
        if (!x.name.trim()) e.name = 'Name is required.';
        return e;
      }}
      onSave={(x) => save({ ...x, code: x.code.trim().toUpperCase() })}
      editor={(x, update, errors) => {
        const f = bind(x, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. EX-SSB' })}
              {f.text('name', 'Products', { required: true, error: errors.name, className: 'md:col-span-2' })}
              {f.pick('basis', 'Basis', ['Specific', 'Ad valorem', 'Specific + ad valorem'])}
              {f.text('rate', 'Rate', { placeholder: 'e.g. ₱6 per liter', className: 'md:col-span-2' })}
              {f.text('effective', 'Rate effective since')}
              {f.text('legalBasis', 'Legal basis', { className: 'md:col-span-2' })}
              {f.area('notes', 'Notes', { rows: 2, className: 'md:col-span-3' })}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}
