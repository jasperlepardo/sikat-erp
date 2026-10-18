# Bring purchasing lines tables to sales standard

## Context

The sales item tables (`SoLinesCard`, `DnContentsCard`, `ArContentsCard`, etc.) have a consistent UX pattern. The purchasing lines tables have the structural bones (GROUPS mechanism, col() helper, column settings gear) but are missing the key behavioural pieces that make the sales tables feel polished. Goal: bring every purchasing lines card up to the same standard.

Note: purchasing tables correctly keep `variant="card"` (they own their card frame) vs. sales using `variant="plain"` (the outer CustomerCard provides the frame). This is intentional and stays.

---

## Gap analysis

| File | Edit/Done | Inline add-row | Settings wired | col() helper |
|---|---|---|---|---|
| `PoLinesCard.tsx` | ✓ | ✗ | ✓ | ✓ |
| `GrContentsCard.tsx` | ✗ | ✗ | ✓ | ✓ |
| `ApContentsCard.tsx` | ✗ | ✗ | ✓ | ✓ |
| `DprLinesCard.tsx` | ✗ | ✗ | ✓ | ✓ |
| `RfqLinesCard.tsx` | ✓ | ✗ | ✗ custom | ✓ |
| `PrLinesCard.tsx` | ✗ | ✗ | ✓ | ✗ |
| `ReturnLines.tsx` | ✗ | ✗ | ✓ | ✓ |

---

## Pattern to apply (from SoLinesCard)

### 1. Edit/Done/Change item picker flow

Every item cell that currently only shows a "Change" link should gain an "Edit" link too:

```tsx
// NORMAL VIEW
<div className="flex flex-col gap-1 whitespace-normal">
  <Text variant="caption">{l.itemNo}</Text>
  <Text variant="small">{l.description}</Text>
  {ro ? null : (
    <div className="flex gap-3">
      <Link intent="primary" onClick={() => setEditing(s => new Set(s).add(l.id))}>Edit</Link>
      {l.baseId ? null : (
        <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', description: '' })}>Change</Link>
      )}
    </div>
  )}
</div>

// EDIT MODE (editing.has(l.id))
<div className="flex w-64 flex-col gap-1">
  {item
    ? <TextField aria-label="Item description" value={l.description} onChange={e => patch(l.id, { description: e.currentTarget.value })} />
    : <Combobox aria-label="Item No." ... />}
  {item
    ? <Link intent="primary" onClick={() => setEditing(s => { const n = new Set(s); n.delete(l.id); return n; })}>Done</Link>
    : null}
</div>
```

Add `const [editing, setEditing] = useState<Set<string>>(new Set())` to each component.

Files needing this: `GrContentsCard`, `ApContentsCard`, `DprLinesCard`, `PrLinesCard`, `ReturnLines`

### 2. Inline add-row (spanRow Combobox)

Replace the standalone "Add line" button with an inline Combobox in the DataTable's `spanRow`:

```tsx
// Add state: const [addKey, setAddKey] = useState(0);

const addRow = ro ? undefined : (
  <div className="flex items-center gap-2">
    <div className="flex-1">
      <Combobox
        key={addKey}
        aria-label="Search items to add a line"
        placeholder={draft.vendorId ? 'Search items to add a line…' : 'Pick a vendor to add items'}
        disabled={!draft.vendorId}
        options={itemOptions('')}
        value={null}
        onValueChange={(id) => {
          const line = id ? fromItem(id, {}) : undefined;
          if (!line) return;
          update({ lines: [...itemLines, line] });
          setAddKey(k => k + 1);
        }}
      />
    </div>
    {/* Keep copy button where applicable */}
  </div>
);
```

`itemOptions` filters purchasing items:
```tsx
const itemOptions = (current: string) =>
  m.items
    .filter(i => i.id === current || (i.purchaseItem && isValidToday(i, draft.postingDate)))
    .map(i => ({ value: i.id, label: <div className="flex flex-col gap-0.5"><span className="text-xs opacity-60">{i.itemNo}</span><span>{i.description || i.name}</span></div>, text: `${i.itemNo} ${i.name} ${i.description}` }));
```

`GrContentsCard` and `ApContentsCard` keep their "Copy from" button alongside the Combobox.

### 3. Fix RfqLinesCard column settings

Replace the custom inline Card + absolute positioning with the DataTable `onColumnSettings` prop pattern used everywhere else.

### 4. Add col() helper to PrLinesCard

```tsx
const col = (key: string, header: ReactNode, cell: (l: PrLine) => ReactNode, group?: Group, align?: 'start' | 'end'): TableColumn<PrLine> & { group?: Group } => ({ key, header, cell, group, ...(align ? { align } : {}) });
```

---

## Files modified

1. `src/pages/purchasing/purchase-orders/detail/PoLinesCard.tsx` — inline add-row only
2. `src/pages/purchasing/goods-receipts/detail/GrContentsCard.tsx` — Edit/Done + inline add-row
3. `src/pages/purchasing/bills/ap-invoices/detail/ApContentsCard.tsx` — Edit/Done + inline add-row
4. `src/pages/purchasing/bills/down-payment-requests/detail/DprLinesCard.tsx` — Edit/Done + inline add-row
5. `src/pages/purchasing/purchase-quotations/detail/RfqLinesCard.tsx` — inline add-row + fix column settings
6. `src/pages/purchasing/purchase-requests/detail/PrLinesCard.tsx` — col() helper + Edit/Done + inline add-row
7. `src/pages/purchasing/returns-and-debits/ReturnLines.tsx` — Edit/Done + inline add-row
