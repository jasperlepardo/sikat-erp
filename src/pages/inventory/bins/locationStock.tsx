import type { ReactNode } from 'react';
import { binCodeOf, binLocations } from '../../../services/binLocations';
import { TableLink, type TableColumn } from '@jasperlepardo/sikat-design-system';
import type { Item } from '../../../mocks/items';

const qty = (n: number) => n.toLocaleString('en-PH');

/** Right-aligned numeric column (see `.table-num` in index.css). */
const numHeader = (label: string) => <span className="table-num">{label}</span>;
const num = (content: ReactNode) => <div className="table-num">{content}</div>;

/** One item's stock at a location. */
export interface StockRow {
  id: string;
  itemNo: string;
  name: string;
  bin: string;
  uom: string;
  inStock: number;
  committed: number;
  ordered: number;
  available: number;
}

/** The items stocked at a location, from each item's row for it. */
export function locationStock(items: readonly Item[], code: string, binIds?: readonly string[]): StockRow[] {
  const bins = binLocations.snapshot();
  const rows: StockRow[] = [];
  for (const item of items) {
    const w = item.warehouses.find((x) => x.code === code);
    if (!w || (binIds && !binIds.includes(w.defaultBinId))) continue;
    rows.push({
      id: item.id,
      itemNo: item.itemNo,
      name: item.name,
      bin: w.defaultBinId ? binCodeOf(bins, w.defaultBinId) : '',
      uom: item.inventoryUom,
      inStock: w.inStock,
      committed: w.committed,
      ordered: w.ordered,
      available: w.inStock - w.committed + w.ordered,
    });
  }
  return rows.sort((a, b) => a.itemNo.localeCompare(b.itemNo));
}

/** Columns for a location's (or bin's) item list; `withBin` adds the default bin. */
export function stockColumns(open: (row: StockRow) => void, withBin: boolean): TableColumn<StockRow>[] {
  return [
    { key: 'itemNo', header: 'Item No.', cell: (r) => <TableLink onClick={() => open(r)}>{r.itemNo}</TableLink> },
    { key: 'name', header: 'Name', cell: (r) => r.name },
    ...(withBin ? [{ key: 'bin', header: 'Default bin', cell: (r: StockRow) => r.bin || '—' }] : []),
    { key: 'inStock', header: numHeader('In stock'), cell: (r) => num(`${qty(r.inStock)} ${r.uom}`) },
    { key: 'committed', header: numHeader('Committed'), cell: (r) => num(qty(r.committed)) },
    { key: 'ordered', header: numHeader('Ordered'), cell: (r) => num(qty(r.ordered)) },
    { key: 'available', header: numHeader('Available'), cell: (r) => num(qty(r.available)) },
  ];
}
