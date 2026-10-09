import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Icon, Link, Table, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../components/form/fields';
import { useCollection } from '../../../components/form/MasterLookup';
import type { Warehouse } from '../../../mocks/itemMasters';
import { binLocations, binSublevels } from '../../../services/inventoryMasters';
import { listItems } from '../../../services/items';
import { useAsync } from '../../../services/useAsync';
import { useCollectionRows } from '../../../services/useCollectionRows';
import { GenerateBinsPanel, ModifyBinCodesPanel } from './BinToolsPanels';
import { locationColumns, locationTree, type Node } from './LocationsTab';

/** Bins to list items by: an aisle's or shelf's, named for the filter chip. */
export interface BinScope {
  label: string;
  bins: string[];
}

/**
 * A warehouse's bin locations, nested by aisle and shelf, for the main column of its record
 * page. `base` is the Warehouses & Bins page route; bins open on its bin-locations tab. An
 * aisle's or shelf's name shows its items (`onShowItems`); its chevron opens it.
 */
export function WarehouseBins({
  warehouse,
  isNew,
  base,
  onShowItems,
}: {
  warehouse: Warehouse;
  isNew: boolean;
  base: string;
  onShowItems: (scope: BinScope) => void;
}) {
  const navigate = useNavigate();
  const binRows = useCollectionRows(binLocations);
  const sublevels = useCollection(binSublevels) ?? [];
  const items = useAsync(listItems, [binRows.rows]) ?? [];
  const [tool, setTool] = useState<'generate' | 'modify' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[] | null>(null);

  const bins = binRows.rows;
  const own = (bins ?? []).filter((b) => b.warehouse === warehouse.code);
  const aisles: Node[] = bins ? (locationTree([warehouse], bins, sublevels)[0]?.children ?? []) : [];

  // Aisles start open; shelves start closed.
  const expandedIds = expanded ?? aisles.map((n) => n.id);
  const toggle = (id: string) => setExpanded(expandedIds.includes(id) ? expandedIds.filter((x) => x !== id) : [...expandedIds, id]);
  const open = (n: Node) =>
    n.kind === 'bin'
      ? navigate(`${base}/bin-locations/${encodeURIComponent(n.id)}`)
      : n.kind === 'aisle' || n.kind === 'shelf'
        ? onShowItems({ label: n.label, bins: n.bins.map((b) => b.id) })
        : undefined;
  const columns = locationColumns({ open, query: '', sublevels, items, showType: false });
  // "…" on an aisle or shelf opens or closes it.
  const rowAction = (n: Node) => (n.kind === 'bin' ? open(n) : toggle(n.id));

  const picked = own.filter((b) => selected.includes(b.id));
  const setActive = async (active: boolean) => {
    await binRows.setActive(picked, active);
    setSelected([]);
  };
  const reload = () => {
    setTool(null);
    binRows.reload();
  };

  const usesBins = warehouse.type === 'warehouse';
  const title = `Bin locations${own.length ? ` (${own.length})` : ''}`;

  if (isNew || !usesBins) {
    return (
      <Section icon="grid_view" title={title}>
        <Text variant="small" tone="muted">
          {isNew
            ? usesBins
              ? 'Save the warehouse, then add its bins here.'
              : 'Only warehouses use bins.'
            : `Only warehouses use bins, so ${warehouse.code} keeps stock without them.${own.length ? ` Its ${own.length} earlier bin${own.length === 1 ? ' is' : 's are'} kept but not offered.` : ''}`}
        </Text>
      </Section>
    );
  }

  return (
    <>
      <Section
        icon="grid_view"
        title={title}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            {picked.length ? (
              <>
                <Text variant="small" tone="muted">
                  {picked.length} selected
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
            {own.length ? (
              <Button type="button" size="small" variant="ghost" leadingIcon={<Icon size={16}>edit_location_alt</Icon>} onClick={() => setTool('modify')}>
                Modify bin codes
              </Button>
            ) : null}
            <Link
              leadingIcon={<Icon size={20}>add</Icon>}
              onClick={() => navigate(`${base}/bin-locations/new?warehouse=${encodeURIComponent(warehouse.code)}`)}
            >
              New
            </Link>
          </div>
        }
      >
        {bins === undefined ? (
          <Text variant="small" tone="muted">
            Loading…
          </Text>
        ) : own.length ? (
          <Card>
            <Table
              columns={columns}
              rows={aisles}
              getRowId={(n) => n.id}
              onRowAction={rowAction}
              selectable
              selectedIds={selected}
              onSelectionChange={setSelected}
              getSubRows={(n) => n.children}
              expandedIds={expandedIds}
              onExpandedChange={setExpanded}
              layout="scroll"
            />
          </Card>
        ) : (
          <Text variant="small" tone="muted">
            No bins yet. Generate bins creates a whole rack at once; New adds one.
          </Text>
        )}
      </Section>
      {tool === 'generate' ? <GenerateBinsPanel warehouse={warehouse.code} onCancel={() => setTool(null)} onDone={reload} /> : null}
      {tool === 'modify' ? <ModifyBinCodesPanel warehouse={warehouse.code} onCancel={() => setTool(null)} onDone={reload} /> : null}
    </>
  );
}
