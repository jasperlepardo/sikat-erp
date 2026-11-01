# Net / Gross / Net-and-Gross price mode — extend to all price-entry documents

## Context

Purchase Orders have a **"Price mode"** switch — Net · Gross · Net and Gross — that lets the user enter
line prices VAT-exclusive, VAT-inclusive, or edit either with the other following. It's gated by the
purchasing setting `separateNetGrossPriceMode` and stored on the document as `priceMode`. For a
VAT-inclusive-priced business (retail Apple reseller) entering gross is natural, so the goal is to offer
the same switch on **every document where the user types prices** — not just POs.

**Today (PO only):** `poDoc.tsx` reads `getPurchasingSettings().separateNetGrossPriceMode`, renders a
`role="radiogroup"` header of `PRICE_MODES`, and wires the `grossPrice` column binding
(`purchCols.tsx`) with `showNet`/`showGross` from `draft.priceMode` and an `onChange` that back-computes
net from gross at the **line's own tax rate**. The `priceMode` field lives only on the `PurchaseOrder`
type. The sales column layer (`salesCols.tsx`) already has a `gross` column + `grossTotalLc`, but **no
`showNet`/`showGross` flags and no mode switch** — AR invoice / AR credit memo wire a gross column
unconditionally.

Key fact: `priceMode` is **display/entry only** — the stored `unitPrice` is always net, so totals, the
GL, and tie-outs are unaffected. Backing net out of gross uses the **line's** rate (0 for exempt/zero-
rated), matching the existing correct handling in `poDoc`/`arCmDoc`/`invoiceDoc`.

## Scope — price-entry documents

Add the switch to documents where prices are entered; **skip** Goods Receipt and Delivery (they inherit
posted prices).

- **Sales:** Quotation, Sales Order, AR invoice, AR reserve invoice, AR credit memo.
- **Purchasing:** Purchase Request, Purchase Quotation (RFQ), AP invoice, AP reserve invoice, Debit memo.
- Purchase Order already has it.

## The pattern (applied per document)

1. **Field.** Add `priceMode: PriceMode` to the doc type and default `'Net'` in its `blank*` (e.g.
   `blankQuotation`, `blankApInvoice`, …). Reuse the existing `PriceMode`/`PRICE_MODES` from
   `mocks/purchaseOrders.ts` (or re-home them to a shared mocks module to avoid cross-area imports).
2. **Setting gate.** Purchasing docs reuse `separateNetGrossPriceMode`. Sales has no equivalent — add
   `separateNetGrossPriceMode` to `SalesSettings` (`mocks/salesOrders.ts`) so sales can gate it too.
3. **Column binding.** In each doc's lines builder, pass the gross binding like `poDoc`:
   ```ts
   grossPrice: priceModeOn ? {
     showNet: draft.priceMode !== 'Gross',
     showGross: draft.priceMode !== 'Net',
     get: (l) => round2(grossPrice(l, rate(l))),
     onChange: (l, g) => patch(l.id, { unitPrice: round2(g / (1 + rate(l) / 100)) }), // line's rate
   } : undefined,
   ```
   **Sales infra gap:** add `showNet`/`showGross` to the `gross` binding in `salesCols.tsx` (purchCols
   already has them) so the mode can hide the net or gross column on sales docs too.
4. **Header toggle.** Render the `PRICE_MODES` radiogroup in the lines header when
   `priceModeOn && !readOnly`, exactly as `poDoc` does.
5. **Copy / inheritance.** When a document is created from another (AP invoice from PO/GR, AR invoice
   from SO/delivery, memos from their source), carry over the source's `priceMode`; otherwise default
   `'Net'`.

## Seed impact

- Add `priceMode: 'Net'` to seeded documents of the ~9 affected types (via `blank*` defaults; explicit
  only where a seed should demo Gross/Both, like the existing PO examples).
- **No ledger/total movement** — `priceMode` doesn't change any computed value. `seed-fingerprint`
  should stay put; `check-seeds` stays green.
- Bump `SEED_VERSION` (new field in `src/mocks/`).

## Resolved decisions

1. **Single shared setting** — one flag gates both sales and purchasing (not mirrored per area).
2. **`PriceMode`/`PRICE_MODES` move to `mocks/common.ts`** — a neutral home both areas import.

### Open: where the shared setting lives
There is **no shared settings home** today — settings are per-area collections
(`purchasingSettings`, `salesSettings`, `inventorySettings`), plus a `settings/company` tab backed by a
minimal `Company` record (identity only) and a user `PreferencesPage`. So the single shared flag needs a
home. Options:
- **A — Company record + company settings tab.** Add `separateNetGrossPriceMode` to `Company`
  (`mocks/companies.ts`) and surface it on the existing `settings/company` tab. Lowest new infra; a
  company-wide document-entry preference is a reasonable fit. `getPurchasingSettings()` /sales read it
  from the loaded company. Remove the per-area purchasing flag.
- **B — New general/document settings collection + tab.** `createCollection` + a new Settings tab.
  Cleanest conceptually, most new infra.

**Resolved: Option B** — a separate **Document settings** collection (`mocks/documentSettings.ts` +
`services/documentSettings.ts`, `createCollection`) with `separateNetGrossPriceMode`, surfaced on its own
**Settings › Document settings** tab. Both sales & purchasing read it via `getDocumentSettings()`; the
per-area purchasing flag is removed and `poDoc` switched to the shared getter.

## Status — implemented

- **Foundations:** `PriceMode`/`PRICE_MODES` in `mocks/common.ts`; shared `mocks/documentSettings.ts` +
  `services/documentSettings.ts` (`getDocumentSettings`), **Settings › Document settings** tab (page +
  route + nav), `separateNetGrossPriceMode` default on; purchasing's old per-area flag removed.
- **Field:** optional `priceMode` (defaults `'Net'`) on all 9 doc types + `blank*`.
- **Shared helper** `components/form/priceMode.tsx` — `priceModeEnabled` / `priceModeHeader` /
  `grossPriceBinding` (net↔gross at the line's own rate). `salesCols` gained a combined net/gross
  `unitPrice` column (via a `grossPrice` binding) mirroring `purchCols`.
- **Wired (toggle + gross column):** PO, AP invoice, AP reserve, Debit memo, Purchase Quotation
  (purchasing); Quotation, Sales Order, AR invoice, AR reserve, AR credit memo (sales).
- **Deliberately not wired:** Goods Receipt / Delivery (inherit prices); **Purchase Request** (internal
  estimate — reference prices, tax/gross columns hidden by design); **copy inheritance** of `priceMode`
  (a copied doc defaults to 'Net' — acceptable; left as an optional follow-up).
- `SEED_VERSION` → 117. Fingerprint moved only because seeds carry the new field; **ledger amounts
  unchanged** (revenue/profit identical).

## Verification

- `npm run typecheck` · `npm test` · `npm run lint` · `npm run knip` — all clean.
- `npx tsx scripts/check-seeds.ts` green; `seed-fingerprint` unchanged (priceMode is display-only).
- Manual: on a new Quotation / AR invoice / AP invoice, toggle Net ↔ Gross ↔ Net and Gross; confirm the
  net/gross columns show/hide, editing gross writes back the correct net (VAT at the line's rate, 0 for
  exempt), and the footer total is unchanged by the toggle.
