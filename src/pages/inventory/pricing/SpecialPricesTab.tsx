import { useState } from 'react';
import { Alert, Button, Combobox, DatePicker, Icon, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { Fields, ReadOnly, bind, type Errors } from '../../../components/form/fields';
import { MasterList, statusColumn, type ListRoute } from '../../../components/form/MasterList';
import { useCollection } from '../../../components/form/MasterLookup';
import type { Item } from '../../../mocks/items';
import type { Partner } from '../../../mocks/partners';
import type { SpecialPriceRow, SpecialPriceSet, SpecialPriceTier } from '../../../mocks/pricing';
import { formatAmount } from '../../../services/format';
import { listItems } from '../../../services/items';
import { priceLists } from '../../../services/partnerMasters';
import { listPartners } from '../../../services/partners';
import { listPrice, priceListName, specialPrices } from '../../../services/priceLists';
import { useAsync } from '../../../services/useAsync';
import { newId } from '../../../services/useCollectionRows';

const blank = (): SpecialPriceSet => ({ id: newId('spp'), partnerId: '', priceListId: '', rows: [], remarks: '', active: true });

const blankRow = (): SpecialPriceRow => ({ id: newId('spr'), itemId: '', unitPrice: null, discountPct: null, validFrom: '', validTo: '', tiers: [] });

/** '' ↔ null for the "enter a price or a %" inputs. */
const optNum = (v: string) => (v === '' ? null : Number(v));
const optStr = (v: number | null) => (v === null ? '' : String(v));

const overlaps = (a: SpecialPriceRow, b: SpecialPriceRow) =>
  (!a.validTo || !b.validFrom || b.validFrom <= a.validTo) && (!b.validTo || !a.validFrom || a.validFrom <= b.validTo);

/** Exactly one of a fixed price or a % per row and tier — the field map's "not both". */
const termsError = (t: { unitPrice: number | null; discountPct: number | null }) =>
  t.unitPrice === null && t.discountPct === null
    ? 'needs a unit price or a discount %'
    : t.unitPrice !== null && t.discountPct !== null
      ? 'has both a unit price and a discount % — keep one'
      : t.unitPrice !== null && t.unitPrice < 0
        ? 'has a negative price'
        : t.discountPct !== null && !(t.discountPct >= 0 && t.discountPct <= 100)
          ? 'needs a discount of 0–100%'
          : undefined;

function validate(s: SpecialPriceSet, all: SpecialPriceSet[], items: Item[]): Errors {
  const e: Errors = {};
  const itemNo = (id: string) => items.find((i) => i.id === id)?.itemNo ?? 'An item';
  if (!s.partnerId) e.partnerId = 'Business partner is required.';
  else if (all.some((x) => x.id !== s.id && x.partnerId === s.partnerId)) e.partnerId = 'This partner already has special prices — open that record instead.';
  if (!s.priceListId) e.priceListId = 'Price list is required.';
  const problems: string[] = [];
  s.rows.forEach((r, i) => {
    if (!r.itemId) return problems.push(`Row ${i + 1} needs an item.`);
    const label = itemNo(r.itemId);
    const terms = termsError(r);
    if (terms) problems.push(`${label} ${terms}.`);
    if (r.validFrom && r.validTo && r.validTo < r.validFrom) problems.push(`${label}: valid to is before valid from.`);
    if (s.rows.some((o, j) => j < i && o.itemId === r.itemId && overlaps(o, r))) problems.push(`${label} is listed twice for overlapping dates.`);
    if (r.tiers.some((t) => !(t.qtyFrom > 0))) problems.push(`${label}: tier quantities must be more than 0.`);
    if (new Set(r.tiers.map((t) => t.qtyFrom)).size !== r.tiers.length) problems.push(`${label}: two tiers start at the same quantity.`);
    r.tiers.forEach((t) => {
      const tierTerms = termsError(t);
      if (tierTerms) problems.push(`${label}, tier ${t.qtyFrom}+ ${tierTerms}.`);
    });
  });
  if (problems.length) e.rows = problems.join(' ');
  return e;
}

/** Inventory › Price Lists › Special Prices: one partner's negotiated prices, item by item. */
export function SpecialPricesTab(route: ListRoute) {
  const rows = useCollection(specialPrices);
  const lists = useCollection(priceLists) ?? [];
  const partners = useAsync(listPartners, []) ?? [];
  const items = useAsync(listItems, []) ?? [];
  const partnerOf = (id: string) => partners.find((p) => p.id === id);
  const name = (s: SpecialPriceSet) => partnerOf(s.partnerId)?.name ?? s.partnerId;
  const today = new Date().toISOString().slice(0, 10);
  const current = (s: SpecialPriceSet) => s.rows.filter((r) => (!r.validFrom || r.validFrom <= today) && (!r.validTo || today <= r.validTo)).length;

  return (
    <MasterList<SpecialPriceSet>
      {...route}
      icon="handshake"
      title="Special prices"
      noun="special price"
      description="Negotiated prices for one business partner, item by item — a fixed unit price or a % off a price list, optionally with dates and quantity breaks. Checked first: a match overrides every other pricing rule."
      rows={rows}
      columns={[
        { key: 'partner', header: 'Business partner', cell: (s) => <span>{partnerOf(s.partnerId)?.code ?? ''} · {name(s)}</span> },
        { key: 'priceListId', header: 'Price list', cell: (s) => priceListName(s.priceListId) },
        { key: 'items', header: 'Items', cell: (s) => `${s.rows.length} item${s.rows.length === 1 ? '' : 's'}` },
        { key: 'current', header: 'In force today', cell: (s) => `${current(s)} of ${s.rows.length}` },
        statusColumn<SpecialPriceSet>(),
      ]}
      sortValue={(s, key) =>
        key === 'partner' ? name(s).toLowerCase() : key === 'items' ? s.rows.length : key === 'current' ? current(s) : key === 'active' ? Number(s.active) : priceListName(s.priceListId).toLowerCase()
      }
      searchText={(s) => `${partnerOf(s.partnerId)?.code ?? ''} ${name(s)} ${priceListName(s.priceListId)} ${s.remarks} ${s.rows.map((r) => items.find((i) => i.id === r.itemId)?.itemNo ?? '').join(' ')}`}
      blank={blank}
      label={(s) => name(s) || 'New special prices'}
      validate={(s, all) => validate(s, all, items)}
      onSave={async (s) => {
        await specialPrices.save(s);
      }}
      onSetActive={async (picked, active) => {
        for (const s of picked) await specialPrices.save({ ...s, active });
      }}
      editor={(s, update, errors, isNew) => {
        const f = bind(s, update);
        const partner = partnerOf(s.partnerId);
        return (
          <>
            <Alert intent="warning" title="Overrides every other pricing rule">
              A special price applies to every document for this partner and item until it’s changed or expires. Get management approval before
              adding or changing one, and set a Valid to on every time-limited agreement.
            </Alert>
            <Fields cols={3}>
              {f.lookup(
                'partnerId',
                'Business partner',
                partners.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
                {
                  required: true,
                  error: errors.partnerId,
                  disabled: !isNew,
                  hint: isNew ? 'Special prices are one partner at a time. For a whole group, use discount groups or period discounts.' : 'Fixed once saved.',
                },
              )}
              <ReadOnly label="BP name" value={partner?.name ?? '—'} hint={partner ? `Assigned price list: ${partner.priceListId ? priceListName(partner.priceListId) : '—'}` : undefined} />
              {f.choose(
                'priceListId',
                'Price list',
                lists.filter((l) => l.active || l.id === s.priceListId).map((l) => ({ value: l.id, label: l.name })),
                {
                  required: true,
                  error: errors.priceListId,
                  hint:
                    partner && s.priceListId && partner.priceListId && partner.priceListId !== s.priceListId
                      ? `The partner is on ${priceListName(partner.priceListId)} — % specials here come off ${priceListName(s.priceListId)}.`
                      : 'Discount % specials come off this list; fixed prices ignore it.',
                },
              )}
            </Fields>
            <SpecialRowsEditor set={s} items={items} partner={partner} error={errors.rows} onChange={(rows) => update({ rows })} />
            <Fields>{f.area('remarks', 'Remarks', { placeholder: 'Contract reference, who approved it' })}</Fields>
            <Fields>{f.status('active', 'Status')}</Fields>
          </>
        );
      }}
    />
  );
}

function SpecialRowsEditor({
  set,
  items,
  partner,
  error,
  onChange,
}: {
  set: SpecialPriceSet;
  items: Item[];
  partner: Partner | undefined;
  error?: string;
  onChange: (rows: SpecialPriceRow[]) => void;
}) {
  const [selected, setSelected] = useState<string>();
  const rows = set.rows;
  const patch = (id: string, p: Partial<SpecialPriceRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const itemOf = (id: string) => items.find((i) => i.id === id);
  const base = (r: SpecialPriceRow) => {
    const item = itemOf(r.itemId);
    return item && set.priceListId ? listPrice(item, set.priceListId, item.inventoryUom) : undefined;
  };
  const effective = (r: SpecialPriceRow) => {
    const b = base(r);
    return r.unitPrice !== null ? r.unitPrice : b !== undefined && r.discountPct !== null ? Math.round(b * (1 - r.discountPct / 100) * 100) / 100 : undefined;
  };
  const itemOptions = items.map((i) => ({ value: i.id, label: `${i.itemNo} · ${i.name}`, text: `${i.itemNo} ${i.name}` }));
  const open = rows.find((r) => r.id === selected);
  const add = () => {
    const row = blankRow();
    onChange([...rows, row]);
    setSelected(row.id);
  };

  return (
    <>
      <DataTable<SpecialPriceRow>
        icon="sell"
        title="Special prices"
        description={`PHP per inventory unit. Enter a unit price or a discount % off ${set.priceListId ? priceListName(set.priceListId) : 'the price list'} — not both. Items not listed keep normal pricing for ${partner?.name ?? 'this partner'}.`}
        rows={rows}
        getRowId={(r) => r.id}
        unsortable={['itemId', 'description', 'base', 'unitPrice', 'discountPct', 'effective', 'validFrom', 'validTo', 'tiers']}
        columns={[
          {
            key: 'itemId',
            header: 'Item no.',
            cell: (r) => (
              <Combobox aria-label="Item" className="w-56" options={itemOptions} value={r.itemId || null} onValueChange={(v) => patch(r.id, { itemId: v ?? '' })} />
            ),
          },
          { key: 'description', header: 'Description', cell: (r) => itemOf(r.itemId)?.name ?? '' },
          { key: 'base', header: set.priceListId ? priceListName(set.priceListId) : 'List price', cell: (r) => (base(r) === undefined ? '—' : formatAmount(base(r)!)) },
          {
            key: 'unitPrice',
            header: 'Unit price',
            cell: (r) => (
              <TextField aria-label="Unit price" type="number" min={0} prefix="PHP" className="w-36" value={optStr(r.unitPrice)} onChange={(e) => patch(r.id, { unitPrice: optNum(e.currentTarget.value) })} />
            ),
          },
          {
            key: 'discountPct',
            header: 'Discount %',
            cell: (r) => (
              <TextField aria-label="Discount %" type="number" min={0} max={100} suffix="%" className="w-24" value={optStr(r.discountPct)} onChange={(e) => patch(r.id, { discountPct: optNum(e.currentTarget.value) })} />
            ),
          },
          { key: 'effective', header: 'Effective', cell: (r) => (effective(r) === undefined ? '—' : formatAmount(effective(r)!)) },
          {
            key: 'validFrom',
            header: 'Valid from',
            cell: (r) => <DatePicker aria-label="Valid from" className="w-fit" value={r.validFrom || null} onValueChange={(v) => patch(r.id, { validFrom: v ?? '' })} />,
          },
          {
            key: 'validTo',
            header: 'Valid to',
            cell: (r) => <DatePicker aria-label="Valid to" className="w-fit" value={r.validTo || null} onValueChange={(v) => patch(r.id, { validTo: v ?? '' })} />,
          },
          {
            key: 'tiers',
            header: 'Qty breaks',
            cell: (r) => (
              <Button type="button" size="small" variant={selected === r.id ? 'solid' : 'outline'} onClick={() => setSelected(selected === r.id ? undefined : r.id)}>
                {r.tiers.length ? `${r.tiers.length} tier${r.tiers.length === 1 ? '' : 's'}` : 'Add'}
              </Button>
            ),
          },
        ]}
        onRemove={(picked) => onChange(rows.filter((r) => !picked.some((p) => p.id === r.id)))}
        actions={
          <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={add}>
            Add item
          </Button>
        }
        empty={
          <Text variant="small" tone="muted">
            No items yet.
          </Text>
        }
      />
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}
      {open ? <TiersEditor row={open} label={itemOf(open.itemId)?.itemNo ?? 'this item'} onChange={(tiers) => patch(open.id, { tiers })} /> : null}
    </>
  );
}

/** The lower panel: quantity breaks for the selected special price row. */
function TiersEditor({ row, label, onChange }: { row: SpecialPriceRow; label: string; onChange: (tiers: SpecialPriceTier[]) => void }) {
  const tiers = [...row.tiers].sort((a, b) => a.qtyFrom - b.qtyFrom);
  const patch = (id: string, p: Partial<SpecialPriceTier>) => onChange(row.tiers.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const add = () => {
    const last = tiers[tiers.length - 1];
    onChange([...row.tiers, { id: newId('spt'), qtyFrom: last ? last.qtyFrom * 2 : 10, unitPrice: null, discountPct: null }]);
  };
  const below = tiers[0]?.qtyFrom;

  return (
    <DataTable<SpecialPriceTier>
      variant="card"
      icon="stacked_bar_chart"
      title={`Quantity breaks — ${label}`}
      description={`Line quantity in the item’s inventory unit. A tier runs from its Qty from up to the next tier.${below ? ` Below ${below}, the row’s own price or % applies.` : ''}`}
      rows={tiers}
      getRowId={(t) => t.id}
      noPagination
      unsortable={['qtyFrom', 'unitPrice', 'discountPct']}
      columns={[
        {
          key: 'qtyFrom',
          header: 'Qty from',
          cell: (t) => <TextField aria-label="Qty from" type="number" min={0} className="w-28" value={String(t.qtyFrom)} onChange={(e) => patch(t.id, { qtyFrom: Number(e.currentTarget.value) || 0 })} />,
        },
        {
          key: 'unitPrice',
          header: 'Unit price',
          cell: (t) => <TextField aria-label="Tier unit price" type="number" min={0} prefix="PHP" className="w-36" value={optStr(t.unitPrice)} onChange={(e) => patch(t.id, { unitPrice: optNum(e.currentTarget.value) })} />,
        },
        {
          key: 'discountPct',
          header: 'Discount %',
          cell: (t) => <TextField aria-label="Tier discount %" type="number" min={0} max={100} suffix="%" className="w-24" value={optStr(t.discountPct)} onChange={(e) => patch(t.id, { discountPct: optNum(e.currentTarget.value) })} />,
        },
      ]}
      onRemove={(picked) => onChange(row.tiers.filter((t) => !picked.some((p) => p.id === t.id)))}
      actions={
        <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>add</Icon>} onClick={add}>
          Add tier
        </Button>
      }
      empty={
        <Text variant="small" tone="muted">
          No quantity breaks — the row’s price applies to every quantity.
        </Text>
      }
    />
  );
}
