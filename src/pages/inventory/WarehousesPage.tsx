import { useState } from 'react';
import { useParams } from 'react-router';
import { Button, Icon, Panel, PanelHeader, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../components/form/DataTable';
import { Fields, Flags, bind } from '../../components/form/fields';
import { MasterList } from '../../components/form/MasterList';
import type { Warehouse } from '../../mocks/itemMasters';
import { warehouses } from '../../services/inventoryMasters';
import { newId, useCollectionRows } from '../../services/useCollectionRows';
import { statusColumn, uniqueRequired } from '../settings/inventory/lists';

/** Inventory › Warehouses & Bins: warehouses (master data) and their bin locations. */
export function WarehousesPage() {
  const { recordId } = useParams();
  const { rows, save, setActive } = useCollectionRows(warehouses);
  const list = (
    <MasterList<Warehouse>
      basePath="/inventory/warehouses-and-bins"
      recordId={recordId}
      icon="warehouse"
      title="Warehouses"
      noun="warehouse"
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'code', header: 'Code', cell: (w) => w.code },
        { key: 'name', header: 'Name', cell: (w) => w.name },
        { key: 'city', header: 'City', cell: (w) => w.city || '—' },
        {
          key: 'bins',
          header: 'Bins',
          cell: (w) => (w.binEnabled ? `${w.bins.length} bin${w.bins.length === 1 ? '' : 's'}` : 'No bin management'),
        },
        statusColumn<Warehouse>(),
      ]}
      sortValue={(w, key) =>
        key === 'bins'
          ? w.binEnabled
            ? w.bins.length
            : -1
          : key === 'active'
            ? Number(w.active)
            : String(w[key as keyof Warehouse] ?? '').toLowerCase()
      }
      searchText={(w) => `${w.code} ${w.name} ${w.city} ${w.bins.join(' ')}`}
      blank={() => ({ id: newId('wh'), code: '', name: '', city: '', binEnabled: false, bins: [], active: true })}
      label={(w) => `${w.code} · ${w.name}`}
      validate={(w, all) => {
        const e: Record<string, string> = {};
        uniqueRequired(e, w, all, 'code', 'Code');
        if (!w.name.trim()) e.name = 'Name is required.';
        if (w.binEnabled && !w.bins.length) e.bins = 'Bin-enabled warehouses need at least one bin.';
        else if (w.bins.some((b) => !b.trim())) e.bins = 'Bins need a code.';
        else if (new Set(w.bins.map((b) => b.trim().toUpperCase())).size !== w.bins.length)
          e.bins = 'Bin codes must be unique.';
        return e;
      }}
      onSave={(w) => save({ ...w, code: w.code.trim().toUpperCase(), bins: w.bins.map((b) => b.trim().toUpperCase()) })}
      editor={(w, update, errors, isNew) => {
        const f = bind(w, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('code', 'Code', {
                required: true,
                error: errors.code,
                placeholder: 'e.g. WH-CDO',
                readOnly: !isNew,
                hint: isNew ? undefined : 'Can’t change once saved — items refer to it. Deactivate instead.',
              })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.text('city', 'City')}
            </Fields>
            <Flags>
              {f.check('binEnabled', 'Bin management (items need a default bin here)')}
              {f.check('active', 'Active')}
            </Flags>
            {w.binEnabled ? (
              <BinsEditor bins={w.bins} error={errors.bins} onChange={(bins) => update({ bins })} />
            ) : null}
          </>
        );
      }}
    />
  );

  // A record opens on its own page; the list sits in the page panel.
  if (recordId) return list;
  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="warehouse"
        title="Warehouses & Bins"
        subcopy="Where stock is kept. Bin-enabled warehouses need a default bin on every item stocked there."
      />
      <Panel.Body className="flex flex-col gap-2">{list}</Panel.Body>
    </Panel>
  );
}

function BinsEditor({ bins, error, onChange }: { bins: string[]; error?: string; onChange: (bins: string[]) => void }) {
  const [next, setNext] = useState('');
  const rows = bins.map((code, i) => ({ id: String(i), code }));
  const add = () => {
    if (!next.trim()) return;
    onChange([...bins, next.trim().toUpperCase()]);
    setNext('');
  };
  return (
    <>
      <DataTable
        icon="grid_view"
        title="Bin locations"
        description="Aisle-rack-level codes, e.g. A-01-02."
        rows={rows}
        getRowId={(r) => r.id}
        columns={[
          {
            key: 'code',
            header: 'Bin code',
            cell: (r) => (
              <TextField
                aria-label="Bin code"
                value={r.code}
                onChange={(e) => onChange(bins.map((b, i) => (i === Number(r.id) ? e.currentTarget.value : b)))}
              />
            ),
          },
        ]}
        onRemove={(picked) => onChange(bins.filter((_, i) => !picked.some((p) => Number(p.id) === i)))}
        actions={
          <div className="flex items-center gap-1">
            <TextField
              aria-label="New bin code"
              placeholder="New bin, e.g. C-02-01"
              value={next}
              onChange={(e) => setNext(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <Button
              type="button"
              size="small"
              intent="primary"
              variant="solid"
              leadingIcon={<Icon size={16}>add</Icon>}
              onClick={add}
            >
              Add bin
            </Button>
          </div>
        }
        empty={
          <Text variant="small" tone="muted">
            No bins yet.
          </Text>
        }
      />
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}
    </>
  );
}
