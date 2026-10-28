# Multi-vendor RFQ Fan-out + Quote Comparison

## Context

Today the purchasing flow is one-vendor-at-a-time. A Purchase Request (PR) is pre-vendor — its lines carry only an optional *suggested* `lineVendorId` (`src/mocks/purchaseRequests.ts:25`) — and `copyToRfq()` builds exactly **one** RFQ, navigating to a blank new-RFQ form where the buyer picks the single vendor (`src/pages/purchasing/purchase-requests/detail/PurchaseRequestDetail.tsx:250-275`). An RFQ has one header `vendorId`; one RFQ = one vendor. To solicit several vendors you copy the PR to an RFQ repeatedly, by hand, and there is no screen that compares their quotes side by side.

The goal is the realistic procurement loop: **solicit the same need from several vendors, collect their quoted prices and quantities, compare, then award** — possibly splitting one line across vendors.

**Worked example (drove the design).** Order **100** of an item; fan an RFQ out to 3 vendors; they respond **100 / 50 / 75**. No single vendor except the first covers 100, so the buyer must be able to take e.g. 50 from the cheapest + 50 from another. Everything below has to make that case tie out cleanly.

This is a **frontend-only prototype** (no backend, no auth). There is therefore **no real vendor portal** — the buyer still enters each vendor's quote, exactly as the RFQ grid already allows via `quotedQty`, `unitPrice`, `quotedDate` on `RfqLine` (`src/mocks/rfqs.ts:37-46`). We prototype the **buyer-side** multi-vendor workflow only. A true supplier-login portal (external auth, emailed links) is out of scope and intentionally excluded by the prototype.

### Decisions (confirmed)

| Decision | Choice | Why |
|---|---|---|
| **Draw-down** | RFQs **stop consuming** the PR's `openQty`; only the **award (a PO)** draws it down | In the 100/50/75 case, three competing quotes would each subtract 100 and close the PR before anything is ordered |
| **Award model** | Quantity **allocator (split across vendors)**, plus a one-click "award all to this vendor" shortcut | No single vendor covers 100, so splitting must be first-class; single-winner stays easy |
| **Line routing** | Each vendor's RFQ gets only the PR lines whose **item is linked to that vendor** (`item.vendors` + `defaultVendorId`), with a per-line **manual override** in the panel; a vendor with no matching lines is skipped | Don't send an item to a vendor that doesn't carry it (e.g. an iPad linked only to Apple shouldn't go to the two MacBook-only vendors); the override still lets you solicit an off-catalog quote |
| **Candidate vendors** | Header-level `candidateVendorIds: string[]` on the PR | The set of vendors to solicit is a header concept, distinct from per-line *suggested* vendor; flat id array fits conventions |

---

## Feature A — Multi-vendor PR (candidate vendors)

A PR gains a header list of the vendors it intends to solicit.

**`src/mocks/purchaseRequests.ts`**
- Add to `PurchaseRequest` (after `departmentId`, ~line 63):
  `candidateVendorIds: string[]; /** Vendor-role Business Partner ids to solicit quotes from. */`
- Add `candidateVendorIds: []` to `blankPurchaseRequest()` (~line 132).
- Seed candidates on `prq-001` / `prq-002` so the comparison screen has data (e.g. `prq-001 → ['bp-016', 'bp-017']`, matching/extending existing `SEED_RFQS`).

**UI.** A small candidate-vendor picker on the PR detail — a chip list + "Add vendor" `MasterLookup` using `activeOptions(m.vendors, …)`. Simplest home is a new section in `PrDocumentCard.tsx`. `PrDraft` is `Omit<PurchaseRequest,'id'> & {id?}`, so it picks up the field automatically.

**Default from the lines' linked vendors.** Items already carry their suppliers — `defaultVendorId` + `vendors: ItemVendor[]` (`src/mocks/items.ts:141,206`), surfaced by `itemVendorOptions(item, vendors)` (`src/pages/purchasing/shared/purchLineHelpers.tsx:113-119`), which merges `defaultVendorId` with `item.vendors` and drops inactive ones. So an item with 3 linked vendors already knows all 3. The candidate set should **default to the union of every PR line's linked vendors** — compute it as `[...new Set(draft.lines.flatMap(l => itemVendorOptions(itemOf(l), m.vendors).map(o => o.value)))]`. This is a *seed*, not a lock: the buyer can still add or remove candidates before fanning out. Keep `candidateVendorIds` as the stored source of truth (empty = "not yet chosen", so the UI falls back to the computed default); only persist an explicit set once the buyer edits it.

**The PR Contents table stays unified — never sectioned by vendor.** One row per item (one *need*), regardless of how many vendors it's linked to. Do **not** split the Contents grid into per-vendor sections: the PR is pre-vendor, an item linked to several vendors would be duplicated across sections, and the single per-line `openQty` (which must count down 100 → 0) only makes sense on one unified row. The "who it goes to" is shown by the candidate-vendor chips above the table, not by the table layout. Per-vendor sectioning appears **only** downstream — in the fan-out panel (one section per vendor, Feature B) and the Comparison screen (grouped by item, one row per vendor, Feature C).

**Candidate pool vs. routing — two distinct things.** `candidateVendorIds` is the **union** of every line's linked vendors — the full pool you *could* solicit (MacBook + iPad ⇒ Luzon, Techzone, Apple). It is *not* a promise that every vendor gets every line. Who actually receives each line is decided per-vendor at fan-out by `linesForVendor()` (Feature B): the candidate pool answers "who's in play", routing answers "who gets what". So a vendor can be a candidate yet receive only a subset of lines (or, after override leaves it empty, no RFQ at all).

**Convention fit.** Ids-not-names; a flat `string[]` child array (mirrors `attachments` / `references`); empty array for "none" — never a placeholder record. Reuse `itemVendorOptions`; do not re-derive the item→vendor merge.

---

## Feature B — Fan out RFQ to multiple vendors (one click)

**New batch service — `src/services/rfqs.ts` → `addRfqs(inputs: RfqInput[]): Promise<Rfq[]>`**
- List once; compute the series base `max` once; assign `docNum = base+1 … base+N` sequentially. (Looping `addRfq` would re-read a fresh `max` each call and produce **duplicate numbers** — `rfqs.ts:71-80`.)
- Set each `status = input.approved ? 'Open' : 'Not Confirmed'`.
- **Single `rfqs.saveMany(numbered)`** write (CLAUDE.md: never loop awaited saves).
- **Do NOT call `applyRequestDraw`** — this is the mechanism for "RFQs don't draw" (see the draw-down change).

**New shared builder — `src/pages/purchasing/shared/rfqFromPr.ts`**
- `rfqVendorDefaults(v: Partner): Partial<Rfq>` — extract the vendor-header shape currently duplicated in `pickVendor` (`PurchaseQuotationDetail.tsx:181-194`) and the RFQ seed (`rfqs.ts:221-241`): `vendorCode/Name`, `contactId`, currency collapse, `paymentTermId`, `paymentMethod`, `shippingType`, `journalRemark`, `payTo` via `formatAddress`. Have the RFQ detail's `pickVendor` call this too (de-dupes existing code). Tag `@public` until wired so `knip` keeps it.
- `rfqDraftFromPr(pr, vendor, lines, ownerId, today): RfqInput` — mirrors the `copyToRfq()` body (`PurchaseRequestDetail.tsx:253-273`): `blankRfq()` + `rfqVendorDefaults(vendor)` + `basePrId`, `requiredDate`, `freight`, per-line `newRfqLine({ …, baseId, baseLineId, baseDocNo })`, `remarks`. (`baseLineId` stays for lineage display; it is now inert for draw-down.) `lines` is the **routed subset** for this vendor, not all PR lines.
- `linesForVendor(pr, vendorId, m)` — the routing default: the open PR lines whose item is linked to `vendorId`, i.e. `vendorId` appears in `itemVendorOptions(itemOf(l), m.vendors).map(o => o.value)`. Reuses `itemVendorOptions` (`purchLineHelpers.tsx:113`) — don't re-derive the item→vendor merge.

**Routing with override.** Each vendor's RFQ gets `linesForVendor(...)` by default. The fan-out panel shows each vendor's routed line list and lets the buyer **tick/untick** lines (add an off-catalog line, or drop one) before sending — the override is just the final per-vendor line set passed to `rfqDraftFromPr`. A vendor whose final set is empty is **skipped** (no RFQ, surfaced as a hint).

**New panel — `src/pages/purchasing/purchase-requests/detail/FanOutRfqPanel.tsx`** (`[Noun]Panel` convention, SidePanel). Opens with the candidate vendors **pre-checked** — the stored `candidateVendorIds`, or (when empty) the computed default from the lines' linked vendors (see Feature A). Under each ticked vendor, show its **routed line list** from `linesForVendor(...)` with per-line tick/untick (the manual override). So for a MacBook linked to 3 vendors you see all 3 with the MacBook line under each; an iPad linked only to Apple appears under Apple alone. Plus "Add a vendor not yet a candidate" via `activeOptions`, and a Send action that counts the RFQs it will create (skipping empty vendors). Model on `src/pages/purchasing/shared/CopyPanel.tsx` / `partners/detail/EditPanel.tsx`.

**Wire-up — `PurchaseRequestDetail.tsx`** — keep **both** MoreMenu items (gated like the existing copy items, `:284-289`):
- **"Copy to purchase quotation"** — the existing `copyToRfq()`, unchanged: builds **one** RFQ draft and navigates to the new-RFQ form to pick a vendor. The quick single-vendor path.
- **"Send RFQ to vendors…"** — the new fan-out. Opens `FanOutRfqPanel` (`fanOutOpen` state); `onSend(perVendorLines)` builds drafts with `rfqDraftFromPr`, calls `addRfqs` (creates N numbered RFQs in one `saveMany`), then navigates to the Comparison view with an "N RFQs created" notice.

The two coexist: "Copy to…" for a one-off quote, "Send RFQ to vendors…" for soliciting several at once. (Ticking a single vendor in the fan-out panel also works, but the lighter "Copy to…" stays for that quick case.)

---

## Feature C — Quote comparison + split award

**Where.** A new top-level view on the PR detail, alongside Details / Transactions / Activity. Add `{ value: 'comparison', label: 'Comparison' }` to `PAGES` (`PurchaseRequestDetail.tsx:57-62`), gated on `ctx.added` and on ≥1 non-cancelled RFQ with `basePrId === pr.id`. Render its body as a new branch next to the `transactions` / `activity` branches (`:342-349`).

**Layout: one row per vendor, grouped by item.** The PR Contents table stays **one row per item** (one need — adding a MacBook at qty 100 is a single line; it never splits into 3 rows). The *Comparison* table is where vendors expand: for each PR line, render a **group header** (item + need qty) followed by **one row per quoting vendor** — vendor name, their `quotedQty`, `unitPrice`, and an award-qty input. A per-group "allocated N / need M" footer tracks the split. (Chosen over a vendor-as-columns matrix: reads naturally per item and keeps the award input one-per-row.)

```
Comparison — MacBook, need 100
 Item     Vendor     Qty   Price     Award
 MacBook  Luzon      100   ₱62,000   [ 50 ]
 MacBook  Techzone    50   ₱61,500   [ 50 ]
 MacBook  Apple       75   ₱63,000   [  0 ]
                                 allocated 100 / 100 ✓
```

**Data — `src/services/rfqs.ts`**
- `listRfqsForPr(prId)` = RFQs where `basePrId === prId && status !== 'Cancelled'`. Tag `@public` until wired.
- Shape the rows by walking each PR line, then collecting the matching line (by `itemId` / `baseLineId`) from every RFQ for the PR: one comparison row per `{ prLine, rfq, rfqLine }` carrying `vendorName`, `quotedQty`, `unitPrice`. Group rows by `prLine`; skip an RFQ line that hasn't quoted (`quotedQty === 0`), or show it greyed as "awaiting response". Emphasise the lowest `unitPrice` within each group.

**Files**
- `comparison/index.tsx` — re-export (tab-subfolder convention).
- `comparison/ComparisonCard.tsx` — grouped rows + allocator (use `DataTable` with item group headers).

### Awarding — two surfaces, same engine

Both award paths feed one shared builder `poDraftFromRfq(rfq, { lineQtys })` (extracted from `copyToPo()`, `PurchaseQuotationDetail.tsx:231-257`, and reused by the PQ page too):
- Each award PO: header `vendorId` = that vendor, `basePrId = rfq.basePrId` **and** `baseRfqId = rfq.id`; each PO line `quantity = awarded qty`, `baseLineId = rfq line's baseLineId` (the **PR** line id), warehouse/dates prefilled from the PR line (reached via `baseLineId`).
- The PO drawing the PR down is automatic: the PO service already calls `applyRequestDraw`, subtracting `baseLineId` quantities (`purchaseRequests.ts:150-189`). Quantity-based, so partial + repeated awards tie out (100 → 50 → 0).

**Surface 1 — inline allocator (on the Comparison tab).** Per vendor row, an **awarded-qty** input capped by `min(rfqLine.quotedQty, remaining on that PR line)`; a per-group "allocated / need" footer. "Award all to this vendor" fills the line's remaining into that row and zeroes its siblings. One **"Create POs"** button commits everything allocated across all item groups at once, bundled **one PO per vendor** (a vendor that won two items gets one PO with both lines).

**Surface 2 — vendor-first side panel ("Copy to PO").** A `[Noun]Panel` SidePanel: pick **one** vendor → the panel lists that vendor's quoted lines (their linked items) with open / quoted / price and an award-qty input (defaults to quoted, capped the same way) → **Create PO** makes one PO for that vendor. Repeat per vendor for a split. New file `src/pages/purchasing/purchase-requests/detail/AwardPoPanel.tsx`.

**Staged & partial awarding (both surfaces).** You never have to fully allocate the PR first. Any subset of lines, and any partial qty per line, can be awarded now; the rest stays Open on the PR for a later award. A PR line closes when its open qty reaches 0; the PR closes when all lines are closed.

**Remaining-to-award = `line.quantity − Σ(qty on non-cancelled POs referencing this PR line)`** — computed from existing POs (via `baseLineId`), **not** from `openQty` alone, so quantities already on *draft* POs (which haven't drawn `openQty` yet) still count and can't be double-awarded.

**PO creation mode.** One PO → navigate to the new-PO form with the draft (`copyFrom`) so the buyer reviews and saves (the familiar single path; used by the side panel and by a single-vendor inline award). Several POs at once (an inline split) → batch-create them as **Draft** via a new `addPurchaseOrders` (one `saveMany`), with an "N draft POs created" notice; the buyer opens each to finalize and confirm. Draft POs don't draw the PR until confirmed — consistent with `drawnBy` ignoring `Draft` (`purchaseRequests.ts:152`) — and the remaining-to-award rule above keeps the Comparison honest in the meantime.

---

## The draw-down change (the crux)

Make RFQs non-consuming by **removing the `applyRequestDraw` calls from the RFQ save paths** in `src/services/rfqs.ts`: `saveRfqDraft`, `addRfq`, the new `addRfqs`, `closeRfq`, `cancelRfq`, `recallRfq`. RFQ lines keep `baseLineId` for lineage display (DocumentFlow), but nothing reads it for draw-down anymore. POs still call `applyRequestDraw` (unchanged) — so only awards move `openQty`.

**Walkthrough of the worked example.** PR line = 100, `openQty` 100. Fan out to A/B/C → three RFQs, none consuming. Quotes entered: A 100 @ ₱1,050, B 50 @ ₱980, C 75 @ ₱1,010. PR stays Open at 100. Comparison shows the matrix with B lowest. Allocate **50 from B** + **50 from A** → two award POs; `applyRequestDraw` runs 100 → 50 → 0; the PR line closes. Had A been chosen alone, "award all to A" fills 100 in one click → one PO → closes.

**Seed follow-on.** `prq-001` lines are authored `openQty: 0` today because `rfq-001` drew them (`purchaseRequests.ts:217-219`). Under the new model a quote doesn't draw, so re-author those to their full qty (20/20/10) and keep the PR `Open`. `prq-003` stays `openQty: 0` (it has a real PO, `po-045`). This is an **intentional** model change, so `scripts/seed-fingerprint.ts` **will move** for the PR collection — expected, not a regression.

---

## Critical files

| File | Change |
|---|---|
| `src/mocks/purchaseRequests.ts` | `candidateVendorIds` field, blank + seed, re-author `prq-001` `openQty` |
| `src/services/rfqs.ts` | `addRfqs`, `listRfqsForPr`, **drop** `applyRequestDraw` calls |
| `src/services/purchaseRequests.ts` | `applyRequestDraw` unchanged (now PO-only caller) |
| `src/pages/purchasing/purchase-requests/detail/PurchaseRequestDetail.tsx` | fan-out menu + panel, Comparison page branch |
| `src/pages/purchasing/purchase-requests/detail/FanOutRfqPanel.tsx` | **new** — per-vendor fan-out panel |
| `src/pages/purchasing/purchase-requests/detail/AwardPoPanel.tsx` | **new** — vendor-first "Copy to PO" award panel (Surface 2) |
| `src/pages/purchasing/purchase-requests/detail/comparison/{index,ComparisonCard}.tsx` | **new** — Comparison tab + inline allocator (Surface 1) |
| `src/pages/purchasing/shared/rfqFromPr.ts` | **new** (`rfqVendorDefaults`, `rfqDraftFromPr`, `linesForVendor`) |
| `src/pages/purchasing/shared/` + `poDraftFromRfq` | **new**, extracted from `PurchaseQuotationDetail.tsx` |
| `src/services/purchaseOrders.ts` | **new** `addPurchaseOrders` (batch Draft POs for a split award) |
| `src/services/store.ts` | **bump `SEED_VERSION`** (any `src/mocks/` change) |

**Reuse, never redefine:** `activeOptions`, `MasterLookup`, `formatAddress` (`src/mocks/address.ts`), `newRfqLine` / `blankRfq`, `newPoLine` / `blankPurchaseOrder`, `rfqs.saveMany`, `prNumber` / `rfqNumber`.

---

## Verification

1. `npm run typecheck`
2. `npx tsx scripts/check-seeds.ts` — PR `openQty` is not stock/ledger, so tie-out stays green.
3. `npx tsx scripts/seed-fingerprint.ts` before/after via `git worktree` — PR hashes **will** move (intended: `prq-001` `openQty`). Confirm nothing else moves.
4. `npm run knip` — zero (new not-yet-wired exports need a `@public` JSDoc tag).
5. `npm run test:e2e` — the screen sweep catches any raw vendor **id** leaking into the matrix (render names).
6. Manual (`/run` or dev): PR with a qty-100 line + 3 candidates → fan out → enter quotes 100/50/75 → Comparison shows the matrix → allocate 50 (B) + 50 (A) → two POs created, PR line `openQty` 100 → 0, line closes. Then try "award all to A" on a fresh line.
