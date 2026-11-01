# Down-Payment EWT — Pro-Rata on Payment with Final True-Up

## Context

A Philippine down-payment invoice (DPI) collects an advance on a purchase — e.g. 30% of a
PHP 154,700 order (net) → `46,410` advance + `5,569.20` VAT = `51,979.20` payable.

Today the system **defers 100% of the expanded withholding tax (EWT)** to the final A/P invoice:

- The DPI withholds nothing. Its footer shows a *note* — "EWT — WC158 (1%): PHP 1,547.00 taken on
  the final invoice." — and its journal posts `Dr Advances to Suppliers 51,979.20 / Cr A/P Control
  51,979.20` (`dpiJournal`, `src/services/apDownPaymentInvoices.ts`).
- The final A/P invoice withholds the **full** EWT on the whole net (`1% × 154,700 = 1,547.00`),
  nets it off the payable, and clears the drawn advance (`netDue` + `apJournal`,
  `src/services/apInvoices.ts`).

**Why this is questionable (for goods).** RR 2-98 §2.57.4 fixes the duty to withhold at the time the
income is **"paid or payable… or accrued/recorded in the books, whichever comes first."** A down
payment *is* a payment, so for a purchase of **goods** the EWT should be withheld on the portion
paid at the down-payment date, not deferred in full. (Full deferral is defensible only when the
advance is a not-yet-income deposit — a stronger argument for services/construction mobilization.)

The VAT split and the EWT base are already correct and tie out; **only the EWT *timing* changes**.

---

## Proposed behavior — pro-rata, then true-up

### 1. DPI withholds on the down-payment share

The DPI's EWT base is the **billed share** of each line's net, not the full net:

```
base(ATC)  = Σ_lines  lineNet × (1 − discountPct/100) × dpmPct/100
DPI EWT    = Σ_ATC  rate × base
```

dpi-001: `1% × (154,700 × 30%) = 1% × 46,410 = 464.10`.

- Footer: EWT becomes a **deducted line** (red, like the A/P invoice), not a note.
- Net paid to vendor on the DPI: `51,979.20 − 464.10 = 51,515.10`.

### 2. DPI journal records the withholding payable

Mirror `apJournal`'s pattern (withholding credited, control takes the rest):

```
Dr Advances to Suppliers (1150)     51,979.20     (the gross advance, incl. VAT — unchanged)
   Cr EWT Payable (2340 / per-ATC)                   464.10
   Cr A/P Control (2010)                          51,515.10
```

The advance *asset* is unchanged; the EWT is remitted on the vendor's behalf, so their payable is
reduced by `464.10` and that amount moves to the withholding-payable liability.

### 3. Final A/P invoice trues up

The A/P invoice withholds on the **full** net **minus** what the drawn DPIs already withheld,
matched per ATC:

```
AP EWT(ATC) = fullEWT(ATC) − Σ_drawn DPIs  dpiEWT(ATC) × (amountDrawn / dpiTotal)
```

dpi-001 fully drawn: `1,547.00 − 464.10 = 1,082.90`.

- `netDue` and `apJournal` use the trued-up figure; total EWT across DPI + final invoice stays
  `1,547.00`, so nothing is withheld twice and nothing is missed.
- **Proration rule for partial draws:** reduce by the DPI's EWT in proportion to the amount drawn
  (`amountDrawn / dpiTotal`). Documented here because it's a judgment call — see Open decisions.

---

## Affected files

| File | Change |
|---|---|
| `src/services/apDownPaymentInvoices.ts` | New `dpiWithholding()` (dpm-share base) + `dpiNetDue()`; `dpiJournal` credits EWT payable; stamp `withholdingSummary` on add. |
| `src/services/withholding.ts` | Parameterize `poWithholding`/`lineWithholdings` base by a `share` factor (default 1) so the DPI can reuse the engine. |
| `src/pages/purchasing/down-payment-invoices/detail/dpiDoc.tsx` | EWT as a deducted `PurchTotalRow`; net-to-vendor; drop the "taken on the final invoice" note. |
| `src/services/apInvoices.ts` | `netDue` + `docWithholding` consumer trues up by drawn-DPI EWT; `apJournal` uses trued-up withholding. |
| `src/pages/purchasing/vendor-invoices/detail/apDoc.tsx` | Show the trued-up EWT (optionally a note: "net of PHP 464.10 withheld on down payment DPI-xxxx"). |
| `src/mocks/apDownPaymentInvoices.ts` | Seeded DPIs gain stamped withholding; any hand-set GL adjusted. |
| `src/services/store.ts` | Bump `SEED_VERSION` 115 → 116. |

---

## Seed / tie-out impact

- EWT **moves** between the DPI and the final invoice; the **year-total EWT is unchanged**, so the
  ledger still balances. `scripts/check-seeds.ts` must stay green.
- `scripts/seed-fingerprint.ts` **will** move (expected — mocks changed). Capture a before/after.
- Run after implementing: `npx tsx scripts/check-seeds.ts`, `npm run typecheck`, the DPI + AP e2e
  flows, and a visual check of dpi-001 / its drawing A/P invoice.

---

## Resolved decisions

1. **Partial draws — track exact per draw.** Each `DownPaymentDraw` carries the EWT **and** input VAT
   it consumes (`ewtLc`, `inputVatLc`), stamped at draw time from the DPI's stamped figures. The final
   invoice trues up by the recorded amounts, not a recomputed proportion — no rounding drift.
2. **A/P invoice note — yes.** "EWT net of PHP x already withheld on down payment DPI-xxxx."
3. **Scope — split input VAT too (BIR-correct).** Invoicing recognizes the VAT (output VAT payable by
   the vendor; creditable input VAT for us, Sec. 110 NIRC / EOPT RA 11976). So the DPI claims input VAT
   on the invoiced share now, and the final invoice trues up VAT symmetrically to the EWT.

## VAT split + true-up mechanics

DPI journal (input VAT broken out, net advance only):

```
Dr Advances to Suppliers (1150)     46,410.00    ← net advance (was 51,979.20)
Dr Input VAT (per tax code glAccount)  5,569.20  ← claimable now
   Cr EWT Payable (2340 / per-ATC)                  464.10
   Cr A/P Control (2010)                         51,515.10
```

Final A/P invoice, drawing the DPI:
- **EWT**: `ctx.withholding` reduced by `Σ draw.ewtLc` before `netDue`/`apJournal`/footer.
- **Input VAT**: `apJournal` books full per-line input VAT, then subtracts `Σ draw.inputVatLc`
  (the VAT already claimed on the advance) from the input-VAT account.
- **Advance cleared**: `draw.amountLc` now clears only the **net** advance (1150 holds net).
- Totals still tie: full EWT and full input VAT are each recognized exactly once across the two docs.

The `drawDownPaymentInvoices` step stamps `ewtLc`/`inputVatLc` on each draw from the DPI's
`withholdingSummary` and its input VAT, scaled by `amountDrawn / dpiTotal` and rounded once.

---

## Status (implemented)

- **DPI recognition** — `dpiWithholding`/`dpiNetDue`/`dpiJournal` split input VAT and withhold EWT on the
  billed share; footer shows EWT as a deducted line; the seeded DPI's payment is net of EWT; the EWT
  auto-remits via the monthly `2340` run. `check-seeds` green, `SEED_VERSION` 116. ✅
- **Final-invoice true-up** — `trueUpWithholding` + `apJournal` (input-VAT reversal, net-advance clear);
  wired into `ledgerHistory` and the A/P invoice detail/journal/footer. Verified by
  `src/services/__tests__/dpiWithholding.test.ts` (DPI recognizes its share; a drawing bill recognizes
  only the remainder; both journals balance; each tax taken once). ✅
- **Live DPI-draw UI** — `DrawPanel` is now generic over a `DrawableAdvance` (each item carries a
  `toDraw(amount)` that stamps the draw); `ApInvoiceDetail` lists both requests and invoices, and a drawn
  DPI stamps its net advance, input VAT, VAT account, and per-ATC EWT (scaled for partial draws). The
  `addApInvoice` over-draw guard uses the DPI's gross `dpiDrawable`. ✅

## Rollout

1. Land `share`-aware withholding + `dpiWithholding`/`dpiNetDue` (pure logic, unit-testable).
2. DPI journal + footer.
3. A/P invoice true-up (netDue, apJournal, footer).
4. Seed stamping + `SEED_VERSION` bump; `check-seeds` green; fingerprint diff reviewed.
