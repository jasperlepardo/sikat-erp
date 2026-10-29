# Sales Order availability check + stock-transfer sourcing

## Context

When a sales order line is short on stock, the app today looks only at the line's **own** warehouse
and only ever offers to **buy** the shortfall. If the same item is sitting in another warehouse,
nobody notices — the order still reports a pure shortage and the only suggested action is "Create
purchase order". The goal is the realistic fulfilment loop a seller actually faces: on confirming an
under-stocked order, **see what's available across every warehouse, then route to the right action** —
**purchase** the gap, or **move stock in from another warehouse** (an inventory transfer), before the
order ships.

This mirrors SAP Business One. On adding/confirming an SO with insufficient stock, B1 raises an
**Availability Check** (*Continue · Change to Available Qty · Display Quantities per warehouse · Change
Warehouse · Purchase · Advanced/ATP*), and its MRP / Procurement Confirmation wizards net demand
against supply and recommend **Purchase Orders** *and* **Inventory Transfer Requests**. We implement
the two actions that fit this prototype — **Purchase** (already built) and **Transfer** (new) — surfaced
through one availability panel.

**Worked example (drives the design).** A Cebu (WH-002) customer orders more of an item than WH-002
holds free, but WH-001 has plenty (mirrors seed transfer `itr-002`). Confirming the SO must show that
WH-001 can cover it and offer "Create stock transfer — from WH-001", producing a Transfer Request
WH-001 → WH-002 for the shortfall — not just "Create purchase order".

This is a **frontend-only prototype**. No new stock math is introduced: availability derives entirely
from the existing per-warehouse `inStock` / `committed` already on each item.

### What already works

- `availableIn(item, warehouse, ownCommitted)` (`src/pages/sales/sales-orders/detail/types.ts:128`)
  = `inStock − committed` for **one** warehouse, giving back what this order itself commits there.
- `shortages(draft, m, ownCommitted)` (`types.ts:150`) rolls up open-line demand beyond free stock,
  nets off incoming POs (`ordered`), yields `toOrder` — the suggested purchase qty. **Its own
  warehouse only.**
- `suggestPo(vendorId, rows)` (`SalesOrderDetail.tsx:314`) builds a `PoSuggestion` and navigates to a
  new PO draft; the ⋯ menu shows "Create purchase order — {vendor}" per vendor (`:349`).
- On confirm, `submit` (`:234`) joins shortage text into an inline `Alert` "Check before saving"
  (`:414`) that requires a second click to save anyway.

### What exists to reuse on the transfer side

- `InventoryTransferRequest` — the Open→Closed **planning** doc (`src/mocks/inventoryTransferRequests.ts`):
  one header `fromWarehouse`, per-line `toWarehouse`, no stock effect until a posted transfer draws it
  down. Builders `blankTransferRequest(today, ownerId)` and `newTransferRequestLine(patch)`.
- `TransferRequestDetail` already consumes `location.state.copyFrom: ItrDraft`
  (`.../transfer-requests/detail/TransferRequestDetail.tsx:84,86`) — the same navigation-state pattern
  the PO uses for `suggest`. We just hand it a pre-built draft; **no change there**.
- `TRANSFER_REQUEST_LIST_PATH` / `TRANSFER_REQUEST_NOUN` in `src/pages/inventory/paths.ts` (type-only
  path module — safe to import from a sales page).
- Design system exposes **`SidePanel`** (no Modal/Dialog); `AwardPoPanel` and `CustomerDetailsPanel`
  are the reference patterns for a focused overlay with `PageHeader variant="plain"`.

### Decisions (confirmed)

| Decision | Choice | Why |
|---|---|---|
| **Scope** | Both the availability-check surface **and** the stock-transfer suggestion | User wants the full B1-style check, not just the transfer action |
| **Transfer document** | Create an **Inventory Transfer Request** (Open→Closed, fulfilled later by a posted transfer) | Parallels "Create PO", which also creates a to-be-fulfilled draft; keeps the planning/approval step |
| **"Dialog" primitive** | **`SidePanel`**, not a modal | The design system has no Modal/Dialog; `SidePanel` is the codebase idiom for focused overlays |
| **Stock math** | Reuse `availableIn`; no new computation | Availability is already modelled per warehouse on the item |
| **Draft naming** | **Derived title** from partner/content + source ref (render-time only) | A handed-off draft must be recognisable; generic "Draft transfer request" tells the inventory user nothing |

---

## Feature A — Cross-warehouse awareness in the shortage model

**`src/pages/sales/sales-orders/detail/types.ts`**

- Add `availabilityByWarehouse(item, ownCommitted)` → `{ warehouse, available }[]` for every warehouse
  with `availableIn > 0`, sorted most-available first. Reuses `availableIn` — no new stock math.
- Extend the `Shortage` interface with:
  - `elsewhere: { warehouse: string; available: number }[]` — other warehouses (≠ the line's) holding
    free stock of this item.
  - `transferable: number` = `min(short, sum(elsewhere.available))`.
- Populate both inside `shortages()` where each shortage row is built (`:160`). `toOrder` stays as-is,
  so the existing PO flow is unchanged; the new fields feed the transfer flow and the panel.

**Convention fit.** Ids-not-names (warehouse **codes**); row arrays, not keyed maps; no change to the
existing `available` / `short` / `ordered` / `toOrder` semantics.

---

## Feature B — Availability Check side panel (the "dialog")

**New file: `src/pages/sales/sales-orders/detail/SoAvailabilityPanel.tsx`** (prefix `So`, matching the
folder's card naming).

- `SidePanel` + `PageHeader variant="plain"` titled "Availability check".
- A `DataTable` of shortage rows — columns: **Item · Warehouse (needed in) · Need · Available here ·
  On order · Short**. Each row expands to a per-warehouse breakdown (B1 "Display Quantities"), built
  from `availabilityByWarehouse`, flagging warehouses that can cover the shortfall.
- Actions, mapping to B1 options:
  - **Create purchase order(s)** — per vendor, calls back into the existing `suggestPo`.
  - **Create stock transfer(s)** — per source warehouse, calls `suggestTransfer` (Feature C). Shown
    only for rows with `transferable > 0`.
  - **Change warehouse** — per row, an inline picker of warehouses that have free stock; patches the SO
    line's `warehouse` via `update` (B1 "Change Warehouse"). *Optional/stretch.*
  - **Continue anyway** — re-runs `submit` with an acknowledgement flag so the order saves short.
- Props: `{ short: Shortage[]; byVendor; bySource; m; onPurchase; onTransfer; onChangeWarehouse;
  onContinue; onClose }`.

**Convention fit.** Renders `PageHeader` (lint-enforced), not the DS `PanelHeader`; straight double
quotes; `if/return` over ternaries in render props.

---

## Feature C — Stock-transfer suggestion (mirror of `suggestPo`)

**`src/pages/sales/sales-orders/detail/SalesOrderDetail.tsx`**

- Build `bySource` next to the existing `byVendor` (`:309`): for each shortage, greedily allocate its
  `short` across its `elsewhere` warehouses (most-available first), producing
  `{ sourceWarehouse → { item, destWarehouse, qty }[] }`. One transfer request per source warehouse.
- Add `suggestTransfer(sourceWarehouse, rows)`, mirroring `suggestPo`:
  - Start from `blankTransferRequest(todayISO(), CURRENT_USER_ID)`; set `fromWarehouse = sourceWarehouse`,
    `toWarehouse` = the most common destination, and `ref2`/`remarks` naming the SO
    (`Stock for ${customerName} — ${soNumber}`).
  - Lines via `newTransferRequestLine({ itemId, itemNo, name, description, quantity, openQty: quantity,
    uom: item.inventoryUom, toWarehouse: destWarehouse })`.
  - `navigate(`${TRANSFER_REQUEST_LIST_PATH}/new`, { state: { copyFrom } })` — consumed as-is by
    `TransferRequestDetail`.
- Extend the ⋯ `menu` (`:349`), when `status === 'Open'`: "Create stock transfer — from {warehouse name}"
  per source warehouse (icon `move_up`), beside the existing per-vendor PO items.
- **Wire the panel:** in `submit` (`:246`), when `!effectiveDraft`, shortages exist, and not yet
  acknowledged, **open `SoAvailabilityPanel`** instead of only setting the inline `stock` warning. Keep
  duplicate-ref and credit-limit checks on the inline `Alert` path (they aren't stock issues).
  "Continue anyway" sets the ack flag and re-calls `submit`.

---

## Feature D — Name the Draft

Today a draft has `docNum: 0`; the real number is only assigned from the series on save (numbering is
positional). So every detail page falls back to a generic title — `Draft ${NOUN.one}` (e.g.
`SalesOrderDetail.tsx:362`, `TransferRequestDetail.tsx:203`). A handed-off draft is therefore
indistinguishable from any other.

**Fix: a render-time derived title** — no stored field, no seed change. It matches the project rule
"look up display names at render time", so it's cheap and consistent.

- Add a small helper per doc that returns the draft label, used in the `title` expression where
  `Draft ${NOUN.one}` is today:
  - **Sales order** → `Draft — {customerName}` (falls back to `Draft sales order` when no customer yet).
  - **Purchase order** → `Draft — {vendorName}`.
  - **Transfer request** → `Draft — {fromWarehouse}→{toWarehouse}`.
- **Carry the source reference** on docs spawned by the availability flow so the title/subtitle reads
  e.g. `Draft — WH-001→WH-002 (from SO-410005)`. The transfer request already gets this via `ref2` /
  `remarks` set in `suggestTransfer` (Feature C); surface it in the title too.
- Scope for this doc: apply the derived title to the **transfer request** (the doc this feature
  creates) and the **sales order**. Rolling it out to every document is a trivial repeat of the same
  one-liner and can follow.

**Not doing:** a provisional draft *number* (conflicts with positional numbering, burns the sequence)
or a stored user-typed name (needs a new field → `SEED_VERSION` bump). Either can be added later; the
derived title covers the recognisability need now.

**Convention fit.** Names looked up at render, never stored; ids-not-names unchanged; no mock change,
so no `SEED_VERSION` bump.

---

## Critical files

**Modify**
- `src/pages/sales/sales-orders/detail/types.ts` — `availabilityByWarehouse`, extend `Shortage`, fill
  in `shortages()`.
- `src/pages/sales/sales-orders/detail/SalesOrderDetail.tsx` — `bySource`, `suggestTransfer`, menu
  items, panel wiring, ack flag, derived draft title (Feature D).
- `src/pages/inventory/transfer-requests/detail/TransferRequestDetail.tsx` — derived draft title
  (Feature D); otherwise unchanged (`copyFrom` already consumed).

**Create**
- `src/pages/sales/sales-orders/detail/SoAvailabilityPanel.tsx` — the availability-check side panel.

**Reuse (do not re-implement)**
- `availableIn`, `shortages`, `inventoryQty`, `openQty` (`types.ts` / `services/lineMath.ts`).
- `suggestPo` / `PoSuggestion` navigation-state pattern.
- `blankTransferRequest`, `newTransferRequestLine` (`src/mocks/inventoryTransferRequests.ts`).
- `TransferRequestDetail`'s `copyFrom` consumer — unchanged.
- `SidePanel` + `PageHeader variant="plain"` (per `AwardPoPanel` / `CustomerDetailsPanel`).

No seed/mock change → no `SEED_VERSION` bump required.

---

## Test plan

1. `npm run typecheck`, `npm run lint` (0 errors — PageHeader rule enforced on the new panel),
   `npm run knip` (0 — panel wired in, no stray exports).
2. Manual (`npm run dev`), seed scenario WH-001 stocked / WH-002 short (mirrors `itr-002`):
   - New SO for a Cebu (WH-002) customer; line qty above WH-002 free stock but within WH-001 stock.
   - Confirm → **Availability check** panel opens; expand the row → WH-001 shown as able to cover it.
   - "Create stock transfer — from WH-001" → lands on a new Transfer Request draft whose **title reads
     `Draft — WH-001→WH-002 (from SO-410005)`** (Feature D), with correct item + qty and remarks naming
     the SO. Save → "No stock has moved" notice.
   - Back on the SO: "Create purchase order — {vendor}" still works unchanged; "Continue anyway"
     saves the order short.
   - Item with stock in **no** other warehouse → panel offers Purchase only, no transfer action.
3. `npm run test:e2e` smoke sweep — no raw ids / console errors on the SO and transfer-request routes.
