import { useState } from 'react';
import { DatePicker, Select, TableStatus, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { DocLines } from '../form/docLines/DocLines';
import type { PrefColumn } from '../form/columnPrefs';
import { masterCol, priceCol, textCol } from '../form/docLines/docColumns';
import { groupUoms } from '../../mocks/itemMasters';
import { itemsPerUom } from '../../mocks/items';
import type { Item } from '../../mocks/items';
import type { BaLine } from '../../mocks/blanketAgreements';
import type { PbaLine } from '../../mocks/purchaseBlanketAgreements';
import type { ShippingType } from '../../mocks/itemMasters';
import type { Project } from '../../mocks/partnerMasters';
import { round2 } from '../../services/num';
import { formatAmount } from '../../services/format';
import { formatDate, todayISO } from '../../services/dates';
import { itemGroupName, type InventoryMasters } from '../../services/inventoryMasters';
import { exchangeRates, rateOn } from '../../services/masterData';
import { lineTotal, openAmountLC, openQty } from '../../services/blanketAgreements';
import { projectDef, shippingTypeDef } from '../../pages/settings/masterDefs';
import { CurrencyToggle, currencyChoices } from '../../pages/purchasing/shared/CurrencyToggle';

const num = (v: string) => (v === '' ? 0 : Number(v));

/** A blanket agreement line: purchase and sales agreement lines have the same shape. */
type Line = PbaLine | BaLine;

interface Props<L extends Line> {
  /** Purchase agreements commit purchase items at cost; sales agreements, sales items at their net price. */
  side: 'purchase' | 'sales';
  draft: { lines: L[]; currency: string; startDate?: string };
  update: (patch: { lines: L[] }) => void;
  m: { items: Item[]; inv: Pick<InventoryMasters, 'uoms' | 'uomGroups'> };
  readOnly: boolean;
  newLine: () => L;
}

/**
 * The Details tab of a purchase or sales blanket agreement — rendered through the
 * shared `DocLines` shell so it matches every other purchasing/sales contents table
 * (shared item cell, inline add-row, ⋯ row menu, Columns show/hide). The column set
 * follows the SAP B1 "Details Tab (Matrix Grid)" field list; the long tail of
 * read-only cumulative/UoM columns ships hidden and is revealed via the Columns menu.
 */
export function AgreementLinesCard<L extends Line>({ side, draft, update, m, readOnly, newLine }: Props<L>) {
  const purchase = side === 'purchase';
  const { currency } = draft;
  const lines = draft.lines;

  // Amounts are stored in the agreement's own currency. Like the RFQ, a non-PHP agreement can
  // switch the amount columns to PHP (local currency) via a toggle; the FX rate is the one on the
  // agreement's start date. Viewing another currency is read-only — it only converts the display.
  const choices = currencyChoices(currency);
  const [view, setView] = useState('');
  const shown = choices.includes(view) ? view : currency;
  const converted = shown !== currency;
  const fx = currency === 'PHP' ? 1 : rateOn([...exchangeRates.snapshot()], currency, draft.startDate ?? todayISO())?.rate ?? 0;
  const factor = converted ? fx : 1;
  const cur = (header: string) => `${header} (${shown})`;
  const locked = readOnly || converted;

  const itemOf = (l: L) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<Line>) =>
    update({ lines: lines.map((l) => (l.id === id ? ({ ...l, ...p } as L) : l)) });

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (purchase ? i.purchaseItem : i.salesItem))
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.description || i.name}</span>
          </div>
        ),
        text: `${i.itemNo} ${i.name} ${i.description}`,
      }));

  /** The fields an item stamps onto a line — shared by picking on an existing line and the add-row. */
  const itemPatch = (itemId: string): Partial<L> => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return { itemId: '', itemNo: '', description: '', itemGroupId: '' } as Partial<L>;
    const unit = purchase ? item.purchasingUom : item.salesUom;
    const uom = m.inv.uoms.find((u) => u.code === unit);
    const uomGroupId = m.inv.uomGroups.find((g) => g.baseUom === unit || g.conversions.some((c) => c.altUom === unit))?.id ?? '';
    return {
      itemId: item.id,
      itemNo: item.itemNo,
      description: item.description || item.name,
      itemGroupId: item.itemGroupId,
      // The agreed purchase cost; a sale's price net of VAT.
      unitPrice: round2(purchase ? item.itemCost : item.basePrice / 1.12),
      uomCode: unit,
      uomName: uom?.name ?? unit,
      itemsPerUnit: itemsPerUom(item, unit) ?? 1,
      uomGroupId,
    } as Partial<L>;
  };

  /** Units a line can switch to: the item's UoM group, with the saved unit kept selectable. */
  const uomOptionsFor = (l: L) => {
    const group =
      m.inv.uomGroups.find((g) => g.id === l.uomGroupId) ??
      m.inv.uomGroups.find((g) => g.baseUom === l.uomCode || g.conversions.some((c) => c.altUom === l.uomCode));
    const codes = group ? groupUoms(group) : [l.uomCode].filter(Boolean);
    const opts = m.inv.uoms
      .filter((u) => (u.active || u.code === l.uomCode) && codes.includes(u.code))
      .map((u) => ({ value: u.code, label: u.code }));
    return opts.length ? opts : [{ value: l.uomCode, label: l.uomCode || l.uomName }];
  };

  const changeUom = (l: L, code: string) => {
    const item = itemOf(l);
    const uom = m.inv.uoms.find((u) => u.code === code);
    patch(l.id, { uomCode: code, uomName: uom?.name ?? code, itemsPerUnit: (item && itemsPerUom(item, code)) || 1 } as Partial<L>);
  };

  const uomGroupNameOf = (l: L) => m.inv.uomGroups.find((g) => g.id === l.uomGroupId)?.name ?? '—';

  // Read-only roll-up figures: show the value in the shown currency, de-emphasised (muted) when
  // zero, full-strength otherwise — the same rule as AgreementSummaryCard on this page.
  const money = (n: number) => (
    <Text variant="small" tone={n === 0 ? 'muted' : 'default'} className="tabular-nums">{formatAmount(n * factor)}</Text>
  );
  const count = (n: number) => (
    <Text variant="small" tone={n === 0 ? 'muted' : 'default'} className="tabular-nums">{n.toLocaleString('en-PH')}</Text>
  );

  const columns: PrefColumn<L>[] = [
    { key: 'itemGroup', header: 'Item group', optional: true, cell: (l) => {
      if (!l.itemId) return null;
      // Resolve from the (variant-merged) item: a variant's own itemGroupId is blank — the group lives on the parent.
      const groupId = itemOf(l)?.itemGroupId || l.itemGroupId;
      return <Text variant="small">{groupId ? itemGroupName(groupId) : '—'}</Text>;
    } },
    {
      key: 'plannedQty', header: 'Planned qty', align: 'end',
      cell: (l) => {
        if (!l.itemId) return null;
        if (locked) return <span className="text-sm tabular-nums">{l.plannedQty}</span>;
        return <TextField aria-label="Planned quantity" type="number" min={0} className="w-24 [&_input]:text-right" value={String(l.plannedQty)} onChange={(e) => patch(l.id, { plannedQty: num(e.currentTarget.value) } as Partial<L>)} />;
      },
    },
    priceCol<L>({ key: 'unitPrice', header: cur('Unit price'), readOnly: locked, optional: false, get: (l) => l.unitPrice * factor, onChange: (l, v) => patch(l.id, { unitPrice: v } as Partial<L>) }),

    // Cumulative ordered = still on order (committed) + already received (closed POs) — the two are
    // disjoint PO-line buckets, so their sum is the total ever ordered. Keeps Ordered ≥ Received.
    { key: 'cumulativeOrderedQty', header: 'Ordered qty', align: 'end', optional: true, defaultHidden: false, cell: (l) => (l.itemId ? count(l.cumulativeCommittedQty + l.cumulativeQty) : null) },
    { key: 'cumulativeOrderedAmountLC', header: cur('Ordered amt'), align: 'end', optional: true, defaultHidden: true, cell: (l) => (l.itemId ? money(l.cumulativeCommittedAmountLC + l.cumulativeAmountLC) : null) },

    { key: 'cumulativeQty', header: purchase ? 'Received qty' : 'Cumulative qty', align: 'end', optional: true, defaultHidden: false, cell: (l) => (l.itemId ? count(l.cumulativeQty) : null) },
    { key: 'cumulativeAmountLC', header: cur('Cumulative amt'), align: 'end', optional: true, defaultHidden: false, cell: (l) => (l.itemId ? money(l.cumulativeAmountLC) : null) },

    { key: 'openQty', header: 'Open qty', align: 'end', optional: true, defaultHidden: false, cell: (l) => (l.itemId ? count(openQty(l)) : null) },
    { key: 'openAmountLC', header: cur('Open amt'), align: 'end', optional: true, defaultHidden: false, cell: (l) => (l.itemId ? money(openAmountLC(l)) : null) },

    masterCol<L, ShippingType>({ key: 'shippingType', header: 'Shipping type', def: shippingTypeDef, get: (l) => l.shippingType, onChange: (l, v) => patch(l.id, { shippingType: v } as Partial<L>), clearable: true, placeholder: 'None', readOnly: locked }),
    masterCol<L, Project>({ key: 'projectId', header: 'Project', def: projectDef, get: (l) => l.projectId, onChange: (l, v) => patch(l.id, { projectId: v } as Partial<L>), clearable: true, placeholder: 'None', readOnly: locked }),
    textCol<L>({ key: 'freeText', header: 'Free text', readOnly: locked, get: (l) => l.freeText, onChange: (l, v) => patch(l.id, { freeText: v } as Partial<L>) }),

    {
      key: 'uomCode', header: 'UoM', optional: true, defaultHidden: false,
      cell: (l) => {
        if (!l.itemId) return null;
        if (locked) return <Text variant="small">{l.uomCode}</Text>;
        return <Select aria-label="UoM" className="w-28" options={uomOptionsFor(l)} value={l.uomCode} onValueChange={(v) => v && changeUom(l, v)} />;
      },
    },
    { key: 'uomName', header: 'UoM name', optional: true, cell: (l) => (l.itemId ? <Text variant="small">{l.uomName}</Text> : null) },
    { key: 'itemsPerUnit', header: 'Items per unit', align: 'end', optional: true, cell: (l) => (l.itemId ? <span className="text-sm tabular-nums">{l.itemsPerUnit}</span> : null) },
    { key: 'uomGroup', header: 'UoM group', optional: true, cell: (l) => (l.itemId ? <Text variant="small">{uomGroupNameOf(l)}</Text> : null) },

    {
      key: 'portionOfReturns', header: 'Portion of returns %', align: 'end', optional: true,
      cell: (l) => {
        if (!l.itemId) return null;
        if (locked) return <span className="text-sm tabular-nums">{l.portionOfReturns}%</span>;
        return <TextField aria-label="Portion of returns %" type="number" min={0} max={100} className="w-24 [&_input]:text-right" value={String(l.portionOfReturns)} onChange={(e) => patch(l.id, { portionOfReturns: num(e.currentTarget.value) } as Partial<L>)} />;
      },
    },
    {
      key: 'endOfWarranty', header: 'End of warranty', optional: true,
      cell: (l) => {
        if (!l.itemId) return null;
        if (locked) return <Text variant="small">{l.endOfWarranty ? formatDate(l.endOfWarranty) : '—'}</Text>;
        return <DatePicker aria-label="End of warranty" className="w-36" value={l.endOfWarranty || null} onValueChange={(v) => patch(l.id, { endOfWarranty: v ?? '' } as Partial<L>)} />;
      },
    },
    { key: 'rowStatus', header: 'Status', optional: true, defaultHidden: false, cell: (l) => (l.itemId ? <TableStatus intent={l.rowStatus === 'Open' ? 'primary' : 'success'}>{l.rowStatus}</TableStatus> : null) },
  ];

  return (
    <DocLines<L>
      cardHeader
      prefsKey={purchase ? 'pba' : 'ba'}
      icon="list_alt"
      title="Line Items"
      description={`Items committed under this agreement. Unit prices are ${purchase ? 'the agreed purchase cost' : 'net of VAT'} in ${currency}.`}
      columns={columns}
      rows={lines}
      getRowId={(l) => l.id}
      readOnly={locked}
      sortableKeys={[]}
      actions={<CurrencyToggle choices={choices} value={shown} onChange={setView} />}
      item={{
        resolve: (l) => { const it = itemOf(l); return it ? { itemNo: it.itemNo, name: it.name } : null; },
        description: (l) => l.description,
        onDescription: (l, v) => patch(l.id, { description: v } as Partial<L>),
        options: itemOptions,
        onPick: (l, itemId) => patch(l.id, itemPatch(itemId ?? '')),
        fromItem: (itemId) => ({ ...newLine(), ...itemPatch(itemId) }) as L,
        onAdd: (line) => update({ lines: [...lines, line] }),
        onRemoveLine: (l) => update({ lines: lines.filter((x) => x.id !== l.id) }),
      }}
      footer={
        lines.length > 0 ? (
          <div className="flex justify-end gap-6 pb-2 text-sm tabular-nums">
            <span>Planned total: <strong>{shown} {formatAmount(lines.reduce((n, l) => n + lineTotal(l), 0) * factor)}</strong></span>
          </div>
        ) : undefined
      }
      empty={<Text variant="small" tone="muted">{readOnly ? 'No lines.' : 'Add a line to get started.'}</Text>}
    />
  );
}
