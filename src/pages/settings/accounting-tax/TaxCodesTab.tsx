import { TableStatus } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, bind } from '../../../components/form/fields';
import { MasterList } from '../../../components/form/MasterList';
import { BIR_RETURNS, TAX_CATEGORIES, TAX_GL_ACCOUNTS, type TaxCode } from '../../../mocks/taxes';
import { taxCodes } from '../../../services/masterData';
import { newId, useCollectionRows } from './useCollectionRows';

const blank = (): TaxCode => ({
  id: newId('tc'),
  code: '',
  name: '',
  direction: 'Sales',
  category: 'Standard',
  rate: 12,
  glAccount: '2310 Output VAT Payable',
  birReturn: '2550Q',
  legalBasis: '',
  active: true,
  notes: '',
});

export function TaxCodesTab() {
  const { rows, save } = useCollectionRows(taxCodes);
  return (
    <MasterList<TaxCode>
      icon="percent"
      title="Tax codes"
      noun="tax code"
      description="VAT and percentage tax applied on document rows. Items and partners reach them through tax groups."
      rows={rows}
      columns={[
        { key: 'code', header: 'Code', cell: (t) => <span className="font-semibold">{t.code}</span> },
        { key: 'name', header: 'Name', cell: (t) => t.name },
        { key: 'direction', header: 'Used on', cell: (t) => (t.direction === 'Sales' ? 'Sales (output)' : 'Purchases (input)') },
        { key: 'rate', header: 'Rate', cell: (t) => `${t.rate}%` },
        { key: 'birReturn', header: 'BIR return', cell: (t) => t.birReturn },
        {
          key: 'active',
          header: 'Status',
          cell: (t) => <TableStatus intent={t.active ? 'success' : 'default'}>{t.active ? 'Active' : 'Inactive'}</TableStatus>,
        },
      ]}
      searchText={(t) => `${t.code} ${t.name} ${t.category} ${t.legalBasis}`}
      blank={blank}
      label={(t) => `${t.code} · ${t.name}`}
      validate={(t, all) => {
        const e: Record<string, string> = {};
        if (!t.code.trim()) e.code = 'Code is required.';
        else if (all.some((x) => x.id !== t.id && x.code.toLowerCase() === t.code.trim().toLowerCase()))
          e.code = `${t.code} already exists.`;
        if (!t.name.trim()) e.name = 'Name is required.';
        if (t.rate < 0 || t.rate > 100) e.rate = 'Rate must be between 0 and 100.';
        return e;
      }}
      onSave={(t) => save({ ...t, code: t.code.trim().toUpperCase() })}
      editor={(t, update, errors) => {
        const f = bind(t, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. OV12' })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.num('rate', 'Rate', { required: true, error: errors.rate, suffix: '%' })}
              {f.pick('direction', 'Used on', ['Sales', 'Purchase'])}
              {f.pick('category', 'Category', TAX_CATEGORIES)}
              {f.pick('birReturn', 'BIR return', BIR_RETURNS)}
              {f.pick('glAccount', 'G/L account', TAX_GL_ACCOUNTS)}
              {f.text('legalBasis', 'Legal basis', { placeholder: 'e.g. NIRC Sec. 106' })}
              {f.area('notes', 'Notes', { rows: 2, className: 'md:col-span-3' })}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}
