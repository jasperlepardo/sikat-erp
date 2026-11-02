# SO Deliveries Tab — Full Parity with PO Receipts

## Context

The Sales Order detail page has an item/delivery toggle above the lines card. The **Deliveries** tab currently renders a flat, read-only two-column `DocLines` view (Ordered / Delivered) driven by `soDeliveryDoc` in `soDoc.tsx:173-189`.

The **PO Receipts tab** (`PoReceiptsTab.tsx`) is a `DataTable` with expandable rows: each PO line expands to show the GR and AP invoice documents received against it, each with their goods-return children. Columns: Item/Document · Date · Ordered · Received · Returned · Open qty · Status.

The goal is to bring the SO Deliveries tab to the same level: each SO line expands to show the DN and AR invoice documents shipped against it, each with their sales-return children. The table, column set, and data-loading pattern are a direct mirror.

---

## Parallel structure

| Purchasing (PO) | Sales (SO) |
|---|---|
| `PoReceiptsTab.tsx` | `SoDeliveriesTab.tsx` (new) |
| `usePoReceiptDocs()` | `useSoDeliveryDocs()` |
| `PoReceiptDocs` type | `SoDeliveryDocs` type |
| `listGoodsReceipts` · `listApInvoices` · `listGoodsReturns` | `listDeliveries` · `listArInvoices` · `listSalesReturns` |
| `GR_LIST_PATH` · `AP_LIST_PATH` · `RETURN_LIST_PATH` | `DN_LIST_PATH` · `AR_LIST_PATH` · `SR_LIST_PATH` |
| `GR_STATUS_INTENT` · `AP_STATUS_INTENT` · `RETURN_STATUS_INTENT` | `DN_STATUS_INTENT` · `AR_STATUS_INTENT` · `SR_STATUS_INTENT` |
| `grNumber` · `apNumber` · `returnNumber` | `dnNumber` · `arNumber` · `srNumber` |
| Row kind: `receipt` / `return` | Row kind: `delivery` / `return` |
| "Received" column | "Delivered" column |
| AP invoice `type: 'A/P invoice'` | AR invoice `type: 'A/R invoice'` |

**Key difference — no `via` needed.** In purchasing, a goods return can be copied from an AP invoice that was itself billed from a GR, producing a `via` link. In sales, `SrBaseType = 'DN' | ''` — sales returns always base on a DN directly, never on an AR invoice. The `via?: {...}` field is omitted from `DocRow`.

---

## Feature detail

### New file — `src/pages/sales/sales-orders/detail/SoDeliveriesTab.tsx`

**`SoDeliveryDocs` type and `useSoDeliveryDocs()` hook**

```ts
export type SoDeliveryDocs = {
  deliveries: Awaited<ReturnType<typeof listDeliveries>>;
  arInvoices: Awaited<ReturnType<typeof listArInvoices>>;
  salesReturns: Awaited<ReturnType<typeof listSalesReturns>>;
};

export function useSoDeliveryDocs(): SoDeliveryDocs | undefined {
  const deliveries = useAsync(listDeliveries, []);
  const arInvoices = useAsync(listArInvoices, []);
  const salesReturns = useAsync(listSalesReturns, []);
  return deliveries && arInvoices && salesReturns ? { deliveries, arInvoices, salesReturns } : undefined;
}
```

Called at the top of `SalesOrderDetail` (not inside `useEffect`) so the data lands before the tab renders — same reason as PO: if expand-toggle data arrives after rows, the column appears late and shifts the table.

**`DocRow` interface**

```ts
interface DocRow {
  kind: 'delivery' | 'return';
  id: string;
  /** 'A/R invoice' for AR invoices shipped directly from SO; '' for DNs and SRs. */
  type: string;
  no: string;
  href: string;
  date: string;
  status: string;
  intent: Intent;
  /** In the document line's unit. */
  quantity: number;
  uomCode: string;
  itemsPerUnit: number;
  returns: DocRow[];
}
```

No `via` field (see above).

**`Row` union**

```ts
type Row = { kind: 'line'; id: string; line: SoLine; docs: DocRow[] } | DocRow;
```

**`docsFor(soLine: SoLine): DocRow[]`** — builds the child document rows for one SO line:

1. **DN rows** — `deliveries` whose lines have `baseType === 'SO' && baseId === draft.id && baseLineId === soLine.id`. Each DN line's child `returns` = SR lines where `baseType === 'DN' && baseId === dn.id && baseLineId === dn_line.id`.

2. **AR invoice rows** — `arInvoices` whose lines have `baseType === 'SO' && baseId === draft.id && baseLineId === soLine.id && shipsStock(al, items)`. These are AR invoices billed directly from the SO without a DN — they also draw down `deliveredQty` (see `arInvoices.ts:230`). No children (no SR mechanism from AR invoice lines). `type: 'A/R invoice'`.

Sort merged list by `date` ascending (same as PO).

**`returned(r: Row)`** — same shape as PO: returns the `[qty, uomCode]` pair to show in the Returned column.

- On a `return` row: its own `[quantity, uomCode]`.
- On a `line` row: sum of all `doc.returns` using `returnedIn(returns, line.itemsPerUnit)` — cross-UoM safe via the `itemsPerUnit` factor.
- On a `delivery` row: `null` (the column renders `—`).

**Columns** — exact mirror of `PoReceiptsTab`:

| Key | Header | Cell logic |
|---|---|---|
| `item` | `Item / Document` | Line: item no + description. Doc: `<TableContent href>` with `subcopy={type}`. |
| `date` | `Date` | Doc rows only; `formatDate(r.date)`. |
| `ordered` | `Ordered` | Line rows only; `qty(r.line.quantity, r.line.uomCode)`. |
| `delivered` | `Delivered` | Line: `r.line.deliveredQty`; delivery doc: `r.quantity`. Hidden on return rows. |
| `returned` | `Returned` | Line + return rows via `returned(r)`; hidden on delivery rows. |
| `balance` | `Open qty` | Line rows only; `max(0, quantity − deliveredQty)`; `—` when zero. |
| `status` | `Status` | `<TableStatus>` on both line rows (SO line status) and doc rows. |

**`expandToggle`** — same condition as PO: only shown if any row has children (avoids an empty column on new orders).

**Component signature**

```ts
export function SoDeliveriesTab({
  draft,
  docs,
  items,
}: {
  draft: SoDraft;
  docs: SoDeliveryDocs | undefined;
  items: readonly Item[];
})
```

`items` is needed to run the `shipsStock(al, items)` filter on AR invoice lines. It comes from `m.items` in the caller.

**Title** — `cap(DN_NOUN.many)` (Deliveries), same convention as `PoReceiptsTab` uses `cap(GR_NOUN.many)` (Goods receipts).

---

### Modify `src/pages/sales/sales-orders/detail/SoLinesCard.tsx`

- Accept `docs: SoDeliveryDocs | undefined` and `items: readonly Item[]` alongside existing props.
- When `contentTab === 'delivery'`: render `<SoDeliveriesTab draft={draft} docs={docs} items={items} />` instead of `<DocLines {...soDeliveryDoc(tabProps)} />`.
- Remove the `soDeliveryDoc` import from `soDoc.tsx`.

---

### Modify `src/pages/sales/sales-orders/detail/SalesOrderDetail.tsx`

- Call `const deliveryDocs = useSoDeliveryDocs();` at the top level (alongside `useReject`, `useState`, etc.), not inside `useEffect`.
- Thread `deliveryDocs` and `m.items` into `<SoLinesCard … docs={deliveryDocs} items={m.items} />`.

---

### Modify `src/pages/sales/sales-orders/detail/soDoc.tsx`

- Delete `soDeliveryDoc` (lines 172-189) — it will no longer be called.
- Remove any imports that become unused (`PrefColumn`, `openQty` if not used by `soDoc`).

---

## Files changed

| File | Change |
|---|---|
| `sales-orders/detail/SoDeliveriesTab.tsx` | **New** — `SoDeliveryDocs` type, `useSoDeliveryDocs` hook, `SoDeliveriesTab` component |
| `sales-orders/detail/SoLinesCard.tsx` | Accept `docs` + `items`; switch delivery branch to `<SoDeliveriesTab>` |
| `sales-orders/detail/SalesOrderDetail.tsx` | Call `useSoDeliveryDocs()`; thread `docs` + `items` to `SoLinesCard` |
| `sales-orders/detail/soDoc.tsx` | Delete `soDeliveryDoc` and its now-unused imports |

No mock changes. No `SEED_VERSION` bump. No new paths or status constants (all already exported from `paths.ts`).

---

## Verification

After implementation:
- `npm run typecheck` — zero errors
- `npm run knip` — zero unused exports (the deleted `soDeliveryDoc` must not appear)
- `npm test` — existing unit tests pass (no business logic changed)
- `npm run test:e2e` — screens spec passes (SO detail at `/purchasing/purchase-orders/PO-2026-0119/details` equivalent loads the Deliveries tab without raw ids)
- Manual: open any open SO, switch to Deliveries tab, confirm expandable rows appear for DNs and their SR children, with all six columns rendered correctly
