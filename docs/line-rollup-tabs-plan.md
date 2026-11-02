# Per-line document rollup tabs

## Context

Three line documents already carry a second content tab that rolls up related documents
**per line**, placed between the party card and the lines table:

- **Purchase order** — `Ordered items` | `Goods receipts` (`PoReceiptsTab.tsx`): each PO line expands
  to the goods receipts, A/P invoices and goods returns made against it.
- **Purchase request** — `Requested items` | `Quotations` (`comparison/ComparisonCard.tsx`): each
  request line expands to the vendor quotes gathered for it.
- **Sales order** — `Ordered items` | `Deliveries` (`soDoc.tsx` `soDeliveryDoc`): each order line
  shows how much has been delivered.

The pattern fits any document in the **middle of a chain** that spawns downstream documents per
line. This plan extends it to every document where the data model supports a *per-line* link, and
documents the ones it does not.

The tab (and its table title) is named after the **related document** it rolls up — matching the
convention already applied: first tab = `cap(NOUN.lineLabel)` of the document's own lines, second
(and further) tabs = `cap(NOUN.many)` of the downstream document.

## Feasibility — the per-line linkage test

A rollup needs each downstream line to point back at the parent line via `baseType` + `baseId`
(parent doc) + `baseLineId` (parent line), the same keys `PoReceiptsTab` already filters on. Survey
of candidates:

| Document | Rollup tab(s) | Downstream line link | How matched |
|---|---|---|---|
| **Goods receipt** | A/P invoices · Goods returns | `ApLine`/`ReturnLine` `baseType:'GRPO'`, `baseId`=GR, `baseLineId`=GR line | direct base-line |
| **Delivery** | A/R invoices · Sales returns | `ArLine`/`SrLine` `baseType:'DN'`, `baseId`=DN, `baseLineId`=DN line | direct base-line |
| **Purchase quotation (RFQ)** | Purchase orders | `PO.baseRfqId`=RFQ **+** `PoLine.baseLineId` (or item) | header + line/item |
| **Goods return request** | Goods returns | `GoodsReturn.baseGrrId`=GRR **+** `ReturnLine.grrLineId`=GRR line | header + line |
| **A/P reserve invoice** | Goods receipts | no direct APRI→GR key — but both descend from the same PO line (`baseType:'PO'`) | shared parent (PO line) |
| **A/R reserve invoice** | Deliveries | no direct RI→DN key — but both descend from the same SO line (`baseType:'SO'`) | shared parent (SO line) |
| **Sales quotation** | Sales orders | `SO.baseQuotationId`=QT (header); no `SoLine` line key | header + item |

**No data-model change was needed.** The reserve-invoice fulfilment flow doesn't exist (no "create GR/DN from a reserve invoice"; `receivedQty`/`openQtyForIt` are never updated), so a direct APRI→GR / RI→DN key would never be populated. Instead the rollup matches on the **shared parent line**: an A/P reserve invoice line and the goods-receipt line that fulfils it both copy from the same PO line, so they carry the same `baseId`/`baseLineId`; likewise A/R reserve invoice ↔ delivery via the SO line. The sales quotation rolls up its orders via the existing `SO.baseQuotationId` header plus an item match (its `createSo` now stamps `baseQuotationId`, so runtime conversions appear too — mirroring the seeded converted quotations).

Terminal docs (goods/sales returns, credit memos), aggregate docs (down-payment request/invoice),
landed costs and blanket agreements have no per-line downstream flow and are out of scope.

### Decisions

| Decision | Choice | Why |
|---|---|---|
| **Scope** | All 7: goods receipt, delivery, RFQ, goods return request, both reserve invoices, sales quotation | All have a usable link, direct or via a shared parent |
| **Reserve invoices + quotation** | Match via shared parent / header instead of adding a base key | The fulfilment flow that would set a direct key doesn't exist; shared-parent matching needs no data-model change |
| **Tab count** | 3 tabs where a doc has two downstream types (GR, DN); 2 tabs otherwise | Each downstream document type is its own tab, named after that document |
| **Shared component** | One `LineRollup` in `components/form/` drives every new rollup | The four are the same shape — base line → its downstream doc lines; only the filter differs. `PoReceiptsTab` keeps its bespoke nested tree (returns-under-invoice chain) and is left untouched |
| **Columns** | Item / Document · Date · Quantity · Status | Minimal and uniform; per-line fulfilled/open qty already shows in the item tab's own columns |

## Shared component — `LineRollup`

`src/components/form/LineRollup.tsx`. A read-only `DataTable variant="card"` with expandable rows:
one row per base line, each expanding to the downstream document lines routed to it.

```ts
interface RollupDocRow {
  id: string; no: string; href: string; subcopy?: string;
  date: string; status: string; intent: TableIntent;
  quantity: number; uomCode: string;
}
interface RollupLine { id: string; itemNo: string; description: string; quantity: number; uomCode: string; }

function LineRollup<T extends RollupLine>(props: {
  title: string; icon?: string;
  lines: readonly T[];
  docsFor: (line: T) => RollupDocRow[];   // the per-line filter + mapping
  loading?: boolean;                        // show "Loading…" until downstream lists are in
  empty: ReactNode;
}): JSX.Element
```

Each page loads the downstream collections with `useAsync` (as the PO page does via
`usePoReceiptDocs`), builds `docsFor` with the exact predicate from the table above, and renders
`<LineRollup>` when its tab is active. Downstream documents are counted only when they moved the
quantity — added, not `Draft`/`Cancelled` — reusing the `counts()` rule from `PoReceiptsTab`.

## Per-document plan

Each page: extend `contentTab` to the new values, render the standalone `solid` tab bar between the
party card and the lines table (as already done for PO/PR/SO), and branch the main content.

- **Goods receipt** (`goods-receipts/detail/GoodsReceiptDetail.tsx`) —
  tabs `Received items` | `A/P invoices` | `Goods returns`.
  A/P invoices: `inv.lines where baseType==='GRPO' && baseId===gr.id && baseLineId===line.id`.
  Goods returns: `ret.lines where baseType==='GRPO' && baseId===gr.id && baseLineId===line.id`.
- **Delivery** (`sales/deliveries/detail/DeliveryDetail.tsx`) —
  tabs `Delivered items` | `A/R invoices` | `Sales returns`. Same shape, `baseType:'DN'`.
- **Purchase quotation** (`purchase-quotations/detail/PurchaseQuotationDetail.tsx`) —
  tabs `Quoted items` | `Purchase orders`.
  POs: lines of any PO where `po.baseRfqId===rfq.id && poLine.baseLineId===line.id`.
- **Goods return request** (`goods-return-requests/detail/GoodsReturnRequestDetail.tsx`) —
  tabs `Items to return` | `Goods returns`.
  Returns: lines of any goods return where `ret.baseGrrId===grr.id && returnLine.grrLineId===line.id`.
- **A/P reserve invoice** (`purchasing/reserve-invoices/detail/ApReserveInvoiceDetail.tsx`) —
  tabs `Invoiced items` | `Goods receipts`.
  Receipts: GR lines where `grLine.baseId===apriLine.baseId && grLine.baseLineId===apriLine.baseLineId`
  (both the APRI line and the GR line copy from the same PO line); only when `apriLine.baseId` is set.
- **A/R reserve invoice** (`sales/reserve-invoices/detail/ReserveInvoiceDetail.tsx`) —
  tabs `Invoiced items` | `Deliveries`. Mirror of the APRI, via the shared SO line.
- **Sales quotation** (`sales/quotations/detail/QuotationDetail.tsx`) —
  tabs `Quoted items` | `Sales orders`.
  Orders: SO lines where `so.baseQuotationId===qt.id && soLine.itemId===line.itemId`; `createSo` now
  stamps `baseQuotationId` on the new order.

## Future hardening (optional)

The reserve-invoice and quotation rollups match transitively (shared parent line / header + item),
which is correct for the current flows. If a direct fulfilment flow is ever added — "create a goods
receipt / delivery from a reserve invoice", or stamping `SoLine.baseLineId` on quotation→order — the
rollups can switch to that stricter key with no change to `LineRollup` itself, just the page's
`docsFor` predicate.
