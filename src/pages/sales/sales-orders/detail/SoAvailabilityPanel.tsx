import type { CSSProperties } from 'react';
import { Button, Icon, IconButton, Panel, SidePanel, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../../components/form/PageHeader';
import { DataTable } from '../../../../components/form/DataTable';
import { Section } from '../../../../components/form/fields';
import { LineItemText } from '../../../../components/form/LineItemText';
import type { Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { Shortage } from './types';

/** One suggested inter-warehouse move: what leaves a source warehouse, and for which destination. */
export interface TransferGroup {
  warehouse: string;
  rows: { item: Item; destWarehouse: string; qty: number }[];
}
/** One suggested purchase: a vendor and the short lines they can supply. */
export interface VendorGroup {
  vendorId: string;
  vendor?: Partner;
  rows: Shortage[];
}

/**
 * The availability check raised when a sales order's lines need more than their warehouse holds free.
 * Shows what's on hand across every warehouse, then routes to the two fixes — move stock in from
 * another warehouse (a transfer request) or buy the shortfall (a purchase order) — or continue and
 * save the order short. Create actions save the order first, so the new document references a real number.
 */
export function SoAvailabilityPanel({
  short,
  byVendor,
  bySource,
  warehouseName,
  continueLabel,
  busy,
  onPurchase,
  onTransfer,
  onContinue,
  onClose,
}: {
  short: Shortage[];
  byVendor: VendorGroup[];
  bySource: TransferGroup[];
  warehouseName: (code: string) => string;
  continueLabel: string;
  busy: boolean;
  onPurchase: (vendorId: string, rows: Shortage[]) => void;
  onTransfer: (warehouse: string, rows: TransferGroup['rows']) => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  const columns: TableColumn<Shortage>[] = [
    { key: 'item', header: 'Item', cell: (s) => <LineItemText itemNo={s.item.itemNo} description={s.item.name} /> },
    { key: 'warehouse', header: 'Needed in', cell: (s) => warehouseName(s.warehouse) },
    { key: 'need', header: 'Need', align: 'end', cell: (s) => `${s.need} ${s.item.inventoryUom}` },
    { key: 'available', header: 'Here', align: 'end', cell: (s) => Math.max(0, s.available) },
    { key: 'ordered', header: 'On order', align: 'end', cell: (s) => s.ordered || '—' },
    { key: 'short', header: 'Short', align: 'end', cell: (s) => <Text tone="danger">{s.short}</Text> },
    {
      key: 'elsewhere',
      header: 'In other warehouses',
      cell: (s) => {
        if (!s.elsewhere.length) return <Text tone="muted">none</Text>;
        return s.elsewhere.map((e) => `${warehouseName(e.warehouse)} ${e.available}`).join(', ');
      },
    },
  ];

  return (
    <SidePanel overlay onOverlayClick={onClose} style={{ '--sikat-side-panel-width': '820px' } as CSSProperties}>
      <PageHeader
        variant="plain"
        icon="inventory"
        title="Availability check"
        actions={
          <>
            <IconButton intent="default" variant="link" label="Close" onClick={onClose}>
              <Icon size={20}>close</Icon>
            </IconButton>
            <Button type="button" intent="white" variant="solid" shape="pill" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" intent="primary" variant="solid" shape="pill" disabled={busy} onClick={onContinue}>
              {continueLabel}
            </Button>
          </>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <Text variant="small" tone="muted">
          Some lines need more than their warehouse has free. Move stock in from another warehouse, buy the shortfall, or continue and save the order short.
        </Text>
        <DataTable
          variant="card"
          icon="warning"
          title="Short lines"
          rows={short}
          columns={columns}
          getRowId={(s) => `${s.item.id}@${s.warehouse}`}
          unsortable={['item', 'warehouse', 'need', 'available', 'ordered', 'short', 'elsewhere']}
          noPagination
          empty={<Text variant="small" tone="muted">Nothing short.</Text>}
        />

        {bySource.length ? (
          <Section icon="move_up" title="Move stock in">
            <div className="flex flex-col gap-2">
              {bySource.map(({ warehouse, rows }) => (
                <div key={warehouse} className="flex items-center justify-between gap-3">
                  <Text variant="small">
                    From {warehouseName(warehouse)}: {rows.map((r) => `${r.qty} ${r.item.inventoryUom} ${r.item.itemNo}`).join(', ')}
                  </Text>
                  <Button type="button" intent="primary" variant="outline" shape="pill" disabled={busy} onClick={() => onTransfer(warehouse, rows)}>
                    Create stock transfer
                  </Button>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {byVendor.length ? (
          <Section icon="add_shopping_cart" title="Buy the shortfall">
            <div className="flex flex-col gap-2">
              {byVendor.map(({ vendorId, vendor, rows }) => (
                <div key={vendorId || 'none'} className="flex items-center justify-between gap-3">
                  <Text variant="small">
                    {vendor ? vendor.name : 'No preferred vendor'}: {rows.map((r) => `${r.toOrder} ${r.item.inventoryUom} ${r.item.itemNo}`).join(', ')}
                  </Text>
                  <Button type="button" intent="primary" variant="outline" shape="pill" disabled={busy} onClick={() => onPurchase(vendorId, rows)}>
                    Create purchase order
                  </Button>
                </div>
              ))}
            </div>
          </Section>
        ) : null}
      </Panel.Body>
    </SidePanel>
  );
}
