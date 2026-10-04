# Sikat ERP — Claude Guide

## What this is

**Sikat ERP** is a frontend-only UI prototype of an ERP system for Philippine businesses. No backend — screens read/write mock data via service functions backed by `localStorage`. Designed so real `fetch` calls can replace the mock services later.

Demo scenario: an Apple Premium Reseller in the Philippines, with seed data covering every BIR VAT and withholding tax combination.

**Purpose:** Proof-of-concept / design prototype for the `@jasperlepardo/sikat-design-system` package.

---

## Stack

- **Vite + React 19 + TypeScript** — standard Vite SPA
- **React Router 7** — hash routing (`/#/inventory/items`)
- **Tailwind CSS v4** — tokens come from the design system
- **`@jasperlepardo/sikat-design-system`** — published to GitHub Packages; current version ~0.31.x
- No backend, no real auth, no tests (Playwright in devDeps but no test files)

## Commands

```sh
npm run dev        # Start dev server
npm run typecheck  # TypeScript check only
npm run build      # tsc -b && vite build
npm run preview    # Serve dist/ locally
```

---

## Directory layout

```
src/
  app/          AppShell, router, sidebar nav definition
  components/   Shared UI components (form helpers)
    form/
      fields.tsx          bind() field builder + layout helpers
      MasterLookup.tsx    Searchable master-data picker + inline "+ Add"
      MasterList.tsx      Editable settings list (ListView + RecordPage)
      TabbedPage.tsx      Settings page pattern (tabs in URL)
      DataTable.tsx       Card+Table for smaller lists
      AttachmentsCard.tsx File upload & display
      AccountField.tsx    G/L account picker
      AddressFields.tsx   Postal address composer
      PhLocationFields.tsx Province → City → Barangay (PSGC)
      ProblemsAlert.tsx   Validation error alert with tab links
      MoreMenu.tsx        "You can also" actions dropdown
      RowMenu.tsx         Row "⋯" actions dropdown
  data/psgc/    Philippine Standard Geographic Code data
  mocks/        Type definitions + seed data (items, partners, taxes, POs, etc.)
  pages/        Feature pages
    Home.tsx
    Placeholder.tsx
    accounting/   ChartOfAccountsPage
    inventory/    WarehousesPage, ItemList, ItemDetail (11 tabs)
    partners/     PartnerList, PartnerDetail (8 tabs)
    purchasing/   PurchaseOrderList, PurchaseOrderDetail (3 tabs)
    settings/     MasterSettingsPages, masterDefs, accounting-tax/, inventory/
  services/     Fake async API + domain logic
    store.ts            createCollection() — localStorage-backed collections
    items.ts            Item CRUD + business rules
    partners.ts         Partner CRUD + business rules
    purchaseOrders.ts   PO CRUD + line calculations
    masterData.ts       All accounting/tax collections
    inventoryMasters.ts Inventory master collections + loader
    partnerMasters.ts   Partner-related collections
    companies.ts        Company collection + current company
    taxDetermination.ts BIR VAT/EWT/FWT line tax logic
    format.ts           formatAmount() for PHP locale
    locations.ts        PSGC geography (provinces, cities, barangays)
    accountUsage.ts     Chart-of-accounts usage tracking
    useAsync.ts         useAsync<T>() hook
    useCollectionRows.ts useCollectionRows() hook
```

---

## Routes

All routes use hash routing (`/#/…`). Defined in `src/app/router.tsx`.

| Route | Page |
|---|---|
| `/` | Home (dashboard) |
| `/inventory/items` | ItemList |
| `/inventory/items/:id` | ItemDetail (11 tabs) |
| `/inventory/warehouses-and-bins/:recordId?` | WarehousesPage |
| `/purchasing/purchase-orders` | PurchaseOrderList |
| `/purchasing/purchase-orders/:id` | PurchaseOrderDetail (3 tabs) |
| `/accounting/chart-of-accounts/:recordId?` | ChartOfAccountsPage |
| `/all`, `/leads`, `/customers`, `/vendors` | PartnerList (role-scoped) |
| `/all/:id`, `/leads/:id`, etc. | PartnerDetail (8 tabs) |
| `/settings/accounting-and-tax/:tab?/:recordId?` | AccountingTaxPage (11 master tabs) |
| `/settings/inventory/:tab?/:recordId?` | InventorySettingsPage |
| `/settings/sales-and-crm/…`, `/settings/banking/…`, `/settings/company/…` | Placeholder (not yet built) |

---

## Core data layer — `createCollection<T>`

`src/services/store.ts`

```ts
createCollection<T>(storageKey, seed, idPrefix)
→ {
    list(): Promise<T[]>,
    get(id): Promise<T | undefined>,
    save(input): Promise<T>,
    snapshot(): readonly T[],     // Sync read (no await)
    subscribe(fn): () => void,    // Called after any save
    reset(): Promise<void>
  }
```

- Reads/writes `localStorage`; fake 250ms latency on async calls
- `subscribe()` fires when any screen saves → other screens' pickers reload live
- `useCollection(collection)` hook returns `T[] | undefined` (undefined while loading)
- `useAsync<T>(load, deps)` runs async on mount/deps change; returns `undefined` while loading
- `useCollectionRows(collection)` returns `{ rows, save, setActive, reload }`

---

## Master-data pattern — `MasterDef<T>`

Every master list (tax codes, UoMs, warehouses, etc.) defines a `MasterDef<T>` once. The same definition drives:
1. The settings list page (`MasterList` / `MasterDefList`)
2. The inline "+ Add" picker in any form (`MasterLookup`)

### MasterDef shape

```ts
interface MasterDef<T> {
  collection: Collection<T>;
  icon: string;                           // Material Symbol
  title: string;                          // e.g., "Units of Measure"
  noun: string;                           // Singular lower-case: "unit"
  description?: ReactNode;
  home: string;                           // e.g., "Settings › Inventory"
  blank: (name: string) => T;             // Fresh row with name pre-filled
  value: (row: T) => string;              // What to store (code or name)
  label: (row: T) => string;              // What to display
  columns: TableColumn<T>[];
  searchText: (row: T) => string;
  editor: (row, update, errors, isNew) => ReactNode;
  validate: (row, all) => Errors;
  normalize?: (row: T) => T;              // Trim, uppercase, etc.
}
```

All master defs live in `src/pages/settings/masterDefs.tsx`.

### MasterLookup component

```tsx
<MasterLookup
  def={uomDef}
  value={draft.uomId}
  onChange={(id) => update({ uomId: id })}
  where={(row) => row.active}             // Optional filter
  seed={{ type: 'each' }}                 // Pre-fill on quick-add
  clearable
  disabled={saving}
/>
```

- Combobox over active rows; stale saved value always stays selectable
- No matches while typing → "+ Add '[text]'" creates and opens QuickAddPanel
- QuickAddPanel is a portaled SidePanel; Escape closes without submitting

### MasterList component (settings pages)

- `recordId` prop absent → ListView (table + search + "New" button)
- `recordId` present → RecordPage (form with save/cancel + prev/next)
- Row click navigates to `${basePath}/${id}`; "New" navigates to `${basePath}/new`

---

## `bind()` field builder

`src/components/form/fields.tsx` re-exports the design system's `bind()` and adds `f.master()`.

```ts
const f = bind(draft, update);

f.text('name', 'Item Name', { required: true })
f.pick('type', 'Type', typeOptions)
f.choose('vatType', 'VAT Type', vatOptions)
f.check('active', 'Active')
f.master('uomId', 'Unit', uomDef, { required: true })
```

**Field options** (`FieldOptions`): `required`, `disabled`, `readOnly`, `error`, `hint`, `placeholder`, `clearable`

**Layout helpers:**

```tsx
<Fields cols={2}>            // Responsive grid; default 2 cols
  {f.text(…)}
  {f.pick(…)}
</Fields>

<FieldStack>                 // Side-label stack (responsive)
  {f.text(…)}
</FieldStack>

<Flags>                      // Flex row for checkboxes
  {f.check(…)}
</Flags>
```

`ReadOnly({ label, value, hint, error })` — for system-calculated values.

---

## Detail page structure

Items, Partners, and Purchase Orders all follow this layout:

```
<Form onSubmit={submit}>
  <Panel>
    <PanelHeader
      type="details"
      icon="…"  title="…"  subcopy="…"
      leading={<Prev/Next>}
      tabs={<Tabs value={page} />}
      status={<Badges />}
      actions={<Cancel> <Save>}
    />
    <Panel.Body className="lg:grid-cols-12 gap-2">
      {problems && <ProblemsAlert … />}

      {/* Side column — lg:col-span-3 */}
      <aside>
        <Section icon="…" title="Identity">
          <FieldStack>…key fields…</FieldStack>
        </Section>
        {/* Subsidiary cards (e.g., WarehousesCard, VendorsCard) */}
      </aside>

      {/* Main content — lg:col-span-9 */}
      <div>
        <Tabs />
        <ActiveTabComponent draft={draft} update={update} errors={errors} … />
      </div>
    </Panel.Body>
  </Panel>
</Form>

{/* Portaled SidePanel editors for nested records */}
{editing && <AddressPanel … />}
```

**Side column** contains header/identity fields + "subsidiary cards" (e.g., Vendors, Warehouses, Manufacturers on Item). Each card shows an inline list of rows + "Add ▾" button; clicking a row opens a portaled SidePanel editor.

**Form state:**
```ts
const [draft, setDraft] = useState<Draft>(initial);
const update = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }));
const [errors, setErrors] = useState<Errors>({});
```

**Validation + save:**
1. `validate(draft, …)` → `Problem[]`
2. If problems: show `ProblemsAlert`, jump to first problem's tab
3. If clean: call service `save(draft)` → navigate back to list

`problemCollector<Tab>()` returns `{ problems, need(ok, tab, key, message) }`.

---

## Validation helpers

```ts
// ProblemsAlert
interface Problem<Tab = string> { tab: Tab | 'header'; key: string; message: string; }
problemCollector<Tab>()  →  { problems: Problem<Tab>[], need(ok, tab, key, message): void }

// MasterList uniqueness helper
uniqueRequired<T>(errors, row, all, key, label)
// Checks required + unique; writes into errors object

// MasterList status column helper
statusColumn<T>()  →  TableColumn<T>   // "Active" / "Inactive" badge
```

---

## Services overview

### items.ts
```ts
listItems(), getItem(id), saveItem(input), resetItems()
class ItemSaveError(field, message)   // field: 'itemNo' | 'barcodes'
stockTotals(item), isLowStock(item), isValidToday(item, today?)
```

### partners.ts
```ts
listPartners(), getPartner(id), savePartner(input), resetPartners()
listPartnersByRole(role), convertLeadToCustomer(id)
isActive(partner, today?), defaultContact(partner), defaultContactName(partner), defaultBillTo(partner)
```

### purchaseOrders.ts
```ts
listPurchaseOrders(), getPurchaseOrder(id), savePurchaseOrder(input), resetPurchaseOrders()
class PoSaveError(field, message)
poNumber(po), openQty(line), inventoryQty(line), priceAfterDiscount(line), lineNet(line)
poTotals(po, codes), poTotal(po, codes), poWithholding(po, codes)
termDays(terms), dueDateFor(postingDate, terms), findDuplicateVendorRef(po)
```

### masterData.ts
Key collections: `taxCodes`, `taxGroups`, `companyTax`, `accounts`, `withholdingTaxes`, `withholdingGroups`, `exciseCategories`, `currencies`, `exchangeRates`

Also: `rateOn(rates, currency, date)`, `parseBspBulletin(text, known)`

### inventoryMasters.ts
Key collections: `itemGroups`, `unitsOfMeasure`, `uomGroups`, `warehouses`, `manufacturers`, `customsGroups`, `inventorySettings`

`loadInventoryMasters()` — loads all at once; `EMPTY_INVENTORY_MASTERS` for initial state.

`activeOptions<T>(rows, keyFn, labelFn, currentValue)` — builds `Option[]` from active rows + keeps the current value even if inactive.

### partnerMasters.ts
Collections: `bpGroups`, `paymentTerms`, `banks`, `priceLists`, `territories`, `channels`, `countries`, and many more named lists.

### companies.ts
`currentCompanyId()`, `setCurrentCompanyId(id)`, `useCurrentCompany()`, `loadCurrentCompany()`

### taxDetermination.ts
```ts
determineTax(item, partner, company, masters)      → Determination
determineWithholding(vendor, item, company, masters) → Determination
// Determination includes: taxCode, rate, trace (TraceStep[])
```

### format.ts
`formatAmount(value)` → `"1,234.56"` (Intl.NumberFormat, en-PH, 2 decimals)

### locations.ts
`loadLocations()`, `loadBarangays(city)`, `useLocations()`, `useBarangays(city)`
`findProvince(data, code, name)`, `findCity(data, province, code, name)`, `findBarangay(rows, code, name)`

---

## Design system components used

Key imports from `@jasperlepardo/sikat-design-system`:

| Component | Usage |
|---|---|
| `Page`, `Navbar`, `SideNav` | App shell |
| `Panel`, `Panel.Header`, `Panel.Body` | Page container |
| `PanelHeader` | Title + tabs + actions bar |
| `Card`, `Card.Header`, `Card.Content` | Content sections |
| `Form`, `FormField` | Form wrapper & field layout |
| `TextField`, `Select`, `Combobox` | Input controls |
| `MultiSelect`, `Checkbox`, `Radio` | Choice controls |
| `Button`, `IconButton` | Actions |
| `Table` | Data table (sort, select, paginate) |
| `Tabs` | Tab navigation |
| `Text`, `Link`, `Icon`, `Badge` | Typography & display |
| `Alert` | Inline alert (danger/warning/info/success) |
| `Dropdown`, `DropdownItem` | Floating menu |
| `SidePanel` | Portaled right slide-in panel |
| `bind()` | Base field builder (extended by sikat-erp) |
| `initTheme()`, `useTheme()` | Theme init & hook |
| `useDropdown()` | Dropdown state/positioning |

---

## Philippines-specific

- **BIR taxes:** VAT (12% or 0%), Expanded Withholding Tax (EWT), Final Withholding Tax (FWT), Excise Tax — see `taxDetermination.ts`
- **Tax scenarios in seed data:** VAT-registered, zero-rated (PEZA, export), senior citizen, cooperative, government, non-resident digital services, treaty relief, etc.
- **PSGC:** Philippine Standard Geographic Code — provinces → cities → barangays in `src/data/psgc/`; used by `PhLocationFields` for cascading address pickers
- **Currency:** PHP (Philippine Peso); `formatAmount()` uses `en-PH` locale
- **BSP exchange rates:** `parseBspBulletin()` parses Bangko Sentral ng Pilipinas forex bulletin

---

## TypeScript patterns

```ts
// Generic collection constraint
type Collection<T extends { id: string }> = …

// Type-safe field builder
bind<T>(obj: T, update: (patch: Partial<T>) => void): FieldBuilder<T>

// Problem type generic over tab names
interface Problem<Tab extends string = string> { tab: Tab | 'header'; … }

// Service save accepts optional id (new record)
saveItem(input: Omit<Item, 'id'> & { id?: string }): Promise<Item>

// Discriminated union for editing state
type Editing =
  | { kind: 'contact'; value: ContactPerson; isNew: boolean }
  | { kind: 'address'; value: PartnerAddress; isNew: boolean }
  | null;

// Remount form when record ID changes
<ItemForm key={id === 'new' ? location.key : id} />
```

---

## Key architectural notes

1. **No server** — everything is `localStorage` + seed data. Service functions are intentionally shaped like real async APIs so they can be replaced with `fetch` calls.

2. **MasterDef is the single source of truth** for any master list — drives both the settings page editor and the inline picker in any form.

3. **`subscribe()` keeps pickers live** — after any `collection.save()`, all open `useCollection()` hooks reload. No manual cache invalidation needed.

4. **Side column + tabbed main content** is the standard detail-page layout. Side column is always visible; tabs hold grouped fields.

5. **Hash routing** is intentional for static hosting (GitHub Pages, Netlify, etc.) without server-side routing.

6. **Design system `bind()` extended** — sikat-erp adds `f.master()` for `MasterLookup`, and layout helpers (`Section`, `Fields`, `FieldStack`, `Flags`, `ReadOnly`).
