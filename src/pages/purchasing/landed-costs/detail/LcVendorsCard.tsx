import {
  Button,
  Combobox,
  FormField,
  Icon,
  Table,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import type { LandedCostVendor } from '../../../../mocks/landedCosts';
import type { LcSectionProps } from './types';

export function LcVendorsCard({ draft, update, m, readOnly }: LcSectionProps) {
  const addVendor = () => {
    const entry: LandedCostVendor = {
      id: `lcv-${crypto.randomUUID().slice(0, 8)}`,
      vendorId: '',
      vendorCode: '',
      vendorName: '',
    };
    update({ vendors: [...draft.vendors, entry] });
  };

  const updateVendor = (id: string, vendorId: string) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    update({
      vendors: draft.vendors.map((e) =>
        e.id === id ? { ...e, vendorId: vendorId, vendorCode: v?.code ?? '', vendorName: v?.name ?? '' } : e,
      ),
    });
  };

  const removeVendor = (id: string) => {
    update({ vendors: draft.vendors.filter((e) => e.id !== id) });
  };

  const columns: TableColumn<LandedCostVendor>[] = [
    {
      key: 'vendorId',
      header: 'Vendor',
      cell: (e) =>
        readOnly ? (
          <span className="text-sm">{e.vendorName || '—'}</span>
        ) : (
          <FormField label="Vendor">
            {(p) => (
              <Combobox
                {...p}
                placeholder="Search vendors"
                options={m.vendors
                  .filter((v) => v.status !== 'Inactive' || v.id === e.vendorId)
                  .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, text: `${v.code} ${v.name}` }))}
                value={e.vendorId || null}
                onValueChange={(id) => updateVendor(e.id, id ?? '')}
              />
            )}
          </FormField>
        ),
    },
    { key: 'vendorCode', header: 'Code', cell: (e) => e.vendorCode || '—' },
    ...(!readOnly
      ? [{
          key: 'remove' as const,
          header: '',
          cell: (e: LandedCostVendor) => (
            <Button type="button" intent="danger" variant="ghost" size="small" onClick={() => removeVendor(e.id)}>
              <Icon size={16}>delete</Icon>
            </Button>
          ),
        }]
      : []),
  ];

  return (
    <Section
      icon="group"
      title="Additional Vendors"
      actions={
        !readOnly ? (
          <Button
            type="button"
            intent="primary"
            variant="outline"
            size="small"
            shape="pill"
            leadingIcon={<Icon size={16}>add</Icon>}
            onClick={addVendor}
          >
            Add vendor
          </Button>
        ) : undefined
      }
    >
      {draft.vendors.length === 0 ? (
        <Text tone="muted" className="text-sm py-1">
          {readOnly ? 'No additional vendors.' : 'Add other vendors involved in this shipment.'}
        </Text>
      ) : (
        <Table
          caption="Additional vendors"
          columns={columns}
          rows={draft.vendors}
          getRowId={(e) => e.id}
          layout="fill"
        />
      )}
    </Section>
  );
}
