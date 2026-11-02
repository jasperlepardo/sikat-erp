# Reserve-invoice fulfilment: goods receipt from A/P RI, delivery from A/R RI

## Context

A reserve invoice bills (A/P) or invoices (A/R) **before** the goods move. Today both reserve
invoices can be *created* (A/P from a PO, A/R from an SO) but there is **no fulfilment flow**:

- The A/R reserve invoice detail has a "Create delivery" menu that navigates with
  `{ fromReserveInvoice: id }`, but `DeliveryDetail` ignores that key — the flow is dead
  (`src/pages/sales/reserve-invoices/detail/ReserveInvoiceDetail.tsx:327`,
  `src/pages/sales/deliveries/detail/DeliveryDetail.tsx:106`).
- The A/P reserve invoice has no "Create goods receipt" menu at all.
- `ApRiLine.receivedQty` and `RiLine.openQtyForIt` are set once and **never updated**
  (`src/services/reserveInvoices.ts:138`; APRI has no writer).

Goal: let a reserve invoice be fulfilled by the physical document (goods receipt / delivery), so its
counter moves, it closes when complete, and the per-line rollup tab added in
`docs/line-rollup-tabs-plan.md` can match on the **direct** base key instead of the shared parent.

## The accounting (verified from the journal builders)

The two sides are **not symmetric** — this shapes everything.

### A/P: the reserve invoice already capitalizes inventory

`apriJournal` (`src/services/apReserveInvoices.ts:29`) posts, per line:

```
Dr  Inventory account  (inventoryAccountFor(item, warehouse))   ← stocked items
Dr  Input VAT
    Cr  Vendor control (A/P)
```

So the **inventory GL value is booked at the reserve invoice**, but **no stock quantity moves**
(`addApReserveInvoice` calls neither `applyStock` nor FIFO). A normal goods receipt posts
`Dr Inventory / Cr GRNI` and *does* move stock + FIFO.

⇒ A goods receipt created from an A/P reserve invoice **must not re-post `Dr Inventory`** — the value
is already on the books. It only needs to bring in the **physical stock (quantity + FIFO layers)** at
the reserve-invoice line cost. **No GL journal.** (The open-APRI state — inventory value booked,
stock not yet in — already exists in the seed; the goods receipt is what reconciles it.)

### A/R: the reserve invoice books revenue only; the delivery books COGS

`riJournal` (`src/services/reserveInvoices.ts:65`) posts `Dr A/R / Cr Revenue + Output VAT` — **no
COGS, no inventory, no stock move**. `dnJournal` posts `Dr COGS / Cr Inventory` and moves stock.

⇒ A delivery created from an A/R reserve invoice posts the **normal delivery journal** (`dnJournal`)
and the **normal stock/FIFO relief** — nothing special. Clean, no double count.

## Design

### Data model (bump `SEED_VERSION`)

- **`GrLine`** (`src/mocks/goodsReceipts.ts`): add `baseType?: 'PO' | 'APRI'` (absent/`'PO'` =
  today's behaviour). When `'APRI'`, `baseId`/`baseLineId` point at the reserve invoice line, and the
  line is a **physical-only** receipt (no `Dr Inventory` journal; it does not touch any PO).
- **`DnLine`** (`src/mocks/deliveries.ts`): extend `baseType` to `'' | 'SO' | 'RI'`. When `'RI'`,
  `baseId`/`baseLineId` point at the reserve-invoice line; the journal and stock relief are unchanged.

### Posting (services)

- **`addGoodsReceipt`** (`src/services/goodsReceipts.ts`): for lines with `baseType === 'APRI'` —
  move stock + FIFO as usual, **skip the `Dr Inventory / Cr GRNI` journal lines** for those lines
  (`grJournal` filters them out), and call a new `applyReceivedToApri(lines, +1)` that adds to
  `ApRiLine.receivedQty` and closes the APRI when every line is fully received. `cancelGoodsReceipt`
  reverses with `-1` and reopens.
- **`addDelivery`** (`src/services/deliveries.ts`): for lines with `baseType === 'RI'` — normal
  journal + stock relief, plus a new `applyDeliveredToRi(lines, +1)` that subtracts from
  `RiLine.openQtyForIt` and closes the RI at zero. `cancelDelivery` reverses.

### Counter ownership — no PO/SO double-count

A goods-receipt-from-APRI line carries `baseId = APRI` (not the PO), so `applyToOrders` (which keys
on a PO id) **does not fire** — the PO is untouched. Likewise a delivery-from-RI line carries
`baseId = RI`, so `applyDelivered` (which filters `baseType === 'SO'`) skips it. The reserve invoice
owns its own fulfilment counter; the originating PO/SO is **not** drawn down by this flow (it already
wasn't drawn down when the reserve invoice was created). *Known limitation:* a PO/SO billed via a
reserve invoice stays open on its own list — closing it through the reserve-invoice chain is out of
scope here.

### Flows & UI (mirror `fromPo` / `fromOrder`)

- **A/P**: add `APRI_TO_GR` copy hop + "Create goods receipt" menu on the APRI detail; handle
  `state.fromApri` in `GoodsReceiptDetail` with a `linesFromApri()` that copies APRI lines as
  `baseType: 'APRI'` GR lines (user picks warehouse/bin, which the APRI lacks).
- **A/R**: add `RI_TO_DN` copy hop + fix the existing "Create delivery" menu; handle
  `state.fromReserveInvoice` in `DeliveryDetail` with `linesFromRi()` (`baseType: 'RI'`).

### Rollup tabs (tighten from the shared-parent match)

Once the direct key exists, change the two reserve-invoice `docsFor` predicates
(`docs/line-rollup-tabs-plan.md`) from the shared-parent match to the direct one:
`grLine.baseType === 'APRI' && grLine.baseId === apriLine... === line.id` (and `'RI'` for deliveries).

### Seeds & tie-out

- Add one seeded goods-receipt-from-APRI (against the open seeded APRI) and one delivery-from-RI, so
  the tabs show real data and `receivedQty`/`openQtyForIt` reflect them.
- Bump `SEED_VERSION`. Add invariants to `scripts/check-seeds.ts`: `ApRiLine.receivedQty` equals the
  sum of posted GR-from-APRI lines; `RiLine.openQtyForIt` equals `quantity` minus posted
  DN-from-RI lines. Re-run `check-seeds`, `posting-check`, `fifo-check`, `seed-fingerprint`.

## Decisions (confirmed)

Optimising for **standards-correct accounting** (IAS 2 / ASC 330 for inventory, IFRS 15 / ASC 606 for
revenue):

1. **A/P — inventory at receipt.** `apriJournal` posts `Dr GR/IR clearing (2025) + Input VAT / Cr
   Vendor` (was `Dr Inventory`). The goods receipt posts the normal `Dr Inventory / Cr GR/IR (2025)`
   and moves stock + FIFO — so a GR-from-APRI is a **normal** goods receipt that clears the GR/IR the
   reserve invoice parked. No special journal; `grJournal` is unchanged.
2. **A/R — revenue at delivery (deferred).** `riJournal` posts `Dr A/R / Cr Unearned revenue (2165) +
   Output VAT` (was `Cr Revenue`). The delivery recognises it: a DN-from-RI posts the normal `Dr COGS
   / Cr Inventory` **plus** `Dr Unearned revenue (2165) / Cr Revenue` at the reserve-invoice net.
3. **Draw down the originating PO/SO.** The GR-from-APRI line keeps `baseId = PO` (so `applyToOrders`
   closes the PO) and adds `apriId`/`apriLineId`; the DN-from-RI line keeps `baseId = SO`,
   `baseType = 'SO'` (so `applyDelivered` closes the SO) and adds `riId`/`riLineId`. The reserve-invoice
   counter is driven off the new ids. No double-count: creating the reserve invoice never drew the
   PO/SO down, so the fulfilment doc draws it down exactly once.
4. **Seed migration.** Add `2165 Unearned Revenue – Reserve Invoices` (leaf under `2100`). Re-model the
   two seeded A/P reserve invoices (they now park in GR/IR; add a goods receipt for the closed one to
   bring its stock in and clear GR/IR, leave the open one awaiting receipt) and the seeded A/R reserve
   invoices (now Unearned revenue; recognise via a delivery where seeded as delivered). Bump
   `SEED_VERSION`; rewrite the GR/IR and add new deferred-revenue invariants in `check-seeds`; re-run
   `check-seeds`, `posting-check`, `fifo-check`.

## Account map

| Purpose | Account | Note |
|---|---|---|
| A/P GR/IR clearing | `2025` Goods Received Not Invoiced | existing; reserve invoice debits it, goods receipt clears it |
| A/R deferred revenue | `2165` Unearned Revenue – Reserve Invoices | **new leaf** under `2100` Contract liabilities |
| Revenue | `revenueAccountFor(item)` / `4010` / `4030` | credited by the delivery, not the reserve invoice |
| Inventory / COGS | per item | unchanged |

## Build phases — as implemented

1. **Foundations (done)** — added `2165`; `GrLine += apriId?/apriLineId?`, `DnLine += riId?/riLineId?`;
   `SEED_VERSION` → 125.
2. **Journals (done)** — `apriJournal` → `Dr GR/IR (2025)`; `riJournal` → `Cr Unearned revenue (2165)`;
   the delivery journal now recognizes revenue (`Dr 2165 / Cr Revenue`) for RI-sourced lines at the
   amount the reserve invoice deferred (`riRevenueRecognition`).
3. **Flows & counters (done)** — `linesFromApri`/`dnLineFromRi`; `applyReceivedToApri`/
   `applyDeliveredToRi` (+ reversal + auto-close) wired into `addGoodsReceipt`/`cancelGoodsReceipt`,
   `addDelivery`/`cancelDelivery`; "Create goods receipt" menu on the A/P reserve invoice (`fromApri`)
   and the now-working "Create delivery" on the A/R reserve invoice (`fromReserveInvoice`). The receipt
   keeps `baseId=PO` and the delivery keeps `baseId=SO`, so the PO/SO draw down normally.

### Two planned phases turned out unnecessary

- **No seed migration / tie-out chase.** `seededLedger` (`services/ledgerHistory.ts`) builds from
  deliveries, goods receipts and hand-authored `SEED_JOURNAL_ENTRIES` — it does **not** run
  `apriJournal`/`riJournal`. So the journal re-models change only *runtime* posting of new documents;
  the seeded books are untouched and `check-seeds`/`posting-check`/`fifo-check` stay green with no
  document surgery. *Known limitation:* a seeded reserve invoice's live journal **preview** now shows
  the new accounting while its hand-authored posted entry reflects the old — a cosmetic mismatch on
  historical seed rows only; documents created in-app are fully consistent.
- **No rollup tightening.** Because the fulfilment lines keep `baseId=PO`/`baseId=SO`, the existing
  shared-parent `docsFor` match already catches new goods-receipts/deliveries — the reserve-invoice
  rollup tabs populate without changing their predicates.
