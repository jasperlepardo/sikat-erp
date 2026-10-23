# Tax Automation — Assign to BP & Item, Automate Sales/Purchase Calc

## Context

The Settings → Accounting & Tax screens (tax codes, VAT ATCs, percentage tax, withholding, withholding groups) define the full BIR tax catalog. Items and partners already carry the fields that connect to it, and a complete determination engine (`src/services/taxDetermination.ts`) already proposes a tax code when lines are added to Sales Orders, Quotations, POs, AP invoices, and AR invoices.

The work is **not** to build tax automation from scratch — it's to (a) make the engine **consistent, override-aware, and persisted** across every document, and (b) **officialize the tax model** in the settings pages so each tax's data has a clear home. Today auto-determination is inconsistent (missing on some docs, clobbers manual edits), withholding is never stored, and the data model has implicit/overloaded classifications.

This plan reflects the finalized data-model design below. The guiding split: **the settings pages own the *data* (groups, codes, ATCs, company status); `taxDetermination.ts` owns the *algorithm* (precedence, validity, thresholds, rates) and stays in code — not user-editable.**

---

## Tax model — three taxes, three drivers (foundations)

Every document line resolves on **two independent axes**: exactly **one transaction code** (VAT *or* percentage tax) + **zero-or-more withholding ATCs**. They post to different accounts and reduce different things, so they never compete for one slot.

The three taxes classify along **different** axes — so each gets its **own** classifier:

| Tax | What varies | Driven by | Lives on |
|---|---|---|---|
| **VAT** | *whether/how* it applies (12% / 0% / exempt) — rate is flat 12% | item VAT treatment + party status, gated by company VAT-registration | **item** VAT group (per direction) |
| **Percentage tax** | the **rate** (3% / 2% / 10% / 30%…) | the company's **industry** (business nature) | **Company Tax Profile** |
| **Withholding** | the **ATC/rate** (1% / 2% / 5% / 10%…) | **income type** (goods/services/rent/professional) × payee tier | **item** withholding group + **partner** |

Consequences:
- **Goods vs service is a *withholding* concept** — it lives once on the withholding group. For VAT the rate is 12% either way (goods/service matters only for the *ATC/return-line*, via the VAT group); PTax is industry, not goods/service.
- **PTax has no item group** — it rides the VAT group's "Vatable" slot: a Vatable item becomes percentage-taxed at the company's industry rate when the company is non-VAT.
- **Company type is one record** (Company Tax Profile), never copied onto items/groups.

### The three-leg assignment

```
ITEM
├─ VAT group     salesVatGroup / purchaseVatGroup   (Vatable / Zero-rated / Exempt, per direction)
│                → resolves to a tax code → VAT ATC + G/L + BIR return
└─ WTax group    withholdingGroup                    (Goods / Services / Rent / Professional / Equipment …)
                 → resolves to a withholding ATC (tier from partner)

COMPANY TAX PROFILE (single record)
   vatRegistered · businessNature→PT ATC · topWithholdingAgent · governmentEntity · exportEnterprise

PARTNER (per BP)
   vatRegistered · exemptCert · resident/non-resident · individual/corporate · swornDeclaration · treaty · withholdingOverride
```

### Keep the tax group — scoped to VAT only

The tax group stays (do **not** collapse to an enum). It is the **VAT leg**: the item-facing picker that maps to a tax code carrying the real filing data. Rationale — the code behind it holds **ATC, G/L account, BIR return form, dated rate history** an enum can't; it's the SAP-B1 / BIR mental model; and it's already wired through `MasterDef` / `MasterLookup` / settings.

- **Keep the goods / services / capital VAT-group variants** (`P-VAT12` / `P-VAT12S` / `P-VAT12C`). They are **not** redundant: each resolves to a tax code with a **distinct VAT ATC and 2550Q/SLSP line**. (Rate is identical 12%; the *classification* differs.)
- The group never carries goods/service-for-withholding (that's the withholding group) or company status (that's the profile).

### ATCs — every tax files under an ATC; the CODE owns it

Each tax has its own ATC catalog, and the **tax code (or withholding record) is the filing unit that stores the ATC**. The group only *selects* the code.

| Tax | ATC catalog (settings) | ATC stored on | Files on |
|---|---|---|---|
| VAT | `SEED_VAT_ATCS` → VatAtcsTab | `TaxCode.atc` (+ `birReturn`, `glAccount`) | 2550Q + SLSP |
| PTax | `SEED_PERCENTAGE_ATCS` → PercentageTaxTab | `TaxCode.atc` | 2551Q |
| WTax | `SEED_WITHHOLDING` → Withholding tab | withholding record | 1601-EQ/FQ · 2307 · 1600-VT/PT |

Rules:
- **The VAT ATC is driven by the resolved tax code, not the group or item.** Flow: `VAT group → tax code → atc → return line`. **One tax code per distinct ATC / return-line treatment.**
- **On posting, stamp the resolved ATC (+ return form) onto the document** (snapshot) for the return/SLSP — per CLAUDE.md "snapshots on posted documents". Never store an ATC on the item or group.
- **Industry / line-of-business VAT ATCs are OUTPUT-side only.** `VM040` (Manufacturing – Tobacco) classifies a tobacco manufacturer's **sales** → tag it on a *sales* code/group. **Input VAT stays generic** — classified by purchase nature (goods/services/capital/importation), never by the supplier's industry. So you tag `S-VAT12-TOB` on sales, but purchases stay `P-VAT12`.

### Worked tagging example — tobacco manufacturer

```
Catalog (VatAtcsTab, reference):  VM040 · Manufacturing · Tobacco · "VAT on manufacturing – Tobacco" · 12%
Tax code (TaxCodesTab):           OVAT-TOB · Sales · atc "VM040" · 12% · 2550Q · G/L Output VAT
VAT group:                        S-VAT12-TOB · Sales · taxCode OVAT-TOB
Item (tobacco products):          salesVatGroup = S-VAT12-TOB   (purchaseVatGroup = P-VAT12, generic input)

Sale → S-VAT12-TOB → OVAT-TOB → VM040 → 2550Q output line
```

### Withholding classification — where the income type comes from

The withholding ATC needs **income type** (rent/professional/goods) and **tier** (individual/corporate, low/high).

- **Income type** = the withholding group, resolved in precedence order:
  1. line has an **item** → `item.withholdingGroup`
  2. else **G/L account default** → `account.defaultWithholdingGroup` (e.g. "Rent expense" → `WH-RENT`) — classifies account-only expense lines
  3. **vendor override** → `partner.withholdingOverrideId` (explicit exception for single-type vendors — a landlord, a law firm)
  4. none → no withholding (flag for review)
- **Tier** = from the partner (payee type, sworn declaration, treaty) + company (government / top-WA).

---

## Reused building blocks (do not reinvent)

- `determineTax(direction, item, partner, data, date): Determination` and `determineWithholding(item, partner, data, date)` — `src/services/taxDetermination.ts:117`.
- Per-doc `proposedTaxCode(item, partner, m, date) => string` and `lineFromItem(...)` in each `detail/types.ts` (SO `:80`, PO `:160`; GR/AP reuse PO's).
- `poWithholding(po, vendor, items, tax, date)` with `deducted` + `REVERSE_CHARGE_ATCS` — `src/services/purchaseOrders.ts:133`.
- `arWithholding(...)` fixed-rate — `src/services/arInvoices.ts:68` (the thing being replaced).
- `vatNotPaidToVendor()` powering `ctx.isReverseCharge` — `src/mocks/taxes.ts:66`.
- `mergedItems()` — variant tax fields live on the parent; every item lookup feeding determination MUST go through it.

## Phase 1 — Line model: override flag + persisted withholding

Add one optional field to the editable line interfaces (optional `?` ⇒ no seed-literal edits, `check-seeds` stays valid):

```ts
/** User edited the tax code by hand: auto-recalc leaves this line alone. Missing = false. */
taxOverridden?: boolean;
```

Because `ApLine`/`ArLine`/`ReturnLine`/`MemoLine`/`ArCmLine` are `Omit<>`-derived from `GrLine`/`DnLine`, add the field explicitly only to **`SoLine`, `QuoteLine`, `PoLine`, `GrLine`, `DnLine`** — verify the `Omit<>` chains don't exclude it.

Persisted withholding (purchase side only — propagates via `Omit<>`):

```ts
// on PoLine / GrLine
lineWithholding?: { atc: string; rate: number; kind: WithholdingKind; base: number; amount: number }[];
// on ApInvoice (doc-level summary, mirrors existing optional drawnDownPayments?)
withholdingSummary?: { atc: string; description: string; rate: number; kind: WithholdingKind;
                       base: number; amount: number; account: string; deducted: boolean }[];
```

`base` + `amount` + `atc` + `rate` are exactly a BIR 2307 line. Then **bump `SEED_VERSION`** in `src/services/store.ts` and run `npx tsx scripts/check-seeds.ts` (must exit 0).

## Phase 2 — Reusable recalc helper (respect overrides)

Create **`src/services/taxRecalc.ts`** (pure, no `pages/` imports):

```ts
interface RecalcableLine { id: string; itemId: string; taxCode: string; taxOverridden?: boolean; baseId?: string; baseType?: string; }

// Re-propose tax code on every line EXCEPT user-edited (taxOverridden) or base-copied (baseId/baseType).
export function recalcLineTaxes<L extends RecalcableLine>(lines: readonly L[], propose: (itemId: string) => string): L[]

// Patch for a manual tax-code edit: store code AND mark overridden so recalc won't clobber it.
export const editTaxCode = (taxCode: string) => ({ taxCode, taxOverridden: true });
```

**Wire two trigger points per doc**, reusing existing handlers:

1. **Partner change** — in `pickCustomer`/`pickVendor`, replace the current `lines.map(...proposedTaxCode...)` (AR/AP) or `lines.filter(l => !l.baseType)` (returns/memos — *stop discarding lines*) with `recalcLineTaxes(draft.lines, itemId => { const it = m.items.find(i => i.id === itemId); return it ? proposedTaxCode(it, partner, m, draft.postingDate) : ''; })`.
2. **Posting-date change** — in each doc's `update` wrapper, when `patch.postingDate !== undefined`, run the same `recalcLineTaxes` with the new date + current partner.

Docs: AP invoice, goods return, debit memo, sales return, AR credit memo, AR invoice (add override guard + date recalc), SO/QT/PO/DN orchestrators. Swap every tax-code `Combobox` `onValueChange` to `patch(l.id, editTaxCode(taxCode ?? ''))`.

**Guards:** gate recalc on editable state only (`status === 'Draft'` / `!ctx.readOnly`); never recompute on a posted doc. Resolve every item through `mergedItems()`. Keep base-copied lines on the source's code.

## Phase 3 — Resolve withholding from Settings; persist on posted docs

Create **`src/services/withholding.ts`** as the single home for withholding resolution/totalling:

- Absorb/re-export `poWithholding` + `REVERSE_CHARGE_ATCS` from `purchaseOrders.ts`.
- `resolveCustomerWithholding(item, customer, data, date)` — AR "customer withholds from us" EWT + 5% gov VAT, resolved via `currentWithholdingRate` / Settings ATCs instead of hardcoded `WC158/WC159/WVO10`.
- The **income-type precedence chain** (item → G/L account default → vendor override → none) from the tax model lives here, so both AR and AP resolve the withholding group the same way, including account-only expense lines.
- Shared `totalWithholding(lines)` reducer.

`arWithholding` delegates to `resolveCustomerWithholding` per `wtaxLiable` line (keep its exported shape + `customerWithholds` gate). **Persist on posted purchase docs:** in `addApInvoice`, stamp `lineWithholding` per line and `withholdingSummary` on the doc (incl. `account` + `base` for 2307). Journals + display cards read the stamped summary when present (posted), else recompute live (draft) — matching the `fixed` pattern in `arJournal` (`arInvoices.ts:109`).

## Phase 4 — Master-data assignment UX

- **Item tabs** (`inventory/items/detail/{sales,purchasing}/index.tsx`): warning hint on the "fixed tax code" lookup when a VAT group is also set; validate dead config (`taxLiable` false + code/group set) and the "needs a VAT group or fixed code" requirement.
- **Partner tax tab** (`partners/detail/tax/index.tsx`): validate that `withholdingOverrideId` resolves to an *active* `WithholdingTax`.
- Confirm item-group tax defaults (`ItemDetail.tsx:262 changeGroup`) copy the VAT groups + withholding group.

## Phase 5 — Officialize the tax model in the settings pages

Finalized per the tax model above. Each item flagged **NEW** vs *surfacing existing data*.

1. **Tax group = the VAT leg (surfacing + clarity).** Treat `TaxGroup` as VAT-only; keep the goods/services/capital variants (distinct ATCs/return lines). Surface `TaxCode.category` + `atc` prominently in `TaxGroupsTab` / `TaxCodesTab`. **No per-item nature field** — goods/service lives on the withholding group. (Replaces the earlier "item nature" proposal.)
2. **Company Tax Profile editor (NEW surface, existing type).** Promote `SEED_COMPANY_TAX` to a persisted single-record collection in `store.ts`; add `CompanyTaxProfileTab.tsx` to `AccountingTaxPage.tsx`: `vatRegistered`, `topWithholdingAgent`, `governmentEntity`, `exportEnterprise`, and **`businessNature → PT ATC`** (reusing `SEED_PERCENTAGE_ATCS`) — the VAT↔PTax switch and the percentage-tax rate selector.
3. **G/L account default withholding group (NEW field).** Add `defaultWithholdingGroup` to the chart-of-accounts record (`src/mocks/chartOfAccounts.ts`) + a `MasterLookup` in its editor, so account-only AP expense lines classify for withholding. Precedence: item → account default → vendor override → none.
4. **VAT ATC on the tax code + stamp on posting (surfacing + NEW stamp).** Drive the VAT ATC off the resolved code (`TaxCode.atc`/`birReturn`, editable in `TaxCodesTab`); **stamp the resolved ATC + return form onto posted documents** for 2550Q/SLSP. Seed industry/output ATCs (e.g. `VM040`) on **sales** codes only; keep input VAT generic.
5. **Withholding-group threshold transparency (NEW fields).** Add `thresholdLabel` + the tier-moving-document note to `WithholdingGroup`; render beside the low/high ATCs in `WithholdingGroupsTab`.
6. **Read-only "Determination rules" explainer (NEW).** A reference tab rendered from the engine's `trace` rule names documenting the precedence, so the rules are auditable in Settings without being user-editable.

**Keep in code (not user-editable):** rule ordering/precedence, validity gating (sworn-declaration-within-year, treaty-cert expiry), threshold numbers and rates (date-effective via `rates[]`).

## Files

**Create:** `src/services/taxRecalc.ts`, `src/services/withholding.ts`, `settings/accounting-tax/CompanyTaxProfileTab.tsx`, `settings/accounting-tax/DeterminationRulesTab.tsx`.

**Modify — mocks (+ `SEED_VERSION` bump):** `store.ts` (persist `CompanyTaxProfile`); `items.ts`, `salesOrders.ts`, `quotations.ts`, `deliveries.ts`, `purchaseOrders.ts`, `goodsReceipts.ts`, `apInvoices.ts` (+ `ApInvoice` summary); `taxes.ts` (`WithholdingGroup.thresholdLabel`; company PT-nature); `chartOfAccounts.ts` (`defaultWithholdingGroup`).

**Modify — services:** `taxDetermination.ts` (account-default withholding, company PT nature, stamp ATC), `arInvoices.ts`, `purchaseOrders.ts`, `apInvoices.ts`.

**Modify — detail pages/cards:** AP invoice, goods return, debit memo, sales return, AR credit memo, AR invoice orchestrators + SO/QT/PO/DN; lines cards `ReturnLines.tsx`, `ApContentsCard.tsx`, `ApJournalCard.tsx`, `ArCmLinesCard.tsx`, `SrLinesCard.tsx`, `poDoc.tsx`, SO/QT/PO/DN/GR/AR contents cards.

**Modify — settings / master UX:** `AccountingTaxPage.tsx`, `TaxGroupsTab.tsx`, `TaxCodesTab.tsx`, `WithholdingGroupsTab.tsx`, item tax tabs, `partners/detail/tax/index.tsx`, chart-of-accounts editor.

## Ordering

1. Phase 1 models + `SEED_VERSION` + `check-seeds` (foundation everything compiles against).
2. Phase 2 `taxRecalc.ts` + `editTaxCode`; wire **AP invoice** end-to-end as the reference, then fan out.
3. Phase 3 `withholding.ts` (incl. the income-type precedence chain), swap `arWithholding`, stamp posted docs, switch journals/cards.
4. Phase 4 master UX.
5. Phase 5 settings — Company Tax Profile editor, G/L-account default withholding, VAT-ATC stamping, threshold labels, rules explainer. Fold any new seed fields into Phase 1's `SEED_VERSION` bump.

## Risks

- Posted-doc snapshots: never recompute tax/withholding on an added/posted doc — gate on draft/editable; double-guard in recalc callers. Stamp the ATC at posting.
- Variant inheritance: a raw-item lookup returns `''` tax group → wrong code. Always `mergedItems()`.
- Base-copied lines must keep the source's tax code — `recalcLineTaxes` skips `baseId`/`baseType`.
- `SEED_VERSION` bump wipes localStorage for existing users (expected; QA data resets).
- Keep new fields optional (`?`) to avoid editing every seed literal and re-running tie-outs.
- Industry VAT ATCs are output-only — don't mirror `VM`-style codes onto purchase/input groups.

## Verification

1. `npm run typecheck` — clean (confirm `Omit<>` chains keep the new fields).
2. `npx tsx scripts/check-seeds.ts` — exits 0.
3. `npm run test:e2e` — `screens.spec.ts` sweep: every route loads, no raw ids / console errors.
4. Manual:
   - AP invoice: add 2 hand lines → change vendor → both re-propose; edit one line's code → change posting date → edited line stays, other re-proposes.
   - Goods return / AR CM / debit memo / sales return: add lines → change partner → lines kept & re-proposed (not discarded).
   - AR invoice: tick `wtaxLiable` for a top-WA customer → change a WT rate in Settings → reload → AR withholding number moves.
   - AP expense line booked to a G/L account with `defaultWithholdingGroup` (no item) → withholding classifies from the account.
   - Post an AP invoice → reopen → on-screen withholding + VAT ATC equal the journal and are stable after later Settings changes (stamped).
   - Tobacco item on `S-VAT12-TOB` → sale files under `VM040`; its purchase stays generic `P-VAT12`.
   - Company Tax Profile: flip `vatRegistered` off → sales switch from VAT to the industry PT rate.
