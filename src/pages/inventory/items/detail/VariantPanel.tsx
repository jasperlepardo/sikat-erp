import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Icon, Link, Select, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, FieldStack, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { newBarcodeRow, type Item, type VariantAxis } from '../../../../mocks/items';
import { ItemSaveError, saveItem, stockTotals } from '../../../../services/items';
import { formatAmount } from '../../../../services/format';
import { EditPanel } from '../../../partners/detail/EditPanel';
import type { Draft } from './types';

const LIST_PATH = '/inventory/items';

interface Props {
  variant: Item;
  axes: VariantAxis[];
  title?: string;
  onDone: () => void;
  onCancel: () => void;
}

export function VariantPanel({ variant, axes, title, onDone, onCancel }: Props) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>({ ...variant });
  const [errors, setErrors] = useState<Errors>({});
  const [, setIsSaving] = useState(false);
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const f = bind(draft, update);

  const totals = stockTotals(variant);

  const done = async () => {
    const e: Errors = {};
    if (!draft.description?.trim()) e.description = 'Description is required.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setIsSaving(true);
    try {
      await saveItem(draft);
      onDone();
    } catch (err) {
      if (err instanceof ItemSaveError) setErrors({ [err.field]: err.message });
      else throw err;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <EditPanel
      icon="inventory_2"
      title={title || draft.description || draft.itemNo || 'Variant'}
      onCancel={onCancel}
      onDone={done}
    >
      {/* Attribute values */}
      {axes.length > 0 && (
        <Section icon="tune" title="Attributes">
          <FieldStack>
            {axes.map((axis) => (
              <ReadOnly key={axis.name} label={axis.name} value={draft.variantAttributes[axis.name] ?? '—'} />
            ))}
          </FieldStack>
        </Section>
      )}

      {/* Identity */}
      <Section icon="inventory_2" title="Item">
        <Fields cols={2}>
          {f.text('itemNo', 'Item No. (SKU)', { error: errors.itemNo, hint: 'Unique code used on documents.' })}
          {f.text('description', 'Description', { required: true, error: errors.description })}
          {f.text('sellingItemNo', 'Selling item no.', { hint: 'Alternate SKU printed on sales documents.' })}
          {f.text('gtin', 'GTIN / Barcode', { hint: 'Primary barcode (EAN-13, UPC-A).' })}
        </Fields>
      </Section>

      {/* Pricing */}
      <Section icon="payments" title="Pricing">
        <Fields cols={2}>
          {f.num('basePrice', `Base price (per ${draft.inventoryUom}, VAT incl.)`, {
            hint: 'Other units derive their price from this unless they have their own override.',
          })}
          <ReadOnly
            label="Item cost (per inv. unit)"
            value={draft.itemCost ? `₱${formatAmount(draft.itemCost)}` : '—'}
            hint="Auto-maintained by moving average or FIFO from purchase receipts."
          />
        </Fields>
        {draft.uoms.length > 1 && (
          <div className="mt-2 flex flex-col gap-1">
            <Text variant="small" tone="muted">Effective price per unit — click to set an override</Text>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {draft.uoms.map((u) => {
                    const derived = Math.round(draft.basePrice * u.qty * 100) / 100;
                    const hasOverride = u.price > 0;
                    const isBase = u.uom === draft.inventoryUom;
                    return (
                      <tr key={u.uom} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 font-medium">
                          {u.uom}
                          {isBase && <span className="ml-1 opacity-40 text-xs">base</span>}
                        </td>
                        <td className="px-3 py-1.5 opacity-50 text-xs">
                          {isBase ? '×1' : `×${u.qty}`}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {isBase ? (
                            <span>₱{formatAmount(draft.basePrice)}</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              aria-label={`Price for ${u.uom}`}
                              className="w-32 rounded border border-border px-2 py-0.5 text-right tabular-nums text-sm bg-transparent"
                              placeholder={`₱${formatAmount(derived)}`}
                              value={u.price || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.currentTarget.value) || 0;
                                update({ uoms: draft.uoms.map((x) => x.uom === u.uom ? { ...x, price: val } : x) });
                              }}
                            />
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {!isBase && hasOverride && (
                            <button
                              type="button"
                              className="text-xs opacity-40 hover:opacity-100"
                              title="Clear override"
                              onClick={() => update({ uoms: draft.uoms.map((x) => x.uom === u.uom ? { ...x, price: 0 } : x) })}
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Stock (read-only) */}
      {variant.inventoryItem && (
        <Section icon="warehouse" title="Stock">
          <Fields cols={2}>
            <ReadOnly label="In stock" value={`${totals.inStock.toLocaleString('en-PH')} ${variant.inventoryUom}`} />
            <ReadOnly label="Committed" value={totals.committed.toLocaleString('en-PH')} />
            <ReadOnly label="Ordered" value={totals.ordered.toLocaleString('en-PH')} />
            <ReadOnly label="Available" value={totals.available.toLocaleString('en-PH')} />
          </Fields>
        </Section>
      )}

      {/* Barcodes */}
      <Section icon="barcode" title="Barcodes">
        {draft.barcodes.length === 0 && (
          <Text variant="small" tone="muted">
            No barcodes.{draft.gtin ? ` GTIN ${draft.gtin} (above) still scans.` : ''}
          </Text>
        )}
        {draft.barcodes.map((b) => (
          <div key={b.id} className="flex items-center gap-2">
            <Select
              aria-label="UoM"
              className="w-20 shrink-0"
              options={draft.uoms.map((u) => ({ value: u.uom, label: u.uom }))}
              value={b.uom}
              onValueChange={(uom) => uom && update({ barcodes: draft.barcodes.map((x) => x.id === b.id ? { ...x, uom } : x) })}
            />
            <TextField
              aria-label="Barcode"
              placeholder="EAN-13, UPC-A…"
              className="flex-1"
              value={b.barcode}
              invalid={!!errors[`barcode:${b.id}:barcode`]}
              onChange={(e) => update({ barcodes: draft.barcodes.map((x) => x.id === b.id ? { ...x, barcode: e.currentTarget.value.trim() } : x) })}
            />
            <TextField
              aria-label="Label"
              placeholder="Label (optional)"
              className="w-28 shrink-0"
              value={b.freeText}
              onChange={(e) => update({ barcodes: draft.barcodes.map((x) => x.id === b.id ? { ...x, freeText: e.currentTarget.value } : x) })}
            />
            <button
              type="button"
              aria-label="Remove barcode"
              className="opacity-40 hover:opacity-100 hover:text-danger shrink-0"
              onClick={() => update({ barcodes: draft.barcodes.filter((x) => x.id !== b.id) })}
            >
              <Icon size={16}>close</Icon>
            </button>
          </div>
        ))}
        <Button
          type="button"
          intent="default"
          variant="outline"
          size="medium"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={() => update({ barcodes: [...draft.barcodes, newBarcodeRow(draft.inventoryUom)] })}
        >
          Add barcode
        </Button>
        {errors.barcodes && <Text variant="small" tone="danger">{errors.barcodes}</Text>}
      </Section>

      {/* Open full record */}
      <div className="flex items-center gap-1 px-1">
        <Icon size={16} className="text-muted">open_in_new</Icon>
        <Link onClick={() => { onCancel(); navigate(`${LIST_PATH}/${variant.id}`); }}>
          Open full item record
        </Link>
        <Text variant="small" tone="muted">to edit tax, UoMs, warehouses and more.</Text>
      </div>
    </EditPanel>
  );
}
