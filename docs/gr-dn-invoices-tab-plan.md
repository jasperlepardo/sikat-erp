# GR & DN Invoices Tab — Upgrade from LineRollup to Rich Tree

## Context

`GoodsReceiptDetail` and `DeliveryDetail` each have two separate `LineRollup` content tabs:

| Page | Tab 1 | Tab 2 |
|---|---|---|
| GR detail | "A/P invoices" (`contentTab === 'invoices'`) | "Goods returns" (`contentTab === 'returns'`) |
| DN detail | "A/R invoices" (`contentTab === 'invoices'`) | "Sales returns" (`contentTab === 'returns'`) |

`LineRollup` already has the expandable tree (one level deep: line → doc rows). What it's missing compared to `PoReceiptsTab` / `SoDeliveriesTab`:
- Split quantity columns (Received/Shipped · Invoiced · Returned · Open qty) on line rows
- Two levels of nesting for GR (AP invoice rows → return grandchildren)
- A combined view (invoices + returns together instead of separate tabs)

Goal: merge the two tabs into one per page, replace `LineRollup` with a richer component, add the full column set.

---

## Parallel structure

| PO/SO (parent) | GR/DN (child document) |
|---|---|
| Shows downstream receipts/deliveries per line | Shows downstream invoices + returns per line |
| `PoReceiptsTab` / `SoDeliveriesTab` | `GrInvoicesTab` / `DnInvoicesTab` (new) |
| Columns: Ordered · Received/Shipped · Returned · Open qty | Columns: Received/Shipped · Invoiced · Returned · Open qty |
| Line "Open qty" = Ordered − Received/Delivered | Line "Open qty" = Received/Shipped − Invoiced |

The "Open qty" here is the **unbilled** remainder — how much of this receipt/delivery hasn't been invoiced yet.

---

## Feature detail

### New file — `src/pages/purchasing/goods-receipts/detail/GrInvoicesTab.tsx`

**Row types**

```ts
interface DocRow {
  kind: 'invoice' | 'return';
  id: string;
  no: string;
  href: string;
  /** 'A/P invoice' for AP invoices; '' for returns. */
  type: string;
  date: string;
  status: string;
  intent: Intent;
  quantity: number;
  uomCode: string;
  itemsPerUnit: number;
  returns: DocRow[];   // grandchildren — only populated on invoice rows
}

type Row = { kind: 'line'; id: string; line: GrLine; docs: DocRow[] } | DocRow;
```

**`docsFor(grLine: GrLine): DocRow[]`**

1. **AP invoice rows** (`kind: 'invoice'`) — AP invoice lines with `baseType === 'GRPO' && baseId === gr.id && baseLineId === grLine.id`. Each invoice row's `returns` = goods return lines with `baseType === 'APINV' && baseId === ap.id && baseLineId === apLine.id`.

2. **Direct return rows** (`kind: 'return'`) — goods return lines with `baseType === 'GRPO' && baseId === gr.id && baseLineId === grLine.id`. No children.

Sort merged list by `date` ascending.

**`returned(r: Row)`** — `[qty, uomCode]` pair for the Returned column:

- Return row: `[r.quantity, r.uomCode]`.
- Line row: sum of all direct return children + all grandchildren via invoice rows. Cross-UoM conversion via `itemsPerUnit` (same helper as `PoReceiptsTab`).
- Invoice row: `undefined` (column renders `—`).

**Columns**

| Key | Header | Line row | Invoice row | Return row |
|---|---|---|---|---|
| `item` | `Item / Document` | itemNo + description | `<TableContent href subcopy={type}>` | `<TableContent href>` |
| `date` | `Date` | null | `formatDate` | `formatDate` |
| `received` | `Received` | `qty(l.quantity, l.uomCode)` | null | null |
| `invoiced` | `Invoiced` | `l.invoicedQty ? qty(...) : '—'` | `qty(r.quantity, r.uomCode)` | null |
| `returned` | `Returned` | via `returned(r)` | null | `qty(r.quantity, r.uomCode)` |
| `balance` | `Open qty` | `l.quantity − l.invoicedQty > 0 ? qty(...) : '—'` | null | null |
| `status` | `Status` | null (no per-line status on GR) | `<TableStatus>` | `<TableStatus>` |

**Component signature**

```ts
export function GrInvoicesTab({
  gr,
  apInvoices,
  goodsReturns,
}: {
  gr: GrDraft;
  apInvoices: ApInvoice[] | undefined;
  goodsReturns: GoodsReturn[] | undefined;
})
```

Data is already loaded by `GoodsReceiptDetail` — no new hook needed.

---

### New file — `src/pages/sales/deliveries/detail/DnInvoicesTab.tsx`

**Row types** — same structure; `kind: 'invoice' | 'return'`.

**`docsFor(dnLine: DnLine): DocRow[]`**

1. **AR invoice rows** (`kind: 'invoice'`) — AR invoice lines with `baseType === 'DN' && baseId === dn.id && baseLineId === dnLine.id`. No children (SRs base on DN, never on AR invoice: `SrBaseType = 'DN' | ''`).

2. **Sales return rows** (`kind: 'return'`) — SR lines with `baseType === 'DN' && baseId === dn.id && baseLineId === dnLine.id`. No children.

Sort by `date` ascending.

**`returned(r: Row)`** — same shape; line row sums direct SR children only (no grandchildren for DN).

**Columns** — identical to GR but header `received` → `shipped`, `header: 'Shipped'`.

| Key | Header | Line row |
|---|---|---|
| `received` | `Shipped` | `qty(l.quantity, l.uomCode)` |

Everything else the same as `GrInvoicesTab`.

**Component signature**

```ts
export function DnInvoicesTab({
  dn,
  arInvoices,
  salesReturns,
}: {
  dn: DnDraft;
  arInvoices: ArInvoice[] | undefined;
  salesReturns: SalesReturn[] | undefined;
})
```

---

### Modify `GoodsReceiptDetail.tsx`

- Drop `LineRollup` import and its `RollupDocRow` type.
- Change `contentTab` state type: `'item' | 'invoices' | 'returns'` → `'item' | 'invoices'`.
- Remove `rollupLines`, `apDocsFor`, `returnDocsFor` (no longer needed — `GrInvoicesTab` builds its own tree from `apInvoices` + `goodsReturnsList`).
- Tab items: remove `{ value: 'returns', label: cap(RETURN_NOUN.many) }`.
- Replace the two `LineRollup` branches with one `<GrInvoicesTab gr={draft} apInvoices={apInvoices} goodsReturns={goodsReturnsList} />`.
- Add import for `GrInvoicesTab`.

### Modify `DeliveryDetail.tsx`

- Drop `LineRollup` import and its `RollupDocRow` type.
- Change `contentTab` state type: `'item' | 'invoices' | 'returns'` → `'item' | 'invoices'`.
- Remove `rollupLines`, `arDocsFor`, `srDocsFor`.
- Tab items: remove `{ value: 'returns', label: cap(SR_NOUN.many) }`.
- Replace the two `LineRollup` branches with one `<DnInvoicesTab dn={draft} arInvoices={arInvoices} salesReturns={salesReturnsList} />`.
- Add import for `DnInvoicesTab`.

---

## Files changed

| File | Change |
|---|---|
| `goods-receipts/detail/GrInvoicesTab.tsx` | **New** — rich tree: GR line → AP invoice rows → return grandchildren |
| `sales/deliveries/detail/DnInvoicesTab.tsx` | **New** — rich tree: DN line → AR invoice + SR rows |
| `goods-receipts/detail/GoodsReceiptDetail.tsx` | Drop `LineRollup`; merge two tabs into one; wire `GrInvoicesTab` |
| `sales/deliveries/detail/DeliveryDetail.tsx` | Drop `LineRollup`; merge two tabs into one; wire `DnInvoicesTab` |

`LineRollup` itself is NOT deleted — the other 5 `LineRollup` usages (quotation → SOs, RFQ → POs, reserve invoices → deliveries/receipts, goods return request → returns) remain as-is.

---

## Verification

- `npm run typecheck` — zero errors
- `npm run knip` — zero unused exports
- `npm test` — all pass
- Manual: GR detail Invoices tab shows AP invoice rows nested under each GR line with return grandchildren and Received/Invoiced/Returned/Open qty columns; DN detail Invoices tab shows AR invoice and SR rows under each DN line with Shipped/Invoiced/Returned/Open qty columns
