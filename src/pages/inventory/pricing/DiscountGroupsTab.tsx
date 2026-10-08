import { useEffect, useState } from 'react';
import { Alert, Button, Combobox, Icon, IconButton, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { useCollection } from '../../../components/form/MasterLookup';
import type { DiscountGroupRow } from '../../../mocks/pricing';
import { itemGroups } from '../../../services/inventoryMasters';
import { bpGroups } from '../../../services/partnerMasters';
import { discountGroups } from '../../../services/priceLists';
import { newId } from '../../../services/useCollectionRows';
import { ROLE_CONFIG } from '../../partners/roles';

/**
 * Inventory › Price Lists › Discount Groups: a BP group × item group matrix of discount %.
 * Rows are partner groups (customer and vendor), columns are item groups; an empty cell is 0%.
 * Removing a row deactivates it, since saved rows are never deleted.
 */
export function DiscountGroupsTab() {
  const saved = useCollection(discountGroups);
  const groups = useCollection(bpGroups) ?? [];
  const columns = useCollection(itemGroups) ?? [];
  const [draft, setDraft] = useState<DiscountGroupRow[]>();
  const [adding, setAdding] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();

  // Start from what's saved (again after a save elsewhere, unless there are edits).
  const dirty = draft !== undefined && JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (saved && !dirty) setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const rows = (draft ?? []).filter((r) => r.active);
  const groupOf = (id: string) => groups.find((g) => g.id === id);
  const addable = groups.filter((g) => g.active && g.role !== 'lead' && !rows.some((r) => r.bpGroupId === g.id));
  const invalid = rows.some((r) => r.discounts.some((d) => !(d.discountPct >= 0 && d.discountPct <= 100)));

  const setRow = (id: string, patch: Partial<DiscountGroupRow>) => setDraft((d) => d?.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setCell = (row: DiscountGroupRow, itemGroup: string, value: string) => {
    const cell = { itemGroup, discountPct: Number(value) };
    const has = row.discounts.some((d) => d.itemGroup === itemGroup);
    const discounts =
      value === ''
        ? row.discounts.filter((d) => d.itemGroup !== itemGroup)
        : has
          ? row.discounts.map((d) => (d.itemGroup === itemGroup ? cell : d))
          : [...row.discounts, cell];
    setRow(row.id, { discounts });
  };
  const addRow = () => {
    if (!adding) return;
    const existing = draft?.find((r) => r.bpGroupId === adding);
    if (existing) setRow(existing.id, { active: true });
    else setDraft((d) => [...(d ?? []), { id: newId('dgr'), bpGroupId: adding, discounts: [], active: true }]);
    setAdding(null);
  };
  const save = async () => {
    if (!draft || invalid) return;
    setSaving(true);
    for (const row of draft) {
      const before = saved?.find((r) => r.id === row.id);
      if (JSON.stringify(before) !== JSON.stringify(row)) await discountGroups.save(row);
    }
    setSaving(false);
    setNotice('Discount groups saved. New document lines use them right away.');
  };

  return (
    <>
      {notice ? (
        <Alert intent="success" onClose={() => setNotice(undefined)}>
          {notice}
        </Alert>
      ) : null}
      <DataTable<DiscountGroupRow>
        variant="card"
        icon="grid_on"
        title="Discount groups"
        description="% off the price list price for every partner in a group buying from an item group. No dates — for time-limited promotions use period discounts. Applies only when no special price or period/volume discount matches, and not to partners set to “Do not apply discount groups”."
        rows={rows}
        getRowId={(r) => r.id}
        noPagination
        unsortable={columns.map((c) => c.name)}
        columns={[
          {
            key: 'bpGroupId',
            header: 'BP group',
            cell: (r) => {
              const group = groupOf(r.bpGroupId);
              const role = group?.role;
              return (
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <IconButton label={`Remove ${group?.name ?? r.bpGroupId}`} size="small" variant="ghost" onClick={() => setRow(r.id, { active: false })}>
                    <Icon size={16}>close</Icon>
                  </IconButton>
                  <div className="flex flex-col">
                    <span>{group?.name ?? r.bpGroupId}</span>
                    {role ? (
                      <Text variant="small" tone="muted">
                        {ROLE_CONFIG[role].title}
                      </Text>
                    ) : null}
                  </div>
                </div>
              );
            },
          },
          ...columns.map((c) => ({
            key: c.name,
            header: c.name,
            cell: (r: DiscountGroupRow) => {
              const v = r.discounts.find((d) => d.itemGroup === c.name)?.discountPct;
              // Fixed width: short headers (iPad, Mac) would otherwise squeeze the input to nothing.
              return (
                <div className="w-24 min-w-24">
                <TextField
                  aria-label={`${groupOf(r.bpGroupId)?.name ?? r.bpGroupId} × ${c.name} discount`}
                  type="number"
                  min={0}
                  max={100}
                  suffix="%"
                  placeholder="0"
                  invalid={v !== undefined && !(v >= 0 && v <= 100)}
                  value={v === undefined ? '' : String(v)}
                  onChange={(e) => setCell(r, c.name, e.currentTarget.value)}
                />
                </div>
              );
            },
          })),
        ]}
        actions={
          <div className="flex items-center gap-1">
            <Combobox
              aria-label="BP group to add"
              className="w-56"
              placeholder="Add a BP group…"
              options={addable.map((g) => ({ value: g.id, label: `${g.name} (${ROLE_CONFIG[g.role].title})` }))}
              value={adding}
              onValueChange={(v) => setAdding(v ?? null)}
            />
            <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>add</Icon>} disabled={!adding} onClick={addRow}>
              Add row
            </Button>
            <Button type="button" size="small" variant="outline" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
              Cancel
            </Button>
            <Button type="button" size="small" intent="primary" variant="solid" disabled={!dirty || saving || invalid} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        }
        empty={
          <Text variant="small" tone="muted">
            {draft ? 'No discount groups yet. Add a BP group to start a row.' : 'Loading…'}
          </Text>
        }
      />
      {invalid ? (
        <Text variant="small" tone="danger">
          Discounts must be 0–100%.
        </Text>
      ) : null}
    </>
  );
}
