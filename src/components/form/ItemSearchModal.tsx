import { useMemo, useState } from 'react';
import {
  Card,
  Table,
  TableAmount,
  TableContent,
  TableStatus,
  TextField,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { Modal } from './Modal';
import { fillCardClass, useListPage } from './DataTable';
import type { Item } from '../../mocks/items';
import { isValidToday } from '../../services/items';
import { formatAmount } from '../../services/format';
import { itemGroupName } from '../../services/inventoryMasters';
import { useListPresets } from '../filter/useListPresets';
import { ITEM_SEARCH_VIEWS, itemSearchFields } from '../../pages/inventory/items/itemSearchFields';

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Advanced item search in a centered modal: the same filter/preset/search UX as the Items
 * list page, with multi-select checkboxes. The caller passes the candidate catalog (already
 * narrowed to what the document can add — purchasable or salable, valid today); `onAdd`
 * gets the ticked item ids to append as lines in one go.
 */
export function ItemSearchModal({
  items,
  onCancel,
  onAdd,
}: {
  items: Item[];
  onCancel: () => void;
  onAdd: (itemIds: string[]) => void;
}) {
  const fields = useMemo(() => itemSearchFields(), []);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { resetPage, paginate } = useListPage();
  const presets = useListPresets({
    list: 'item-search',
    fields,
    builtIns: ITEM_SEARCH_VIEWS,
    defaultSort: { key: 'description', direction: 'asc' },
    rows: items,
    onChange: resetPage,
    // A modal over a detail page: keep the filter local so selecting a value doesn't
    // rewrite the page URL (which would remount a `/new/` form and close the modal).
    urlSync: false,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = normalize(query);
    const filtered = presets.apply(items).filter((i) => {
      if (!q) return true;
      const text = normalize([i.itemNo, i.description, i.name, i.foreignName, itemGroupName(i.itemGroupId), i.gtin, ...i.barcodes.map((b) => b.barcode)].join(' '));
      return text.includes(q);
    });
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const v = a[sort.key as keyof Item];
      const w = b[sort.key as keyof Item];
      const x = typeof v === 'number' ? v : String(v ?? '').toLowerCase();
      const y = typeof w === 'number' ? w : String(w ?? '').toLowerCase();
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // presets.filter drives apply(); include it so the list re-filters on preset changes.
  }, [items, presets, query, sort]);

  const columns: TableColumn<Item>[] = [
    {
      key: 'description',
      header: 'Item',
      cell: (i) => <TableContent subcopy={i.itemNo}>{i.description || i.name}</TableContent>,
    },
    {
      key: 'itemGroupId',
      header: 'Group',
      cell: (i) => <TableContent subcopy={i.itemType === 'Items' ? undefined : i.itemType}>{itemGroupName(i.itemGroupId)}</TableContent>,
    },
    {
      key: 'basePrice',
      header: 'Base price',
      cell: (i) => <TableAmount currency="PHP">{formatAmount(i.basePrice)}</TableAmount>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (i) =>
        !isValidToday(i) ? (
          <TableStatus intent="default">Not valid</TableStatus>
        ) : i.inventoryItem ? (
          <TableStatus intent="success">Inventory</TableStatus>
        ) : (
          <TableStatus intent="primary">Non-stock</TableStatus>
        ),
    },
  ];

  const { visible, pagination } = paginate(rows);
  const searchField = (
    <TextField
      aria-label="Search items"
      placeholder="Search by item no., description, group, or barcode"
      value={query}
      onChange={(e) => {
        setQuery(e.currentTarget.value);
        resetPage();
      }}
    />
  );

  return (
    <Modal
      icon="inventory_2"
      title="Add items"
      onCancel={onCancel}
      onDone={() => onAdd(selectedIds)}
      doneLabel={`Add ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'}`}
      doneDisabled={selectedIds.length === 0}
    >
      {presets.toolbar(searchField)}
      <Card className={fillCardClass(visible.length)}>
        <Table
          caption="Items"
          columns={columns}
          rows={visible}
          getRowId={(i) => i.id}
          sort={sort}
          onSortChange={setSort}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          layout="fill"
          pagination={pagination}
        />
      </Card>
      {presets.panel}
    </Modal>
  );
}
