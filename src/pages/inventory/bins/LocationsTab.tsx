import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge, Button, Card, Icon, Table, TableLink, TableStatus, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { fillCardClass } from '../../../components/form/DataTable';
import { useHeaderSearch } from '../../../components/form/HeaderSearch';
import type { ListRoute } from '../../../components/form/MasterList';
import { useCollection } from '../../../components/form/MasterLookup';
import { MoreMenu } from '../../../components/form/MoreMenu';
import { TIER_LABEL, type BinLocation, type BinSublevel, type SublevelTier } from '../../../mocks/binLocations';
import { LOCATION_TYPES, holdsStock, type Warehouse } from '../../../mocks/itemMasters';
import type { Item } from '../../../mocks/items';
import { binStock } from '../../../services/binLocations';
import { binLocations, binSublevels, warehouses } from '../../../services/inventoryMasters';
import { listItems } from '../../../services/items';
import { useAsync } from '../../../services/useAsync';
import { useCollectionRows } from '../../../services/useCollectionRows';
import { qty, restrictionSummary } from './BinLocationsTab';
import { GenerateBinsPanel, ModifyBinCodesPanel } from './BinToolsPanels';

type Group = { kind: 'aisle' | 'shelf'; id: string; label: string; bins: BinLocation[]; children: Node[] };
export type Node =
  | { kind: 'warehouse'; id: string; warehouse: Warehouse; bins: BinLocation[]; children: Node[] }
  | Group
  | { kind: 'bin'; id: string; bin: BinLocation; bins: BinLocation[]; children?: undefined };

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code);
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
export const binNode = (bin: BinLocation): Node => ({ kind: 'bin', id: bin.id, bin, bins: [bin] });

/** "Aisle A · Cold storage": the tier, its code and the sublevel code's description. */
function tierLabel(sublevels: readonly BinSublevel[], warehouse: string, tier: SublevelTier, code: string) {
  const d = sublevels.find((s) => s.warehouse === warehouse && s.tier === tier && s.code === code)?.description;
  return `${TIER_LABEL[tier]} ${code}${d ? ` · ${d}` : ''}`;
}

/** Locations, each warehouse with its bins nested by aisle and shelf. */
export function locationTree(whs: readonly Warehouse[], bins: readonly BinLocation[], sublevels: readonly BinSublevel[]): Node[] {
  return [...whs].sort(byCode).map((warehouse) => {
    const own = bins.filter((b) => b.warehouse === warehouse.code).sort(byCode);
    const children: Node[] = [];
    const groups = new Map<string, Group>();
    const group = (siblings: Node[], id: string, kind: Group['kind'], code: string) => {
      let g = groups.get(id);
      if (!g) {
        g = { kind, id, label: tierLabel(sublevels, warehouse.code, kind, code), bins: [], children: [] };
        groups.set(id, g);
        siblings.push(g);
      }
      return g;
    };
    for (const b of own) {
      const aisle = group(children, `${warehouse.id}/${b.aisle}`, 'aisle', b.aisle);
      const shelf = group(aisle.children, `${aisle.id}/${b.shelf}`, 'shelf', b.shelf);
      aisle.bins.push(b);
      shelf.bins.push(b);
      shelf.children.push(binNode(b));
    }
    return { kind: 'warehouse', id: warehouse.id, warehouse, bins: own, children };
  });
}

/** The Locations tree's columns, shared with a warehouse's own bin list (which drops Type). */
export function locationColumns({
  open,
  query,
  sublevels,
  items,
  showType,
}: {
  open: (n: Node) => void;
  query: string;
  sublevels: readonly BinSublevel[];
  items: readonly Item[];
  showType: boolean;
}): TableColumn<Node>[] {
  return [
    {
      key: 'location',
      header: 'Location',
      cell: (n) => (
        <TableLink onClick={() => open(n)}>
          {n.kind === 'warehouse'
            ? `${n.warehouse.code} · ${n.warehouse.name}`
            : n.kind === 'bin'
              ? query
                ? n.bin.code
                : tierLabel(sublevels, n.bin.warehouse, 'level', n.bin.level)
              : n.label}
        </TableLink>
      ),
    },
    ...(showType
      ? [
          {
            key: 'type',
            header: 'Type',
            cell: (n) =>
              n.kind === 'warehouse' ? (
                <Badge variant="outline">{LOCATION_TYPES.find((t) => t.value === n.warehouse.type)?.label ?? n.warehouse.type}</Badge>
              ) : null,
          } satisfies TableColumn<Node>,
        ]
      : []),
    {
      key: 'code',
      header: 'Bin code',
      cell: (n) =>
        n.kind === 'bin' ? (
          n.bin.code
        ) : n.kind === 'warehouse' && n.warehouse.type !== 'warehouse' ? (
          <Text variant="small" tone="muted">
            No bins
            {n.bins.length ? ` (${plural(n.bins.length, 'bin')} kept)` : ''}
          </Text>
        ) : query ? (
          ''
        ) : (
          <Text variant="small" tone="muted">
            {plural(n.bins.length, 'bin')}
          </Text>
        ),
    },
    { key: 'description', header: 'Description', cell: (n) => (n.kind === 'bin' ? n.bin.description : '') },
    {
      key: 'role',
      header: 'Role',
      cell: (n) =>
        n.kind === 'bin' ? (
          <div className="flex flex-wrap gap-1">
            {n.bin.receiving ? <Badge variant="outline">Receiving</Badge> : null}
            {n.bin.excludeAutoAlloc ? <Badge variant="outline">Manual pick</Badge> : null}
          </div>
        ) : null,
    },
    { key: 'restrictions', header: 'Restrictions', cell: (n) => (n.kind === 'bin' ? restrictionSummary(n.bin) : '') },
    {
      key: 'stock',
      header: 'Item qty',
      // A location shows all its stock; bins and their groups what sits in them.
      cell: (n) =>
        n.kind === 'warehouse'
          ? qty(items.reduce((sum, i) => sum + (i.warehouses.find((w) => w.code === n.warehouse.code)?.inStock ?? 0), 0))
          : qty(n.bins.reduce((sum, b) => sum + binStock(b, items).qty, 0)),
    },
    {
      key: 'active',
      header: 'Status',
      cell: (n) =>
        n.kind === 'warehouse' || n.kind === 'bin' ? (
          <TableStatus intent={(n.kind === 'bin' ? n.bin : n.warehouse).active ? 'success' : 'default'}>
            {(n.kind === 'bin' ? n.bin : n.warehouse).active ? 'Active' : 'Inactive'}
          </TableStatus>
        ) : (
          <Text variant="small" tone="muted">
            {n.bins.filter((b) => b.active).length} of {n.bins.length} active
          </Text>
        ),
    },
  ];
}

/** Inventory › Warehouses & Bins › Locations: stores, and warehouses with their aisles, shelves and bins. Offices live under Settings › Company. */
export function LocationsTab({ basePath }: ListRoute) {
  const navigate = useNavigate();
  // Warehouses and bins open on their own (tab-less) record pages next to this one.
  const base = basePath.slice(0, basePath.lastIndexOf('/'));
  const whRows = useCollectionRows(warehouses);
  const binRows = useCollectionRows(binLocations);
  const sublevels = useCollection(binSublevels) ?? [];
  const items = useAsync(listItems, [binRows.rows]) ?? [];
  const [tool, setTool] = useState<'generate' | 'modify' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[] | null>(null);

  const headerSearch = useHeaderSearch('Search locations');
  const [localQuery, setLocalQuery] = useState('');
  const query = (headerSearch?.query ?? localQuery).trim().toLowerCase();
  const setQuery = headerSearch?.setQuery ?? setLocalQuery;

  // Offices hold no stock; they're kept under Settings › Company.
  const whs = whRows.rows?.filter(holdsStock);
  const bins = binRows.rows;
  const loaded = whs !== undefined && bins !== undefined;
  const tree = loaded ? locationTree(whs, bins, sublevels) : [];
  // A search lists matching warehouses and bins flat, so every match is in view.
  const rows: Node[] = query
    ? [
        ...(whs ?? [])
          .filter((w) => `${w.code} ${w.name} ${w.type}`.toLowerCase().includes(query))
          .sort(byCode)
          .map((warehouse): Node => ({ kind: 'warehouse', id: warehouse.id, warehouse, bins: [], children: [] })),
        ...(bins ?? [])
          .filter((b) => `${b.code} ${b.description} ${b.barcode} ${b.altSortCode} ${restrictionSummary(b)}`.toLowerCase().includes(query))
          .sort(byCode)
          .map(binNode),
      ]
    : tree;

  // Warehouses start open; aisles and shelves start closed.
  const expandedIds = expanded ?? tree.map((n) => n.id);
  const toggle = (id: string) => setExpanded(expandedIds.includes(id) ? expandedIds.filter((x) => x !== id) : [...expandedIds, id]);

  const open = (n: Node) =>
    n.kind === 'warehouse'
      ? navigate(`${base}/warehouses/${encodeURIComponent(n.id)}`)
      : n.kind === 'bin'
        ? navigate(`${base}/bin-locations/${encodeURIComponent(n.id)}`)
        : toggle(n.id);

  // Picking a group picks the records under it; the Table adds the group's own id too.
  const pickedWhs = (whs ?? []).filter((w) => selected.includes(w.id));
  const pickedBins = (bins ?? []).filter((b) => selected.includes(b.id));
  const pickedCount = pickedWhs.length + pickedBins.length;
  const setActive = async (active: boolean) => {
    await whRows.setActive(pickedWhs, active);
    await binRows.setActive(pickedBins, active);
    setSelected([]);
  };

  const columns = locationColumns({ open, query, sublevels, items, showType: true });

  const reloadBins = () => {
    setTool(null);
    binRows.reload();
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2 px-2 pt-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Icon size={24}>location_on</Icon>
          <div className="min-w-0">
            <Text weight="semibold" tone="heading">
              Locations
            </Text>
            <Text variant="small" tone="muted">
              Warehouses receive vendor shipments into bins (by aisle and shelf); stores hold stock restocked by transfer. Bin codes read
              Warehouse-Aisle-Shelf-Level.
            </Text>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {pickedCount ? (
            <>
              <Text variant="small" tone="muted">
                {pickedCount} selected
              </Text>
              <Button type="button" size="small" variant="ghost" onClick={() => setActive(true)}>
                Activate
              </Button>
              <Button type="button" size="small" variant="ghost" intent="danger" onClick={() => setActive(false)}>
                Deactivate
              </Button>
            </>
          ) : null}
          <Button type="button" size="small" variant="ghost" leadingIcon={<Icon size={16}>apps</Icon>} onClick={() => setTool('generate')}>
            Generate bins
          </Button>
          <Button type="button" size="small" variant="ghost" leadingIcon={<Icon size={16}>edit_location_alt</Icon>} onClick={() => setTool('modify')}>
            Modify bin codes
          </Button>
          <MoreMenu
            label="New"
            button={{ intent: 'primary', size: 'small', leadingIcon: <Icon size={16}>add</Icon> }}
            items={[
              { label: 'Warehouse', icon: 'warehouse', onSelect: () => navigate(`${base}/warehouses/new?type=warehouse`) },
              { label: 'Store', icon: 'storefront', onSelect: () => navigate(`${base}/warehouses/new?type=store`) },
              { label: 'Bin location', icon: 'grid_view', onSelect: () => navigate(`${base}/bin-locations/new`) },
            ]}
          />
        </div>
      </div>
      {headerSearch ? null : (
        <TextField
          aria-label="Search locations"
          placeholder="Search locations"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={localQuery}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      )}
      <Card className={fillCardClass(rows.length)}>
        {loaded ? (
          <Table
            caption="Locations"
            columns={columns}
            rows={rows}
            getRowId={(n) => n.id}
            layout="fill"
            onRowAction={open}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            getSubRows={(n) => n.children}
            expandedIds={expandedIds}
            onExpandedChange={setExpanded}
          />
        ) : (
          <Text tone="muted" className="p-4">
            Loading…
          </Text>
        )}
      </Card>
      {tool === 'generate' ? <GenerateBinsPanel onCancel={() => setTool(null)} onDone={reloadBins} /> : null}
      {tool === 'modify' ? <ModifyBinCodesPanel onCancel={() => setTool(null)} onDone={reloadBins} /> : null}
    </>
  );
}
