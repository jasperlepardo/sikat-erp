import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Icon,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Text,
  TextField,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { RowMenu } from '../../../../components/form/RowMenu';
import type { Item } from '../../../../mocks/items';
import { ItemSaveError, listVariants, saveItem, stockTotals } from '../../../../services/items';
import { useAsync } from '../../../../services/useAsync';
import { formatAmount } from '../../../../services/format';
import { VariantAxesEditor } from './VariantAxesEditor';
import { VariantPanel } from './VariantPanel';
import { variantFromParent, type TabProps } from './types';

const LIST_PATH = '/inventory/items';

/** Cartesian product of all variant axes options → array of attribute maps. */
function axisCombos(axes: { name: string; options: string[] }[]): Record<string, string>[] {
  return axes.reduce<Record<string, string>[]>(
    (acc, axis) => acc.flatMap((prev) => axis.options.map((opt) => ({ ...prev, [axis.name]: opt }))),
    [{}],
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function VariantsTab({ draft, update }: TabProps) {
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  // Per-row inline price editing: variantId → current input string.
  const [editingPrices, setEditingPrices] = useState<Map<string, string>>(new Map());
  const [savingPrices, setSavingPrices] = useState<Set<string>>(new Set());
  const variants = useAsync(() => listVariants(draft.id ?? ''), [draft.id, version]);

  const axes = draft.variantAxes;
  const hasValidAxes = axes.length > 0 && axes.every((a) => a.name && a.options.length > 0);

  const combos = hasValidAxes ? axisCombos(axes) : [];
  const existingKeys = new Set(
    (variants ?? []).map((v) => axes.map((a) => v.variantAttributes[a.name] ?? '').join('|')),
  );
  const newCombos = combos.filter((attrs) => !existingKeys.has(axes.map((a) => attrs[a.name] ?? '').join('|')));

  // Aggregate stock across all variants.
  const totalStock = useMemo(() => {
    if (!variants) return null;
    return variants.reduce((acc, v) => {
      const t = stockTotals(v);
      return { inStock: acc.inStock + t.inStock, committed: acc.committed + t.committed, ordered: acc.ordered + t.ordered, available: acc.available + t.available };
    }, { inStock: 0, committed: 0, ordered: 0, available: 0 });
  }, [variants]);

  // Variants whose attributes contain values not present in current axes options.
  const staleVariants = useMemo(() => {
    if (!variants) return [];
    return variants.filter((v) =>
      axes.some((a) => {
        const val = v.variantAttributes[a.name];
        return val && !a.options.includes(val);
      }),
    );
  }, [variants, axes]);

  const generate = async () => {
    if (!draft.id || newCombos.length === 0) return;
    setGenerating(true);
    setGenError(null);
    try {
      for (const attrs of newCombos) {
        await saveItem(variantFromParent(draft, attrs));
      }
      setVersion((v) => v + 1);
    } catch (err) {
      setGenError(err instanceof ItemSaveError ? err.message : 'Failed to generate variants.');
    } finally {
      setGenerating(false);
    }
  };

  /** Clear stale attributes — keeps the attribute key but clears the value so user can re-select. */
  const syncAttributes = async () => {
    for (const v of staleVariants) {
      const synced: Record<string, string> = { ...v.variantAttributes };
      for (const a of axes) {
        if (synced[a.name] && !a.options.includes(synced[a.name])) synced[a.name] = '';
      }
      await saveItem({ ...v, variantAttributes: synced });
    }
    setVersion((n) => n + 1);
  };

  /** Detach a variant: make it a standalone item by clearing its parent link. */
  const detach = async (v: Item) => {
    await saveItem({ ...v, parentItemId: '', variantAxes: [], variantAttributes: {} });
    setVersion((n) => n + 1);
  };

  const savePriceEdit = async (v: Item, raw: string) => {
    const price = parseFloat(raw);
    if (isNaN(price) || price < 0 || round2(price) === v.basePrice) {
      setEditingPrices((m) => { const n = new Map(m); n.delete(v.id ?? ''); return n; });
      return;
    }
    setSavingPrices((s) => new Set(s).add(v.id ?? ''));
    try {
      await saveItem({ ...v, basePrice: round2(price) });
      setVersion((n) => n + 1);
    } finally {
      setSavingPrices((s) => { const n = new Set(s); n.delete(v.id ?? ''); return n; });
      setEditingPrices((m) => { const n = new Map(m); n.delete(v.id ?? ''); return n; });
    }
  };

  if (!variants) return <Text tone="muted" className="p-4">Loading variants…</Text>;

  const variantLabel = (v: Item) =>
    axes.map((a) => v.variantAttributes[a.name]).filter(Boolean).join(' / ') || '—';

  const columns: TableColumn<Item>[] = [
    {
      key: 'variant',
      header: 'Variant',
      cell: (v) => variantLabel(v),
    },
    {
      key: 'itemNo',
      header: 'Item No.',
      cell: (v) => (
        <TableSubcontent subcopy={v.description !== v.itemNo ? v.description : undefined}>
          <TableLink onClick={() => setEditing(v)}>
            {v.itemNo || <span className="text-muted">No SKU yet</span>}
          </TableLink>
        </TableSubcontent>
      ),
    },
    {
      key: 'basePrice',
      header: 'Base price',
      cell: (v) => {
        const id = v.id ?? '';
        if (editingPrices.has(id)) {
          return (
            <TextField
              aria-label="Base price"
              type="number"
              min={0}
              className="w-32"
              value={editingPrices.get(id) ?? ''}
              disabled={savingPrices.has(id)}
              autoFocus
              onChange={(e) => setEditingPrices((m) => new Map(m).set(id, e.currentTarget.value))}
              onBlur={(e) => savePriceEdit(v, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.currentTarget.blur(); }
                if (e.key === 'Escape') { setEditingPrices((m) => { const n = new Map(m); n.delete(id); return n; }); }
              }}
            />
          );
        }
        return (
          <button
            type="button"
            className="tabular-nums hover:underline cursor-text text-left"
            title="Click to edit price"
            onClick={() => setEditingPrices((m) => new Map(m).set(id, String(v.basePrice)))}
          >
            {v.basePrice ? <TableAmount currency="PHP">{formatAmount(v.basePrice)}</TableAmount> : <span className="text-muted">—</span>}
          </button>
        );
      },
    },
    {
      key: 'inStock',
      header: 'In stock',
      cell: (v) => {
        if (!v.inventoryItem) return <span className="text-muted">—</span>;
        const totals = stockTotals(v);
        return <>{totals.inStock.toLocaleString('en-PH')} {v.inventoryUom}</>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (v) => {
        if (!v.inventoryItem) return <TableStatus intent="primary">Non-stock</TableStatus>;
        const { inStock, available } = stockTotals(v);
        if (inStock === 0) return <TableStatus intent="danger">Out of stock</TableStatus>;
        if (available <= v.minStock) return <TableStatus intent="warning">Low stock</TableStatus>;
        return <TableStatus intent="success">In stock</TableStatus>;
      },
    },
  ];

  const locked = draft.hasTransactions;

  return (
    <div className="flex flex-col gap-3">
      {/* Options — define the axes here, generate variants below */}
      <Section icon="tune" title="Options">
        <Checkbox
          checked={axes.length > 0}
          disabled={locked}
          onChange={(checked) =>
            update(
              checked
                ? { variantAxes: [{ name: '', options: [] }], purchaseItem: false, salesItem: false, inventoryItem: false }
                : { variantAxes: [] },
            )
          }
        >
          This item has options, like size or color
        </Checkbox>
        {axes.length > 0 && (
          <VariantAxesEditor
            axes={axes}
            onChange={(next) => update({ variantAxes: next })}
            disabled={locked}
          />
        )}
      </Section>

      {/* Stale attribute warning */}
      {staleVariants.length > 0 && (
        <Alert intent="warning" title={`${staleVariants.length} variant${staleVariants.length !== 1 ? 's have' : ' has'} attributes that no longer match the options`}>
          <div className="flex items-center gap-2">
            <span>Option values were renamed or removed. Sync to clear the stale values so variants can be re-assigned.</span>
            <Button type="button" intent="warning" variant="outline" size="medium" onClick={syncAttributes}>
              Sync attributes
            </Button>
          </div>
        </Alert>
      )}

      {genError && <Alert intent="danger" title="Generation failed">{genError}</Alert>}

      {/* Aggregate stock summary */}
      {totalStock && variants.some((v) => v.inventoryItem) && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'In stock', value: totalStock.inStock },
            { label: 'Committed', value: totalStock.committed },
            { label: 'Ordered', value: totalStock.ordered },
            { label: 'Available', value: totalStock.available },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-border px-3 py-2">
              <div className="text-xs opacity-60">{label}</div>
              <div className={`text-sm font-semibold tabular-nums ${label === 'Available' && value < 0 ? 'text-danger' : ''}`}>
                {value.toLocaleString('en-PH')}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Text variant="small" tone="muted">
          {variants.length} variant{variants.length !== 1 ? 's' : ''}
          {newCombos.length > 0 && ` · ${newCombos.length} new combo${newCombos.length !== 1 ? 's' : ''} ready to generate`}
        </Text>
        <div className="flex gap-2">
          {hasValidAxes && newCombos.length > 0 && (
            <Button
              type="button"
              intent="primary"
              variant="solid"
              size="large"
              disabled={!draft.id || generating}
              onClick={generate}
            >
              {generating ? 'Generating…' : `Generate ${newCombos.length} variant${newCombos.length !== 1 ? 's' : ''}`}
            </Button>
          )}
          <Button
            type="button"
            intent="default"
            variant="outline"
            size="large"
            leadingIcon={<Icon size={18}>add</Icon>}
            onClick={() => navigate(`${LIST_PATH}/new`, { state: { variantOf: draft, variantAttrs: newCombos[0] ?? {} } })}
          >
            New variant
          </Button>
        </div>
      </div>

      {!hasValidAxes && axes.length > 0 && (
        <Alert intent="primary" title="Finish defining options">
          Give each option a name and at least one value to enable generation.
        </Alert>
      )}

      {!draft.id && (
        <Alert intent="primary" title="Save the item first">
          Save this item before generating variants.
        </Alert>
      )}

      <Card>
        {variants.length === 0 ? (
          <Text tone="muted" className="p-4">
            No variants yet.{hasValidAxes && draft.id ? ' Click "Generate" above to create all combinations.' : ''}
          </Text>
        ) : (
          <Table
            caption={`Variants of ${draft.name}`}
            columns={[
              ...columns,
              {
                key: 'actions',
                header: '',
                cell: (v) => (
                  <RowMenu
                    label={`Actions for ${variantLabel(v)}`}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => setEditing(v) },
                      { label: 'Open full record', icon: 'open_in_new', onSelect: () => navigate(`${LIST_PATH}/${v.id}`) },
                      { label: 'Remove from family', icon: 'link_off', onSelect: () => detach(v) },
                    ]}
                  />
                ),
              },
            ]}
            rows={variants}
            getRowId={(v) => v.id ?? v.itemNo}
            layout="fill"
            onRowAction={(v) => setEditing(v)}
          />
        )}
      </Card>

      {editing && (
        <VariantPanel
          key={editing.id}
          variant={editing}
          axes={axes}
          title={variantLabel(editing)}
          onDone={() => { setEditing(null); setVersion((v) => v + 1); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
