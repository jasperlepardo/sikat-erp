import { Select, TableStatus } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, bind } from '../../../components/form/fields';
import { FormField } from '@jasperlepardo/sikat-design-system';
import { MasterList } from '../../../components/form/MasterList';
import { TAX_ZONES, type TaxGroup, type TaxZone } from '../../../mocks/taxes';
import { taxCodes, taxGroups } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { newId, useCollectionRows } from './useCollectionRows';

const blank = (): TaxGroup => ({
  id: newId('tg'),
  code: '',
  name: '',
  direction: 'Sales',
  codes: { domestic: '', government: '', foreign: '' },
  active: true,
});

export function TaxGroupsTab() {
  const { rows, save } = useCollectionRows(taxGroups);
  const codes = useAsync(taxCodes.list, []) ?? [];
  const nameOf = (code: string) => codes.find((c) => c.code === code);

  return (
    <MasterList<TaxGroup>
      icon="account_tree"
      title="Tax groups"
      noun="tax group"
      description="Items carry a sales and a purchase tax group. On a document, the group picks the tax code for the partner's tax zone — e.g. a sale to a government agency uses OVG12."
      rows={rows}
      columns={[
        { key: 'code', header: 'Code', cell: (g) => <span className="font-semibold">{g.code}</span> },
        { key: 'name', header: 'Name', cell: (g) => g.name },
        { key: 'direction', header: 'Used on', cell: (g) => g.direction },
        ...TAX_ZONES.map((z) => ({
          key: z.value,
          header: z.label,
          cell: (g: TaxGroup) => {
            const c = nameOf(g.codes[z.value]);
            return c ? `${c.code} · ${c.rate}%` : <span className="text-muted">—</span>;
          },
        })),
        {
          key: 'active',
          header: 'Status',
          cell: (g) => <TableStatus intent={g.active ? 'success' : 'default'}>{g.active ? 'Active' : 'Inactive'}</TableStatus>,
        },
      ]}
      searchText={(g) => `${g.code} ${g.name} ${Object.values(g.codes).join(' ')}`}
      blank={blank}
      label={(g) => `${g.code} · ${g.name}`}
      validate={(g, all) => {
        const e: Record<string, string> = {};
        if (!g.code.trim()) e.code = 'Code is required.';
        else if (all.some((x) => x.id !== g.id && x.code.toLowerCase() === g.code.trim().toLowerCase()))
          e.code = `${g.code} already exists.`;
        if (!g.name.trim()) e.name = 'Name is required.';
        for (const z of TAX_ZONES) {
          const c = nameOf(g.codes[z.value]);
          if (!c) e[z.value] = 'Pick a tax code.';
          else if (c.direction !== g.direction) e[z.value] = `${c.code} is a ${c.direction.toLowerCase()} code.`;
        }
        return e;
      }}
      onSave={(g) => save({ ...g, code: g.code.trim().toUpperCase() })}
      editor={(g, update, errors) => {
        const f = bind(g, update);
        const options = codes
          .filter((c) => c.direction === g.direction && c.active)
          .map((c) => ({ value: c.code, label: `${c.code} · ${c.name} (${c.rate}%)` }));
        const setZone = (zone: TaxZone, code: string) => update({ codes: { ...g.codes, [zone]: code } });
        return (
          <>
            <Fields cols={3}>
              {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. S-VAT12' })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.pick('direction', 'Used on', ['Sales', 'Purchase'])}
              {TAX_ZONES.map((z) => (
                <FormField key={z.value} label={`Tax code – ${z.label.toLowerCase()}`} required error={errors[z.value]}>
                  {(p) => (
                    <Select
                      {...p}
                      options={options}
                      placeholder="Pick a tax code"
                      value={g.codes[z.value]}
                      onValueChange={(v) => setZone(z.value, v)}
                    />
                  )}
                </FormField>
              ))}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}
