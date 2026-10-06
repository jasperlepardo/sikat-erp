import { useState } from 'react';
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
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
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

export function VariantsTab({ draft, update }: TabProps) {
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const variants = useAsync(() => listVariants(draft.id ?? ''), [draft.id, version]);

  const axes = draft.variantAxes;
  const hasValidAxes = axes.length > 0 && axes.every((a) => a.name && a.options.length > 0);

  const combos = hasValidAxes ? axisCombos(axes) : [];
  const existingKeys = new Set(
    (variants ?? []).map((v) => axes.map((a) => v.variantAttributes[a.name] ?? '').join('|')),
  );
  const newCombos = combos.filter((attrs) => !existingKeys.has(axes.map((a) => attrs[a.name] ?? '').join('|')));

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
      cell: (v) => (
        v.basePrice ? <TableAmount currency="PHP">{formatAmount(v.basePrice)}</TableAmount> : <span className="text-muted">—</span>
      ),
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

      {genError && <Alert intent="danger" title="Generation failed">{genError}</Alert>}

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
            onClick={() => navigate(`${LIST_PATH}/new`, { state: { variantOf: draft } })}
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
            columns={columns}
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
