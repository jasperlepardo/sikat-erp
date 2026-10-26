# Sales line-items table unification

Every sales document's "Contents" (line-items) grid now renders through the one shared
shell `DocLines` (`src/components/form/docLines/DocLines.tsx`), the same component the
purchasing documents use. This mirrors `docs/purchasing-lines-table-unification.md`.

## The pieces

- **`DocLines`** (`src/components/form/docLines/`) — the shared shell: column-visibility
  prefs (`useColumnPrefs`), `DataTable` wiring, the item cell + inline add-row + ⋯ row
  menu + edit state (when an `item: ItemCellConfig` is supplied), read-only locking, bulk
  checkbox remove (`onRemove`), and `header` / `footer` slots. Generic over
  `DocLineBase = { id, itemId }`. Shared by **purchasing and sales**.
- **`docColumns`** (`src/components/form/docLines/docColumns.tsx`) — generic leaf builders
  (`textCol`, `masterCol`, `priceCol`, `discountCol`, `taxCol`, …) shared by both areas.
- **`salesCols`** (`src/pages/sales/shared/salesCols.tsx`) — the sales column registry:
  `salesCols<T>(bindings)` returns a keyed `Record<string, PrefColumn<T>>`. A document binds
  it with its data/services (`ColBindings<T>`), then `pick`s which columns to show and their
  default visibility. The purchasing analogue is `purchCols`.
- **`salesLineHelpers`** (`src/pages/sales/shared/salesLineHelpers.tsx`) — `lineHelpers()`
  (item lookup, patch, errors, picker options, UoM options) and the `itemConfig()` bridge
  that builds an `ItemCellConfig` from a doc's own `onPick` / `fromItem`.
- **`SalesTotalsFooter`** (`src/pages/sales/shared/TotalsFooter.tsx`) — the shared footer,
  passed into the shell's `footer` slot.

## Per-document descriptors

Each document has a `*Doc` descriptor that returns the shell props, mirroring purchasing's
`poDoc`:

| Document | Descriptor | Wrapper (copy-from state) |
|---|---|---|
| Quotation | `quotations/detail/qtDoc.tsx` | — (wired directly in `QuotationDetail`) |
| Sales Order | `sales-orders/detail/soDoc.tsx` (+ `soDeliveryDoc`) | `SoLinesCard.tsx` |
| Delivery | `deliveries/detail/dnDoc.tsx` | `DnContentsCard.tsx` |
| A/R Invoice + Reserve Invoice | `shared/invoiceDoc.tsx` | `shared/InvoiceContentsCard.tsx` |
| A/R Credit Memo | `returns-and-credits/credit-memos/detail/arCmDoc.tsx` | `ArCmLinesCard.tsx` |
| Sales Return | `returns-and-credits/returns/detail/srDoc.tsx` | `SrLinesCard.tsx` |

Documents with a **Copy-from** flow keep a thin wrapper component (like purchasing's
`GrContents`) that holds the `CopyPanel` open-state + portal and renders
`<DocLines {...xxDoc({ …, onCopyClick })} />`. The copy toolbar button lives in the doc's
`header` slot.

## Two patterns worth noting

- **Service lines (invoices).** An invoice in `docType === 'Service'` has lines with no item
  (a G/L account + amount instead). `invoiceDoc` branches at the top: **item mode** supplies
  an `item` config + item columns; **service mode** supplies no `item` (explicit
  `description` / `glAccount` / `amount` columns + an "Add service line" add-row). The shared
  builders gate on `vis(b, l)` — which the descriptor overrides via `rendered: () => true` so
  tax/total/wtax render for item-less service lines. No shell changes were needed (unlike
  purchasing's A/P invoice, which side-stepped the shell entirely).
- **Sales Order sub-tabs.** The Item/Delivery tabs render in the shell's `header` slot;
  `SoLinesCard` toggles between two descriptors — `soDoc` (editable Item view, with the
  blanket-agreement picker in the item cell via `ItemCellConfig.hint`) and `soDeliveryDoc`
  (read-only Ordered/Delivered view). Selectable-row removal + the "Remove selected" button
  come from the shell's `onRemove`.
