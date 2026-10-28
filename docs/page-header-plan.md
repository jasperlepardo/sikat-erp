# Page Header — one local `PageHeader`

## Context

Every page's top bar is the design system's `PanelHeader` (`@jasperlepardo/sikat-design-system`, currently ^0.43.0). It is imported directly into about 92 files, with **94 call sites**, and each site configures it by hand. No local wrapper exists. So:

- **Changing the bar itself** (layout, slots, styling) happens in the design-system package and reaches every page on the next version bump.
- **Changing a convention** (icon style, breadcrumb navigation, which variant detail pages use) means editing up to 94 files, and nothing stops them drifting.

### What this plan covers

1. **`PageHeader`:** one wrapper that owns the icon style, breadcrumbs, Back, and the list's "New" button. `actions` is the only button slot.
2. **Naming:** one sentence-case noun per document, from which every label (sidebar, breadcrumb, button, title, caption) is built.
3. **Detail page actions:** a fixed button row (`DetailActions`) whose labels follow the document's state and the user's approval role: Save as draft, Submit for approval, Create {document}, Approve, Reject, Save changes. Also a ⋯ menu per document, with "Create {target}" items.
4. **Approval:** `needsApproval` / `isApprover` helpers, and three new approval types (`ARRI`, `APRI`, `DPI`).
5. **No auto-save** (already done: `useAutoSave` removed on 28 Oct 2026).

### Duplication and drift (as of 28 Oct 2026)

| Pattern | Sites | Notes |
|---|---|---|
| `iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline"` | 88 of 94 | The house icon style, copy-pasted |
| Drifted icon style | 1 | `sales/agreements/detail/BlanketAgreementDetail.tsx` uses `iconIntent="primary"` |
| No icon style at all | 3 | `components/form/MasterLookup.tsx`, `components/filter/PresetPanel.tsx`, `sales/payments-received/detail/IncomingCustomerPanel.tsx` fall back to the DS default (40 px solid primary circle) |
| `onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}` | 35 | Same router glue in every detail page |
| `onBack={() => navigate(LIST_PATH)}` | 35 | Always the breadcrumb parent |
| `type="details" \| "forms" \| "table"` | 49 | **Deprecated** in the DS; replaced by `variant` (`details` → `plain`, `forms`/`table` → `card`) |
| `size="medium"` on header buttons | ~60 | Has no effect: the header applies `size: "large"` to every direct child of `actions` (looking inside fragments) |
| "New" button add-icon size | 47 × `20`, 37 × `16`, 2 × `14`, 2 × `18` | No single size |
| `trailing` | 33 | Only ever `PrevNext` |
| `operations` | 0 | Unused |
| `tabs` on a list page | 2 | `SalesReturnsList.tsx`, `StockCountList.tsx`. Not allowed (see below) |

---

## How headers work today

### List pages

e.g. `src/pages/purchasing/purchase-orders/PurchaseOrderList.tsx`

```tsx
<PanelHeader
  showSearch
  searchLabel="Search purchase orders"
  searchPlaceholder="Search by PO no., vendor, vendor ref. or item"
  searchValue={query}
  onSearchChange={(value) => { setQuery(value); resetPage(); }}
  icon="receipt_long"
  iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline"
  title={presets.menu}            // the saved-views menu (useListPresets)
  actions={<Button intent="primary" …>New</Button>}
/>
```

### Detail pages

e.g. `src/pages/purchasing/purchase-orders/detail/PurchaseOrderDetail.tsx`

```tsx
<PanelHeader
  type="details"
  icon="receipt_long"
  iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline"
  breadcrumbs={[{ label: 'Purchase Orders', href: PO_LIST_PATH }, { label: title }]}
  onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
  onBack={() => navigate(PO_LIST_PATH)}
  trailing={isNew ? undefined : <PrevNext path={PO_LIST_PATH} prevId={prevId} nextId={nextId} />}
  tabs={isNew ? undefined : <Tabs variant="outline" … />}
  status={…}
  actions={…}
/>
```

### Side panels

`SidePanel` editors (e.g. `src/pages/sales/shared/CustomerDetailsPanel.tsx`) use `type="details"` (or `"forms"`), an icon, a title, and Close/Cancel/Save in `actions`.

### Shared pieces that already exist

| Piece | Where | Role |
|---|---|---|
| `PrevNext` | `src/components/form/DetailNav.tsx` | Previous/Next buttons for the `trailing` slot |
| `siblingKeys` / `neighbours` | `src/components/form/DetailNav.tsx` | Work out `prevId` / `nextId` |
| `NotFound` | `src/components/form/DetailNav.tsx` | Header plus "back to list" for a missing record |
| `useHeaderSearchHost()` | `src/components/form/HeaderSearch.tsx` | Returns `headerProps` to spread on the header, so a nested list can claim the search box |
| `TabbedPage` | `src/components/form/TabbedPage.tsx` | Renders its own header for tabbed settings and master pages |
| `MasterList` | `src/components/form/MasterList.tsx` | Renders its own list, detail, and side-panel headers for every `MasterDef` |

---

## The header's slots

The DS bar, left to right:

```
[icon] Title  [status]      [ search ]      [operations] │ [actions]  [trailing]
                                                            ─ tabs (below the bar) ─
```

| Slot | DS behaviour | Our use |
|---|---|---|
| `operations` | Icon-button group with the header size applied, then a divider before `actions` | **Not used.** Dropped from `PageHeader` |
| `actions` | Button group. Each direct child (looking inside fragments) is cloned with `size: "large"` | **The only button slot** |
| `trailing` | After `actions`, rendered as given | **Not used.** `PrevNext` moves into `actions` |
| `tabs` | Below the bar, on its bottom edge | Detail pages only. **Never on a list page** |

**Why `PrevNext` can go in `actions`:** the header's size override only reaches the element it clones, which is the `<PrevNext>` component itself. That component ignores `size`, so its small pill arrows look the same. The visible change is spacing: the arrows sit inside the actions group rather than after it. Check this on one detail page before migrating the rest.

---

## Design — `src/components/form/PageHeader.tsx`

A thin wrapper around the DS `PanelHeader` that owns the house conventions.

```tsx
type PageHeaderProps = Omit<
  PanelHeaderProps,
  | 'type' | 'iconIntent' | 'iconShape' | 'iconSize' | 'iconVariant'
  | 'breadcrumbs' | 'onBreadcrumbNavigate' | 'onBack'
  | 'operations' | 'trailing'
> & {
  /** The list this record belongs to: renders breadcrumbs [cap(noun.many), title] and a Back that opens it. */
  parent?: { noun: Noun; to: string };
  /** Override Back (e.g. MasterList's back()); defaults to navigating to parent.to. */
  onBack?: () => void;
  /** A list page's "New <noun.one>" button, linking to `${to}/new`: the one primary action, in the house style. */
  create?: { noun: Noun; to: string };
};
type Noun = { one: string; many: string };  // from the area's paths.ts, e.g. PO_NOUN

export function PageHeader({ parent, create, title, onBack, actions, ...rest }: PageHeaderProps)
```

- **Icon style is fixed:** `default` / `rounded` / `32` / `outline`. Callers pass only `icon`. The style props are left out of the type, so the style can't drift again.
- **`parent`:** builds `breadcrumbs={[{ label: cap(parent.noun.many), href: parent.to }, { label: title }]}`, wires the router `onBreadcrumbNavigate`, and defaults `onBack` to `navigate(parent.to)`. With `parent`, `title` must be a string (enforced with a discriminated union).
- **`create`:** renders `<Button intent="primary" variant="solid" shape="pill" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${create.to}/new`)}>New {create.noun.one}</Button>` as the action. A list page passes `create` and no `actions`.
- **`actions` is the only button slot:** `operations` and `trailing` are left out of the type. `PrevNext` goes last inside `actions`.
- **No `size` on header buttons:** the header always applies `large`, so the wrapper and callers leave `size` off.
- **`variant` passes through unchanged:** default `card`. Detail pages and side panels pass `variant="plain"`. The deprecated `type` is no longer accepted.
- **Unchanged slots:** `title`, `status`, `tabs` (detail pages only), the search props, and `{...search.headerProps}`.
- **One component, not `ListHeader` / `DetailHeader`:** what differs between them is covered by the optional `parent` and `create` props.

### Conventions (also to be added to CLAUDE.md › Forms and UI)

- Every panel and side-panel header is a `PageHeader`. Never import `PanelHeader` from the design system (lint enforces this).
- **Buttons go in `actions` only.** Don't use `operations` or `trailing`, and don't set `size` on header buttons.
- **List page:**
  - `icon`, `title={presets.menu}`, the search props, and `create={{ noun: PO_NOUN, to: PO_LIST_PATH }}`. The wrapper renders "New purchase order" and links to `${to}/new` (see Naming below).
  - **No tabs.** Two lists that need a switch are two routes (two sidebar entries), or saved views in `presets.menu`.
- **Detail page:**
  - `variant="plain"`, `parent={{ noun: PO_NOUN, to: PO_LIST_PATH }}`, `status`, and `tabs`.
  - `actions={<DetailActions … />}`, which draws Cancel, an optional secondary, the ⋯ menu, the primary and Prev/Next from the document's state (see Detail page header below).
- **Side panel:** `variant="plain"`, `title`, and in `actions` a Close icon, then **Cancel** and **Save changes** (or **Create {one}** when the panel adds a new record).
- **Labels:** every label is built from the document's noun, in sentence case (see Naming).
- **Primary and secondary buttons** follow the state table: Save as draft · Submit for approval · Create {one} · Approve · Reject · Save changes. Never "Add", "Update" or a bare "Save".
- **⋯ menu** order: Create {target} · Pay / Receive payment / Apply credit · Duplicate · Recall · Close · Cancel {one} · Open journal entry. Never "Copy to …", and no "Open vendor" or "Open {base document}" (the partner card and Transactions tab link to them).
- **Approval:** decide with `needsApproval(docType)` / `isApprover(docType)`, never with a per-document flag.
- **No auto-save.** Every change is saved by a button.

---

## Naming — one noun per document

### The problem

Each document's name is typed by hand in up to seven places:
1. the list's "New" button
2. the detail page's new-record title
3. its draft title
4. the breadcrumb parent
5. the sidebar label (`src/app/nav.tsx`)
6. the table caption
7. the `statusViews` name

These copies have drifted. Some buttons say "New request", "New invoice" or "New RFQ" while the page they open says "New goods return request", "New A/P down payment invoice" or "New purchase quotation". The sidebar says "Customer Invoices" where the breadcrumb says "Invoices" and the caption says "A/R invoices". The case is mixed too: Title Case in the sidebar and breadcrumbs, sentence case everywhere else.

### The rule

- **Sentence case everywhere** (sidebar, breadcrumbs, buttons, titles, captions): "Purchase orders", "New purchase order", "A/P down payment invoices". Abbreviations keep their capitals (A/P, A/R, G/L).
- **The full document name, never a short form:** "New goods return request", not "New request".
- **Name each document once,** in its area's `paths.ts` (type-only imports, so any page or the nav can use it):

  ```ts
  // src/pages/purchasing/paths.ts
  export const PO_NOUN = { one: 'purchase order', many: 'purchase orders' } as const;
  ```

- **Every label is derived from it** with one helper, `cap()` (capitalize the first letter):

  | Where | Text |
  |---|---|
  | "New" button (`PageHeader` `create`) | `New ${one}` |
  | Detail page, new record | `New ${one}` |
  | Detail page, unposted draft | `Draft ${one}` |
  | Breadcrumb parent (`PageHeader` `parent`) | `cap(many)` |
  | Sidebar label | `cap(many)` |
  | Table caption | `cap(many)` |
  | `statusViews(…)` name | `cap(many)` |

  The `PageHeader` props therefore take the noun, not a label: `create={{ noun, to }}` and `parent={{ noun, to }}`.

### Agreed names

Decisions: the quotation is a **purchase quotation**; A/R and A/P prefixes go on **both sides**; the agreements are **sales blanket agreement** and **purchase blanket agreement**; sentence case everywhere.

| Area | `one` | `many` | What changes |
|---|---|---|---|
| Sales | quotation | quotations | case only |
| Sales | sales order | sales orders | case only |
| Sales | delivery | deliveries | case only |
| Sales | A/R invoice | A/R invoices | sidebar "Customer Invoices" and breadcrumb "Invoices" |
| Sales | A/R reserve invoice | A/R reserve invoices | button, titles, sidebar, breadcrumb, caption ("reserve invoice") |
| Sales | sales return | sales returns | case only |
| Sales | A/R credit memo | A/R credit memos | button "New credit memo", sidebar "Credit Memos" |
| Sales | incoming payment | incoming payments | breadcrumb "Payments Received", views "payments received" |
| Sales | sales blanket agreement | sales blanket agreements | button "New agreement", sidebar/breadcrumb "Agreements", caption "Blanket agreements" |
| Purchasing | purchase request | purchase requests | button and detail title "New request" |
| Purchasing | purchase quotation | purchase quotations | button "New RFQ" |
| Purchasing | purchase order | purchase orders | case only |
| Purchasing | goods receipt | goods receipts | case only |
| Purchasing | A/P invoice | A/P invoices | case only |
| Purchasing | A/P reserve invoice | A/P reserve invoices | case only |
| Purchasing | A/P down payment request | A/P down payment requests | button, draft title ("down payment request") |
| Purchasing | A/P down payment invoice | A/P down payment invoices | button "New invoice", draft title, caption "A/P Down payment invoices" |
| Purchasing | goods return request | goods return requests | button "New request", detail "New return request", draft "Return request", views "return requests" |
| Purchasing | goods return | goods returns | case only |
| Purchasing | A/P credit memo | A/P credit memos | case only |
| Purchasing | outgoing payment | outgoing payments | breadcrumb "Payments Made", views "payments made" |
| Purchasing | landed cost | landed costs | case only |
| Purchasing | purchase blanket agreement | purchase blanket agreements | button "New agreement", sidebar/breadcrumb "Agreements" |
| Inventory | transfer request | transfer requests | button "New request" |
| Inventory | inventory transfer | inventory transfers | button "New transfer" |
| Inventory | stock count | stock counts | button "New count"; split from postings (no tabs) |
| Inventory | inventory posting | inventory postings | button "New posting"; own sidebar entry |
| Inventory | item | items | case only |
| Accounting | journal entry | journal entries | case only |
| Accounting | journal voucher | journal vouchers | button "New voucher" |
| Accounting | G/L account | G/L accounts | button "New account" |
| People | employee | employees | case only |

Master records keep the `noun` they already carry on `MasterDef` (`New ${noun}` in `MasterList`/`MasterLookup`), and Business partners keep `config.singular`. Both already follow the rule, so only their case needs checking.

### Sidebar (`src/app/nav.tsx`) notes

- **Route ids:** `slug()` lowercases the label, so a case-only change leaves route ids alone. A **renamed** page does change its id: "Customer Invoices" → "A/R invoices", "Credit Memos" → "A/R credit memos", "Agreements" → "Sales/Purchase blanket agreements", "Reserve Invoices" → "A/R reserve invoices". Pin each to its current id with the third tuple element, as the A/P rows already do (e.g. `['A/R invoices', 'receipt', 'sales/customer-invoices']`), so URLs and `router.tsx` don't move.
- **Existing bug:** the purchasing groups in `APP_SECTIONS` find pages by `slug(label)`. Their labels are stale ("Vendor Invoices", "Debit Memos"…). Those still resolve, because they slug to the pinned ids. But **A/P down payment invoices and goods return requests aren't in any group, so they never show in the purchasing sidebar.** Fix by listing route ids in `APP_SECTIONS` instead of labels, and add the two missing pages, while renaming.
- Sidebar labels come from the same `NOUN.many`. `nav.tsx` imports the `paths.ts` files, which are type-only safe.

---

## Detail page header

```
[icon/back] Purchase orders › PO-000123  [Open] [Split]     [Cancel] [Save as draft] [⋯] [Submit for approval] [↑↓]
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 Details · Transactions · Activity
```

### Today (35 detail pages)

| Part | Today |
|---|---|
| Title | `New X` / `Draft X` / number helper. Drift: the stock count says "Inventory counting", goods return requests say "Return request" for drafts, and transfer requests and goods return requests have no draft title |
| Status | The status `Badge` (`*_STATUS_INTENT`), then flag badges (Split, Payment block, Converted, Expired, Parent item). Hidden on new records. Consistent |
| Tabs | Details · (extra) · Transactions · Activity. 21 pages are exactly that; Item adds Inventory, Partner adds Items, the PR adds Comparison, Employee has no Transactions. Hidden on new records. Consistent |
| Cancel | Most pages have it. Missing on landed cost, reserve invoice and quotation; the journal voucher says "Back" |
| Primary button | 26 pages say Add / Save, each choosing with its own flag (`added`, `ctx.added`, `isNew`, `ro`, `posted`). Others: "Update" (both agreements, sales order, open stock count), "Add Landed Cost", "Create Reserve Invoice", "Post voucher", "Add to new voucher" / "Save to voucher" |
| Extra buttons | The quotation has Save + Save as draft + Submit for approval. The stock count has "Copy to inventory posting" |
| Approval | The PO decides with a `draft.approved` flag. `approvalRules` (Settings) holds an `approverId` per `DocType`, and `CURRENT_USER_ID` is in `mocks/common.ts`. Nothing compares the two yet |

### Rules

**Title:** `New ${one}` for a new record, `Draft ${one}` for an unposted draft, otherwise the number helper (`poNumber()`…).

**Status:** the status badge first, then outline flag badges. Nothing on new records.

**Tabs:** documents have exactly Details · Transactions · Activity, hidden on new records. A document's own extra view goes **inside its Contents card** as a switch (`Tabs variant="primary"` at the top of the card): Item | Receipts on a PO, Item | Comparison on a purchase request. Master records may add a page tab between Details and Transactions (Item › Inventory, Partner › Items).

**Actions, left to right:** Cancel · secondary (at most one) · ⋯ menu · primary (exactly one, or none when read-only) · Prev/Next.

- **Cancel:** goes to the list. Shown only while the record can be edited.
- **Secondary:** a white button for the document's main alternative step. Allowed, but at most one.
- **⋯ menu:** everything else, in this order: **Create {target}** (never "Copy to …") · Pay / Receive payment / Apply credit · Duplicate · Recall · Close · Cancel {one} · Open journal entry (only where nothing else links to it). No "Open vendor / customer" or "Open {base document}": the partner card and the Transactions tab already link to them. Save as draft, Submit for approval, Approve and Reject are buttons, never menu items.
- **Primary and secondary labels follow the document's state and approval:**

| State | Who | Secondary | Primary | Busy label |
|---|---|---|---|---|
| New or Draft | Needs approval | Save as draft | **Submit for approval** | Submitting… |
| New or Draft | No approval needed, or I'm the approver | Save as draft | **Create {one}** (e.g. "Create purchase order") | Creating… |
| Not Confirmed (awaiting approval) | I'm the approver | Reject | **Approve** | Approving… |
| Not Confirmed | Submitter or anyone else | — | — (read-only; Recall in ⋯) | — |
| Open (posted, still editable) | Anyone | — | **Save changes** | Saving… |
| Closed / Cancelled | Anyone | — | — (read-only; no Cancel). **Save changes** when remarks can still change (`remarksOnly`) | Saving… |

- **No auto-save.** Every change is saved by pressing a button. A posted document whose remarks or attachments can still change shows **Save changes**. (`useAutoSave` was removed on 28 Oct 2026; its only user was the posted reserve invoice, which now has a Save changes button.)
- **Documents with no draft status** (master records such as item, partner and employee; settings records): no secondary. Primary is **Create {one}** when new and **Save changes** after. Documents with no `DocType` in `approvalRules` (PR, GRR, transfers, landed cost, blanket agreements, journal entry…) never need approval, so they always follow the "Create {one}" row.
- **Never** "Add", "Update", a bare "Save", "Create X" in Title Case, or a custom verb. All of these become the rows above: "Add Landed Cost" → "Create landed cost", "Create Reserve Invoice" → "Create A/R reserve invoice", and "Update" and "Save" → "Save changes".

### Per document

The buttons follow the state table above, the same for every document. **Approval** says whether the document has a rule in Settings › Approvals. The ⋯ menu is for an open record, in the standard order.

**Sales**

| Document | Approval | Create button | ⋯ menu |
|---|---|---|---|
| Quotation | QT | Create quotation | Create sales order · Duplicate · Recall · Close · Cancel quotation |
| Sales order | SO | Create sales order | Create delivery · Create A/R invoice (goods) · Create A/R invoice (services) · Create purchase order · Duplicate · Recall · Close · Cancel sales order |
| Delivery | DN | Create delivery | Create A/R invoice · Create sales return · Recall · Close · Cancel delivery |
| A/R invoice | ARINV | Create A/R invoice | Create A/R credit memo · Receive payment · Recall · Close · Cancel A/R invoice |
| A/R reserve invoice | ARRI (new) | Create A/R reserve invoice | Create delivery · Recall · Close · Cancel A/R reserve invoice |
| Sales return | SR | Create sales return | Create A/R credit memo · Close with replacement delivery · Recall · Cancel sales return |
| A/R credit memo | ARCM | Create A/R credit memo | Apply credit to an invoice · Recall · Cancel A/R credit memo |
| Incoming payment | RC | Create incoming payment | Recall · Cancel — date it today · Cancel — date it {posting date} · Open journal entry |
| Sales blanket agreement | — | Create sales blanket agreement | Create sales order · Duplicate |

**Purchasing**

| Document | Approval | Create button | ⋯ menu |
|---|---|---|---|
| Purchase request | — | Create purchase request | Create purchase quotations… (one per chosen vendor) · Create purchase order · Create purchase order from a quote… · Duplicate · Close |
| Purchase quotation | RFQ | Create purchase quotation | Create purchase order · Duplicate · Recall · Close · Cancel purchase quotation |
| Purchase order | PO | Create purchase order | Create goods receipt · Create A/P invoice · Create A/P reserve invoice · Create A/P down payment request · Create A/P down payment invoice · Duplicate · Recall · Close · Cancel purchase order |
| Goods receipt | GRPO | Create goods receipt | Create A/P invoice · Create goods return · Duplicate · Recall · Close · Cancel goods receipt |
| A/P invoice | APINV | Create A/P invoice | Create goods return · Create A/P credit memo · Pay · Duplicate · Recall · Cancel A/P invoice |
| A/P reserve invoice | APRI (new) | Create A/P reserve invoice | Duplicate · Recall · Cancel A/P reserve invoice |
| A/P down payment request | DPR | Create A/P down payment request | Pay · Recall · Close · Cancel A/P down payment request |
| A/P down payment invoice | DPI (new) | Create A/P down payment invoice | Pay · Recall · Close · Cancel A/P down payment invoice |
| Goods return request | — | Create goods return request | Create goods return · Close |
| Goods return | GRET | Create goods return | Create A/P credit memo · Recall · Cancel goods return |
| A/P credit memo | CM | Create A/P credit memo | Apply credit to an invoice · Recall · Cancel A/P credit memo |
| Outgoing payment | PMT | Create outgoing payment | Recall · Cancel outgoing payment |
| Landed cost | — | Create landed cost | Cancel landed cost |
| Purchase blanket agreement | — | Create purchase blanket agreement | Create purchase order · Duplicate |

**Inventory, accounting and master records**

| Document | Approval | Create button | ⋯ menu |
|---|---|---|---|
| Transfer request | — | Create transfer request | Create inventory transfer · Duplicate · Close |
| Inventory transfer | — | Create inventory transfer | Transfer back · Duplicate |
| Stock count | — | Create stock count | Duplicate as a recount · Recount variances only · Close without posting. **Secondary button:** Create inventory posting |
| Inventory posting | — | Create inventory posting | — |
| Journal entry | — | Create journal entry | Reverse now · Duplicate · Open origin / reversal / reversed entry |
| Journal voucher | — | Post journal voucher (override) | Delete journal voucher |
| Voucher entry | — | Add to new voucher / Save to voucher (override) | Open journal entry · Delete entry |
| Item · Employee | — (no draft) | Create item / Create employee | — |
| Partner | — (no draft) | Create {customer/vendor/…} | Duplicate · Convert to customer · Open in {customers/vendors} |

**What changes from today's menus**
- Every "Copy to …" becomes "Create …", in sentence case. "Create Delivery" (A/R reserve invoice) → "Create delivery", and "Copy to Purchase Order" / "Copy to Sales Order" → "Create purchase order" / "Create sales order".
- Sales order: "Sales Invoice (goods)" / "Official Receipt (services)" → **Create A/R invoice (goods)** / **Create A/R invoice (services)**. "Suggested PO" → Create purchase order.
- "Save as draft", "Submit for approval", "Approve" and "Reject" leave every menu (they're buttons now). That includes inventory transfer and landed cost.
- The purchase quotation's bare "Cancel" → "Cancel purchase quotation". It was ambiguous next to the Cancel button.
- "Close request" / "Close quotation" → "Close".
- Voucher entry: drop "Previous entry" / "Next entry" from the menu. The header's Prev/Next already does this.

### Who needs approval

Each document type has a **Require approval** switch and an **Approver** (Settings › Sales / Purchasing › Approval workflow). `src/services/approval.ts` reads both:

```ts
/** A new document of this type has to be approved by someone else before it opens. */
needsApproval(docType)  // the switch is on, and the approver isn't the current user
/** The current user may approve: the named approver, or anyone when no approver is set. */
isApprover(docType)
```

- **New documents:** pages stamp `approved: !needsApproval('XX')` (this replaced `!getXSettings().requireXApproval`). An approver creating their own document skips approval, so the button says "Create {one}".
- **The button follows the stamp:** `needsApproval={!draft.approved}`. The services are unchanged: posting an unapproved draft sets Not Confirmed, and posting an approved one opens it. The PO's "Approved" checkbox (Delivery card) still overrides the stamp, as before.
- **Awaiting approval:** `docMode(status, { canApprove: isApprover('XX') })` gives the approver Reject + Approve. Anyone else sees it read-only, with Recall in ⋯.
- **New approval types:** `ARRI` (A/R reserve invoice), `APRI` (A/P reserve invoice) and `DPI` (A/P down payment invoice) are added to the end of `DOC_TYPES`, each with its own switch (`requireArReserveInvoiceApproval`, `requireApReserveInvoiceApproval`, `requireDpiApproval`) and a row in the settings tab. Before this they borrowed the A/R invoice, A/P invoice and down payment request switches. `SEED_VERSION` 109 → 110.
- **Seeds:** every switch is off, so out of the box every document shows "Create {one}".

### `DetailActions` — `src/components/form/DetailActions.tsx`

Draws the actions row from the record's **mode**, so pages no longer build buttons by hand:

```tsx
<DetailActions
  noun={PO_NOUN}
  listPath={PO_LIST_PATH}                                    // Cancel goes here
  mode={docMode(draft.status, { canApprove: isApprover('PO') })}  // draft | pending | open | readonly
  needsApproval={!draft.approved}                            // draft: Submit for approval instead of Create
  remarksOnly={ctx.readOnly}                                 // readonly: keep Save changes for remarks
  busy={saving}
  onDraft={() => submit(null, true)}                         // Save as draft (omit: no draft step)
  onSubmit={() => submit(null, false)}                       // Create / Submit for approval / Save changes
  onApprove={() => submit(null, false, { approved: true })}
  onReject={reject.start}
  menu={menu}                                                // ⋯ items
  prevNext={isNew ? undefined : { path: PO_LIST_PATH, prevId, nextId }}
/>
```

- **`docMode(status)`** maps the five standard statuses: Draft → `draft`; Not Confirmed → `pending` for an approver, otherwise `readonly`; Closed / Cancelled → `readonly`; anything else → `open`. Other status sets (payments, agreements, journal entries, counts) map by meaning. Master records use `isNew ? 'draft' : 'open'` with no `onDraft`.
- **`remarksOnly`:** a closed or cancelled document whose remarks and attachments can still change keeps **Save changes** (and no Cancel). Without it, a read-only record has no primary.
- **Sizes:** the header clones each element in `actions` with `size: "large"`. `DetailActions` receives that `size` and passes it to every button and the ⋯ menu, so the row matches the header.
- **Primary:** a plain button when `onSubmit` is given. Omit `onSubmit` to make it the form's submit button.
- Exceptions handled by props, not new buttons:
  - **Journal voucher:** primary "Post voucher" → `primaryLabel="Post journal voucher"`.
  - **Voucher entry:** "Add to new voucher" / "Save to voucher" → the same override.
  - **Stock count:** "Create inventory posting" → its secondary (no draft step).

---

## Migration checklist (mechanical, per file)

1. Import change: remove `PanelHeader` from the DS import and add `import { PageHeader } from '…/components/form/PageHeader'`.
2. Delete the four `icon*` style props.
3. Change `type="details"` → `variant="plain"`. Delete `type="forms"` and `type="table"`.
4. On detail pages, replace `breadcrumbs` + `onBreadcrumbNavigate` + `onBack` with `parent={{ … }}`. Remove `navigate` if nothing else uses it.
5. On detail pages, rename the ⋯ items to match the per-document table, then replace the hand-built `actions` and `trailing={<PrevNext …/>}` with `<DetailActions … />`. Build the new and draft titles from the noun. Move extra buttons into the ⋯ menu, or into the one secondary slot.
5b. Append the `ARRI` / `APRI` / `DPI` approval types (bump `SEED_VERSION`). Add `needsApproval` / `isApprover` to `approvalRules.ts`. Replace the PO's `draft.approved` decision with it, then use it for every document that has a `DocType`.
6. Add the area's `XX_NOUN` to `paths.ts`. On list pages, replace the "New" `actions` button with `create={{ noun, to }}`, and use `cap(noun.many)` for the caption and `statusViews`. On detail pages, build the new and draft titles from `noun.one`.
6b. Rename the sidebar labels in `src/app/nav.tsx` to `cap(many)`. Pin the ids of renamed pages and list ids in `APP_SECTIONS` (see Naming).
7. Remove `size="medium"` from buttons in `actions`.
8. On `SalesReturnsList.tsx` and `StockCountList.tsx`, remove `tabs`. Split each into its own route and sidebar entry. The routes already differ (`SR_LIST_PATH` / `AR_CM_LIST_PATH`, `COUNT_LIST_PATH` / `POSTING_LIST_PATH`), so the change is in `src/app/` nav and the page's `kind` / `view` switch.

Representative files:

- **List:** `purchasing/purchase-orders/PurchaseOrderList.tsx`
- **Detail:** `purchasing/purchase-orders/detail/PurchaseOrderDetail.tsx`, `sales/agreements/detail/BlanketAgreementDetail.tsx` (its `primary` intent becomes `default`)
- **Shared:** `components/form/MasterList.tsx` (2 sites; detail keeps `onBack={back}`), `components/form/TabbedPage.tsx`, `components/form/DetailNav.tsx` (`NotFound`)
- **Side panels:** `sales/shared/CustomerDetailsPanel.tsx`, `components/form/MasterLookup.tsx`, `components/filter/PresetPanel.tsx` (these three gain the house icon style)
- **Type-only:** `inventory/counts/StockCountList.tsx` uses `PanelHeaderProps` in a `Pick<>`. It may keep that type import.

The full list: `grep -rln "<PanelHeader" src`.

**Concurrent work.** The multi-vendor RFQ branch has uncommitted edits in `PurchaseRequestDetail.tsx`, `PurchaseQuotationDetail.tsx`, `partners/detail/EditPanel.tsx`, `AwardPoPanel.tsx` and `FanOutRfqPanel.tsx`. In those files, change only the header lines. Before starting, check `git status` and the peer sessions. Never `git stash`.

---

## Guard against regression

- **ESLint** (`eslint.config.js`): add `no-restricted-imports` with `{ name: '@jasperlepardo/sikat-design-system', importNames: ['PanelHeader'], message: 'Use PageHeader from components/form/PageHeader' }`. Exempt `src/components/form/PageHeader.tsx`. Type-only `PanelHeaderProps` stays allowed.
- **CLAUDE.md:** add the conventions above as a "Page header" bullet under Forms and UI.

## Verification

- `npm run typecheck && npm run lint && npm run knip`: 0 errors. The lint rule proves no raw `PanelHeader` is left.
- `grep -rn 'iconSize={32}\|onBreadcrumbNavigate\|type="details"\|trailing=\|operations=' src` should only match `PageHeader.tsx`.
- `grep -rnE "'New (request|invoice|agreement|voucher|transfer|RFQ|count|posting|credit memo)'" src` returns nothing. The purchasing sidebar shows A/P down payment invoices and goods return requests, and old URLs (`#/sales/customer-invoices`…) still open.
- `grep -rnE "Copy to|'(Add|Update|Save)'|Add Landed Cost|Create Reserve Invoice|Suggested PO" src/pages src/components` returns nothing. Each detail page's ⋯ menu matches the per-document table, with no Save as draft, Submit for approval, Approve or Reject in it.
- Approval: with no approver set, a new PO shows **Save as draft** + **Create purchase order**. Set someone else as PO approver in Settings › Approvals: it shows **Submit for approval**, and the submitted PO opens read-only with Recall in ⋯. Set yourself: the submitted PO shows **Reject** + **Approve**. Settings › Approvals lists A/R reserve invoice, A/P reserve invoice and A/P down payment invoice.
- An open document shows **Save changes**. A closed or cancelled one shows no Cancel and no primary.
- `npx tsx scripts/check-seeds.ts` passes after the approval mock change.
- On one detail page, check that `PrevNext` inside `actions` still looks right (small pill arrows, spacing) before migrating the rest.
- `npm run test:e2e`: the screens sweep loads every route.
- Spot-check with `npm run dev`:
  - PO list (search, New);
  - PO detail (breadcrumb click, Back, Prev/Next, tabs);
  - a master settings record;
  - the customer-details side panel and MasterLookup "New".
