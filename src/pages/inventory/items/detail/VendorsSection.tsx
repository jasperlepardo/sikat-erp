import { useState } from 'react';
import { Checkbox, Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind, type Errors } from '../../../../components/form/fields';
import { RowMenu } from '../../../../components/form/RowMenu';
import { newVendorRow, type ItemVendor } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import { EditPanel } from '../../../partners/detail/EditPanel';
import type { Draft } from './types';

/**
 * Every vendor the item can be bought from, as cards in the side column (like manufacturers).
 * The starred one is the default vendor, which pre-fills new purchase orders. Adding and
 * editing happen in `VendorPanel`.
 */
export function VendorsCards({
  draft,
  update,
  vendors,
  onOpen,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  vendors: Partner[];
  onOpen: (row: ItemVendor, isNew: boolean) => void;
}) {
  const rows = draft.vendors;
  const partner = (id: string) => vendors.find((v) => v.id === id);
  // Removing the default vendor leaves the item without one.
  const remove = (r: ItemVendor) =>
    update({
      vendors: rows.filter((x) => x.id !== r.id),
      ...(r.vendorId === draft.defaultVendorId ? { defaultVendorId: '' } : {}),
    });

  return (
    <Section
      icon="local_shipping"
      title={`Vendors${rows.length ? ` (${rows.length})` : ''}`}
      actions={
        <Link aria-label="Add vendor" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => onOpen(newVendorRow(), true)}>
          New
        </Link>
      }
    >
      {rows.length ? (
        <List.Group>
          {rows.map((r) => {
            const v = partner(r.vendorId);
            const main = !!r.vendorId && r.vendorId === draft.defaultVendorId;
            return (
              <List.Card
                key={r.id}
                title={v ? `${v.code} · ${v.name}` : r.vendorId || 'No vendor picked'}
                icon={<Icon size={16}>local_shipping</Icon>}
                badge={main ? <Icon size={12}>star</Icon> : undefined}
                fields={[
                  { label: 'Main', value: main ? 'Default vendor' : '' },
                  { label: 'Item no.', value: r.vendorItemNo ? `Their item no. ${r.vendorItemNo}` : '' },
                  { label: 'Currency', value: v?.currency ?? '' },
                ].filter((x) => !!x.value)}
                actions={
                  <RowMenu
                    label={`Actions for ${v?.code || 'vendor'}`}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => onOpen(r, false) },
                      { label: 'Set as default', icon: 'star', disabled: main || !r.vendorId, onSelect: () => update({ defaultVendorId: r.vendorId }) },
                      { label: 'Remove', icon: 'delete', onSelect: () => remove(r) },
                    ]}
                  />
                }
              />
            );
          })}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">
          No vendors linked.
        </Text>
      )}
    </Section>
  );
}

/** Add a vendor to the item, or edit its part number and whether it's the default one. */
export function VendorPanel({
  value,
  isNew,
  draft,
  vendors,
  onDone,
  onCancel,
}: {
  value: ItemVendor;
  isNew: boolean;
  draft: Draft;
  vendors: Partner[];
  onDone: (row: ItemVendor, main: boolean) => void;
  onCancel: () => void;
}) {
  const [row, setRow] = useState(value);
  // The first vendor becomes the default one unless unticked.
  const [main, setMain] = useState(isNew ? !draft.defaultVendorId : !!value.vendorId && value.vendorId === draft.defaultVendorId);
  const [errors, setErrors] = useState<Errors>({});
  const f = bind(row, (p: Partial<ItemVendor>) => setRow((r) => ({ ...r, ...p })));
  const code = (id: string) => vendors.find((v) => v.id === id)?.code ?? id;

  const done = () => {
    const e: Errors = {};
    if (!row.vendorId) e.vendorId = 'Pick a vendor.';
    else if (draft.vendors.some((v) => v.id !== row.id && v.vendorId === row.vendorId)) e.vendorId = `${code(row.vendorId)} is already linked to this item.`;
    setErrors(e);
    if (!Object.keys(e).length) onDone(row, main);
  };

  return (
    <EditPanel icon="local_shipping" title={isNew ? 'Add vendor' : code(row.vendorId) || 'Vendor'} onCancel={onCancel} onDone={done}>
      <Section icon="local_shipping" title="Vendor">
        <Fields>
          {f.lookup(
            'vendorId',
            'Vendor',
            vendors.map((v) => ({ value: v.id, label: `${v.code} · ${v.name}` })),
            { required: true, error: errors.vendorId },
          )}
          {f.text('vendorItemNo', 'Vendor’s item no.', {
            hint: 'The vendor’s own part number, for matching their invoices.',
          })}
        </Fields>
        <Checkbox checked={main} onChange={(e) => setMain(e.currentTarget.checked)}>
          Default vendor (pre-fills new purchase orders)
        </Checkbox>
        {main && draft.defaultVendorId && draft.defaultVendorId !== value.vendorId ? (
          <Text variant="small" tone="muted">
            Takes over from {code(draft.defaultVendorId)}.
          </Text>
        ) : null}
      </Section>
    </EditPanel>
  );
}
