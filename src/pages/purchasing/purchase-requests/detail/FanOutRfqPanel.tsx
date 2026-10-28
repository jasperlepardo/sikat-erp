import { useState } from 'react';
import { Badge, Checkbox, Combobox, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { Section } from '../../../../components/form/fields';
import { LineItemText } from '../../../../components/form/LineItemText';
import type { PrLine, PurchaseRequest } from '../../../../mocks/purchaseRequests';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { candidatesOf, lineVendorIds, linesForVendor, openPrLines, vendorOptions } from '../../shared/rfqFromPr';
import type { PrMasters } from './types';
import { cap } from '../../../../components/form/noun';
import { RFQ_NOUN } from '../../paths';

/** One vendor's quotation request: the vendor and the request lines it's sent. */
export interface VendorSend {
  vendorId: string;
  lines: PrLine[];
}

/**
 * Create purchase quotations: the candidate vendors come ticked, each with the open lines whose item it
 * carries. Untick a vendor to skip it, tick or untick lines to override the routing (ask a vendor
 * for an item it isn't linked to, or leave one out). A vendor left with no lines gets no quotation.
 */
export function FanOutRfqPanel({
  pr,
  m,
  sending,
  onCancel,
  onSend,
}: {
  pr: PurchaseRequest;
  m: PrMasters;
  sending: boolean;
  onCancel: () => void;
  onSend: (sends: VendorSend[]) => void;
}) {
  const open = openPrLines(pr);
  const [vendorIds, setVendorIds] = useState(() => candidatesOf(pr, m));
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [picks, setPicks] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(candidatesOf(pr, m).map((id) => [id, linesForVendor(pr, id, m).map((l) => l.id)])),
  );

  const nameOf = (id: string) => m.vendors.find((v) => v.id === id)?.name ?? 'Unknown vendor';
  const ticked = vendorIds.filter((id) => !skipped.has(id));
  const sends = ticked
    .map((vendorId) => ({ vendorId, lines: open.filter((l) => picks[vendorId]?.includes(l.id)) }))
    .filter((s) => s.lines.length);
  const empty = ticked.filter((id) => !sends.some((s) => s.vendorId === id));

  const toggleVendor = (id: string, on: boolean) => {
    const next = new Set(skipped);
    if (on) next.delete(id);
    else next.add(id);
    setSkipped(next);
  };
  const toggleLine = (vendorId: string, lineId: string, on: boolean) => {
    const current = picks[vendorId] ?? [];
    setPicks({ ...picks, [vendorId]: on ? [...current, lineId] : current.filter((x) => x !== lineId) });
  };
  const addVendor = (id: string) => {
    setVendorIds([...vendorIds, id]);
    setPicks({ ...picks, [id]: linesForVendor(pr, id, m).map((l) => l.id) });
  };

  const columns = (vendorId: string): TableColumn<PrLine>[] => [
    {
      key: 'pick',
      header: '',
      cell: (l) => (
        <Checkbox
          aria-label={`Ask ${nameOf(vendorId)} for ${l.itemNo}`}
          checked={picks[vendorId]?.includes(l.id) ?? false}
          onChange={(e) => toggleLine(vendorId, l.id, e.currentTarget.checked)}
        />
      ),
    },
    { key: 'item', header: 'Item', cell: (l) => <LineItemText itemNo={l.itemNo} description={l.description} /> },
    { key: 'openQty', header: 'Quantity', align: 'end', cell: (l) => `${l.openQty} ${l.uomName}` },
    {
      key: 'linked',
      header: 'Carries item',
      cell: (l) =>
        lineVendorIds(l, m).includes(vendorId) ? (
          <Badge size="small" intent="success" variant="outline">Linked</Badge>
        ) : (
          <Text variant="small" tone="muted">Not linked</Text>
        ),
    },
  ];

  const label = sending ? 'Creating…' : `Create ${sends.length === 1 ? `1 ${RFQ_NOUN.one}` : `${sends.length} ${RFQ_NOUN.many}`}`;

  return (
    <EditPanel icon="request_quote" title={cap(RFQ_NOUN.many)} onCancel={onCancel} onDone={() => onSend(sends)} doneLabel={label} doneDisabled={!sends.length || sending}>
      <Section icon="storefront" title="Vendors">
        <div className="flex flex-col gap-2">
          <Text variant="small" tone="muted">
            Each ticked vendor gets its own purchase quotation with the lines ticked under it. Quotes don't reduce the request's open quantities; only the purchase orders you award do.
          </Text>
          <Combobox
            aria-label="Add a vendor"
            placeholder="Add a vendor not yet listed"
            options={vendorOptions(m.vendors, vendorIds)}
            value={null}
            onValueChange={(v) => v && addVendor(v)}
          />
          {empty.length ? (
            <Text variant="small" tone="muted">
              No lines ticked for {empty.map(nameOf).join(', ')}, so {empty.length === 1 ? 'it gets' : 'they get'} no quotation.
            </Text>
          ) : null}
        </div>
      </Section>
      {vendorIds.map((vendorId) => (
        <DataTable
          key={vendorId}
          variant="card"
          icon="local_shipping"
          title={nameOf(vendorId)}
          actions={
            <Checkbox checked={!skipped.has(vendorId)} onChange={(e) => toggleVendor(vendorId, e.currentTarget.checked)}>
              Send
            </Checkbox>
          }
          rows={skipped.has(vendorId) ? [] : open}
          columns={columns(vendorId)}
          getRowId={(l) => l.id}
          unsortable={['pick', 'item', 'openQty', 'linked']}
          noPagination
          empty={<Text variant="small" tone="muted">{skipped.has(vendorId) ? 'Skipped.' : 'No open lines.'}</Text>}
        />
      ))}
    </EditPanel>
  );
}
