import { useState } from 'react';
import { Badge, Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind, type Errors } from '../../../components/form/fields';
import { AddressFields } from '../../../components/form/AddressFields';
import { useCollection } from '../../../components/form/MasterLookup';
import { RowMenu } from '../../../components/form/RowMenu';
import { addressSummary, blankPostalAddress } from '../../../mocks/address';
import type { Warehouse } from '../../../mocks/itemMasters';
import { warehouses } from '../../../services/inventoryMasters';
import { newId } from '../../../services/useCollectionRows';
import { uniqueRequired } from '../inventory/lists';
import { EditPanel } from '../../partners/detail/EditPanel';

const blankOffice = (): Warehouse => ({
  id: newId('loc'),
  code: '',
  name: '',
  type: 'office',
  address: blankPostalAddress(),
  binEnabled: false,
  active: true,
});

/**
 * The company's office addresses: office-type locations (Inventory › Warehouses & Bins),
 * offered as Bill To on purchase orders. Office edits save to the location right away; which
 * office is the registered address is part of the company and saves with the page.
 */
export function OfficesCard({
  registered,
  onRegister,
  error,
}: {
  /** Code of the company's registered office. */
  registered: string;
  onRegister: (code: string) => void;
  error?: string;
}) {
  const all = useCollection(warehouses);
  const offices = (all ?? []).filter((w) => w.type === 'office').sort((a, b) => a.code.localeCompare(b.code));
  const [editing, setEditing] = useState<{ value: Warehouse; isNew: boolean } | null>(null);

  return (
    <>
      <Section
        icon="business"
        title={`Office addresses${offices.length ? ` (${offices.length})` : ''}`}
        actions={
          <Link aria-label="Add office" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => setEditing({ value: blankOffice(), isNew: true })}>
            New
          </Link>
        }
      >
        {all === undefined ? (
          <Text variant="small" tone="muted">
            Loading…
          </Text>
        ) : offices.length ? (
          <>
            {error ? (
              <Text variant="small" tone="danger">
                {error}
              </Text>
            ) : null}
            <List.Group>
              {offices.map((o) => (
                <List.Card
                  key={o.id}
                  title={`${o.code} · ${o.name}${o.active ? '' : ' (inactive)'}`}
                  icon={<Icon size={16}>business</Icon>}
                  fields={[
                    { label: 'Address', value: addressSummary(o.address) || '—' },
                    ...(o.code === registered ? [{ label: 'Role', value: <Badge variant="outline">Registered address</Badge> }] : []),
                  ]}
                  actions={
                    <RowMenu
                      label={`Actions for ${o.code}`}
                      items={[
                        { label: 'Edit', icon: 'edit', onSelect: () => setEditing({ value: structuredClone(o), isNew: false }) },
                        ...(o.code === registered || !o.active
                          ? []
                          : [{ label: 'Make registered address', icon: 'verified', onSelect: () => onRegister(o.code) }]),
                        {
                          label: o.code === registered ? 'Deactivate (registered address)' : o.active ? 'Deactivate' : 'Activate',
                          icon: o.active ? 'block' : 'check_circle',
                          disabled: o.code === registered,
                          onSelect: () => void warehouses.save({ ...o, active: !o.active }),
                        },
                      ]}
                    />
                  }
                />
              ))}
            </List.Group>
          </>
        ) : (
          <Text variant="small" tone="muted">
            {error ?? 'No offices yet. Add one for the registered address and to offer it as Bill To on purchase orders.'}
          </Text>
        )}
      </Section>
      {editing ? (
        <OfficePanel value={editing.value} isNew={editing.isNew} all={all ?? []} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
      ) : null}
    </>
  );
}

function OfficePanel({
  value,
  isNew,
  all,
  onCancel,
  onSaved,
}: {
  value: Warehouse;
  isNew: boolean;
  all: Warehouse[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [row, setRow] = useState(value);
  const [errors, setErrors] = useState<Errors>({});
  const f = bind(row, (patch: Partial<Warehouse>) => setRow((r) => ({ ...r, ...patch })));

  const done = async () => {
    const e: Errors = {};
    uniqueRequired(e, row, all, 'code', 'Code');
    if (!row.name.trim()) e.name = 'Name is required.';
    setErrors(e);
    if (Object.keys(e).length) return;
    await warehouses.save({ ...row, code: row.code.trim().toUpperCase(), name: row.name.trim() });
    onSaved();
  };

  return (
    <EditPanel icon="business" title={isNew ? 'New office' : `${row.code} · ${row.name}`} onCancel={onCancel} onDone={done}>
      <Section icon="business" title="Office">
        <FieldStack>
          {f.text('code', 'Code', {
            required: true,
            error: errors.code,
            placeholder: 'e.g. HQ',
            disabled: !isNew,
            hint: isNew ? 'Shared with warehouses and stores, so it must be unique among locations.' : "Can't change once saved. Deactivate instead.",
          })}
          {f.text('name', 'Name', { required: true, error: errors.name, placeholder: 'e.g. Head office (Kapitolyo)' })}
          <AddressFields value={row.address} onChange={(p) => setRow((r) => ({ ...r, address: { ...r.address, ...p } }))} unwrapped />
          {f.status('active', 'Status')}
        </FieldStack>
        <Text variant="small" tone="muted">
          Purchase orders can print this address as Bill To. It's also listed under Inventory › Warehouses & Bins › Locations.
        </Text>
      </Section>
    </EditPanel>
  );
}
