import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Card,
  Icon,
  Table,
  TableLink,
  TableStatus,
  Text,
  TextField,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../../../components/form/DataTable';
import { Stat } from '../../../components/Stat';
import { itemGroupName } from '../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../services/items';
import { useAsync } from '../../../services/useAsync';
import type { Draft } from './fields';

const ITEM_PATH = '/inventory/items';

interface VendorItemRow {
  id: string;
  itemNo: string;
  name: string;
  itemGroup: string;
  /** The vendor's own part number (BP catalog no.). */
  catalogNo: string;
  /** This vendor is the item's default vendor. */
  isDefault: boolean;
  /** Warehouses that restock from this vendor. */
  preferredAt: string[];
  valid: boolean;
}

/**
 * The items this vendor supplies, read from each item's Vendors card (the item stays the
 * source of truth: vendors and catalog numbers are added and changed there).
 */
export function VendorItemsTab({ draft }: { draft: Draft }) {
  const navigate = useNavigate();
  const items = useAsync(listItems, []);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'itemNo', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  if (!items) return <Text tone="muted" className="p-4">Loading items…</Text>;

  const rows: VendorItemRow[] = items
    .filter((i) => i.defaultVendorId === draft.id || i.vendors.some((v) => v.vendorId === draft.id))
    .map((i) => ({
      id: i.id,
      itemNo: i.itemNo,
      name: i.name || i.description,
      itemGroup: itemGroupName(i.itemGroupId),
      catalogNo: i.vendors.find((v) => v.vendorId === draft.id)?.vendorItemNo ?? '',
      isDefault: i.defaultVendorId === draft.id,
      preferredAt: i.warehouses.filter((w) => w.preferredVendorId === draft.id).map((w) => w.code),
      valid: isValidToday(i),
    }));

  const q = query.trim().toLowerCase();
  const found = rows.filter((r) => !q || [r.itemNo, r.name, r.itemGroup, r.catalogNo].join(' ').toLowerCase().includes(q));
  const dir = sort?.direction === 'asc' ? 1 : -1;
  const sortKey = sort?.key as keyof VendorItemRow | undefined;
  const sorted = sortKey
    ? [...found].sort((a, b) => {
        const x = String(a[sortKey] ?? '');
        const y = String(b[sortKey] ?? '');
        return x.localeCompare(y, undefined, { numeric: true }) * dir;
      })
    : found;
  const open = (r: VendorItemRow) => navigate(`${ITEM_PATH}/${r.id}`);
  const muted = (text: string) => (text ? text : <span className="text-muted">—</span>);

  const columns: TableColumn<VendorItemRow>[] = [
    {
      key: 'itemNo',
      header: 'Item',
      cell: (r) => <span className="whitespace-nowrap">{r.itemNo}</span>,
    },
    // The name shares the Item header; sorting is on the item no.
    {
      key: 'name',
      header: '',
      sortable: false,
      cell: (r) => <TableLink onClick={() => open(r)}>{r.name}</TableLink>,
    },
    { key: 'itemGroup', header: 'Item group', cell: (r) => muted(r.itemGroup) },
    { key: 'catalogNo', header: 'Vendor catalog no.', cell: (r) => muted(r.catalogNo) },
    {
      key: 'isDefault',
      header: 'Default vendor',
      cell: (r) => (r.isDefault ? <TableStatus intent="primary">Default</TableStatus> : <span className="text-muted">—</span>),
    },
    { key: 'preferredAt', header: 'Preferred at', sortable: false, cell: (r) => muted(r.preferredAt.join(', ')) },
    {
      key: 'valid',
      header: 'Status',
      cell: (r) => (r.valid ? <TableStatus intent="success">Active</TableStatus> : <TableStatus>Not valid today</TableStatus>),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="grid gap-2 md:grid-cols-3">
        <Stat icon="inventory_2" label="Items supplied" value={String(rows.length)} sub="On the items’ Vendors card" />
        <Stat
          icon="star"
          label="Default vendor for"
          value={String(rows.filter((r) => r.isDefault).length)}
          sub="Items that buy from this vendor first"
        />
        <Stat
          icon="tag"
          label="Missing catalog no."
          value={String(rows.filter((r) => !r.catalogNo).length)}
          sub="Add the vendor’s part number on the item"
        />
      </div>

      <TextField
        aria-label="Search items"
        placeholder="Search by item no., name, group or catalog no."
        leadingIcon={<Icon size={20}>search</Icon>}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setPage(1);
        }}
      />

      {/* Fills the rest of the panel; the table scrolls inside it. */}
      <Card className="min-h-72 flex-1">
        {found.length ? (
          <Table
            caption="Items supplied"
            columns={columns.map((c) => ({ sortable: true, ...c }))}
            rows={sorted.slice((page - 1) * pageSize, page * pageSize)}
            getRowId={(r) => r.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            onRowAction={open}
            pagination={{
              page,
              pageSize,
              total: sorted.length,
              pageSizes: PAGE_SIZES,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
            }}
          />
        ) : (
          <Card.Content>
            <Text variant="small" tone="muted">
              {query ? 'Nothing matches the search.' : 'No items list this vendor yet. Add it on an item’s Vendors card.'}
            </Text>
          </Card.Content>
        )}
      </Card>
    </div>
  );
}
