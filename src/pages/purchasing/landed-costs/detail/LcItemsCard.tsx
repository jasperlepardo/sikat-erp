import { createPortal } from 'react-dom';
import { useState } from 'react';
import {
  Button,
  Card,
  Icon,
  Panel,
  PanelHeader,
  SidePanel,
  Table,
  TableContent,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { formatAmount } from '../../../../services/format';
import { grNumber } from '../../../../services/goodsReceipts';
import { formatDate } from '../../../../services/dates';
import type { LandedCostLine } from '../../../../mocks/landedCosts';
import type { GoodsReceipt, GrLine } from '../../../../mocks/goodsReceipts';
import type { LcSectionProps } from './types';

interface LcItemsCardProps extends LcSectionProps {
  onLinesChange: (lines: LandedCostLine[]) => void;
}

function grLineToLcLine(gr: GoodsReceipt, grLine: GrLine): LandedCostLine {
  return {
    id: `lcl-${crypto.randomUUID().slice(0, 8)}`,
    baseType: 'GRPO',
    baseId: gr.id,
    baseLineId: grLine.id,
    baseDocNo: grNumber(gr),
    itemId: grLine.itemId,
    itemNo: grLine.itemNo,
    description: grLine.name,
    quantity: grLine.quantity,
    uomCode: grLine.uomCode,
    warehouse: grLine.warehouse,
    unitPrice: grLine.unitPrice,
    releaseNo: '',
    projectedCustoms: 0,
    customsValue: 0,
    expenditure: 0,
    allocCostsVal: 0,
    varCosts: 0,
    constCosts: 0,
  };
}

function CopyFromGrpoPanel({
  receipts,
  taken,
  onCopy,
  onCancel,
}: {
  receipts: GoodsReceipt[];
  taken: Set<string>;
  onCopy: (lines: LandedCostLine[]) => void;
  onCancel: () => void;
}) {
  const [selectedGrId, setSelectedGrId] = useState('');
  const [picks, setPicks] = useState<Set<string>>(new Set());

  const selectedGr = receipts.find((r) => r.id === selectedGrId);
  const availableLines = selectedGr ? selectedGr.lines.filter((l) => !taken.has(l.id)) : [];

  const toggle = (lineId: string) => {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const handleCopy = () => {
    if (!selectedGr) return;
    const lines = selectedGr.lines.filter((l) => picks.has(l.id)).map((l) => grLineToLcLine(selectedGr, l));
    onCopy(lines);
  };

  return (
    <SidePanel overlay onOverlayClick={onCancel}>
      <Panel className="flex-1 min-h-0 flex flex-col">
        <PanelHeader
          type="forms"
          icon="content_copy"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          title="Copy from Goods Receipt"
          actions={
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                intent="primary"
                variant="solid"
                size="medium"
                shape="pill"
                disabled={picks.size === 0}
                onClick={handleCopy}
              >
                Copy {picks.size > 0 ? `${picks.size} line${picks.size > 1 ? 's' : ''}` : 'lines'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Text variant="small" weight="medium">Select a goods receipt</Text>
            <div className="flex flex-col gap-0 rounded border overflow-hidden" style={{ borderColor: 'var(--color-border-subtle)' }}>
              {receipts.length === 0 ? (
                <Text tone="muted" className="p-3 text-sm">No open goods receipts.</Text>
              ) : (
                receipts.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="flex flex-col px-3 py-2 text-left text-sm hover:bg-(--color-bg-subtle) transition-colors border-b last:border-b-0"
                    style={{
                      borderColor: 'var(--color-border-subtle)',
                      backgroundColor: selectedGrId === r.id ? 'var(--color-bg-subtle)' : undefined,
                    }}
                    onClick={() => { setSelectedGrId(r.id); setPicks(new Set()); }}
                  >
                    <span className="font-medium">{grNumber(r)}</span>
                    <span className="text-(--color-text-muted) text-xs">{r.vendorName} · {formatDate(r.postingDate)}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedGr && (
            <div className="flex flex-col gap-2">
              <Text variant="small" weight="medium">Lines</Text>
              {availableLines.length === 0 ? (
                <Text tone="muted" className="text-sm">All lines from this receipt are already on the document.</Text>
              ) : (
                <div className="flex flex-col gap-0 rounded border overflow-hidden" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  {availableLines.map((l) => (
                    <label
                      key={l.id}
                      className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-(--color-bg-subtle) transition-colors border-b last:border-b-0"
                      style={{ borderColor: 'var(--color-border-subtle)' }}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={picks.has(l.id)}
                        onChange={() => toggle(l.id)}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{l.itemNo}</span>
                        <span className="text-xs text-(--color-text-muted)">{l.description || l.name} · {l.quantity} {l.uomCode} · {l.warehouse}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel.Body>
      </Panel>
    </SidePanel>
  );
}

export function LcItemsCard({ draft, errors, m, readOnly, onLinesChange }: LcItemsCardProps) {
  const [copying, setCopying] = useState(false);

  const taken = new Set(draft.lines.map((l) => l.baseLineId).filter(Boolean));
  const openReceipts = m.receipts.filter((r) => r.status === 'Open' || r.status === 'Closed');

  const columns: TableColumn<LandedCostLine>[] = [
    { key: 'itemNo', header: 'Item No.', cell: (l) => <TableContent subcopy={l.baseDocNo}>{l.itemNo}</TableContent> },
    { key: 'description', header: 'Description', cell: (l) => l.description || '—' },
    { key: 'quantity', header: 'Qty', cell: (l) => <span className="tabular-nums">{formatAmount(l.quantity)}</span> },
    { key: 'uomCode', header: 'UoM', cell: (l) => l.uomCode },
    { key: 'warehouse', header: 'Whse', cell: (l) => l.warehouse },
    { key: 'unitPrice', header: 'Base price', cell: (l) => <span className="tabular-nums">{formatAmount(l.unitPrice)}</span> },
    {
      key: 'baseValue',
      header: 'Base value',
      cell: (l) => <span className="tabular-nums">{formatAmount(Math.round(l.unitPrice * l.quantity * 100) / 100)}</span>,
    },
    { key: 'allocCostsVal', header: 'Alloc. costs', cell: (l) => <span className="tabular-nums">{formatAmount(l.allocCostsVal)}</span> },
    {
      key: 'whsePrice',
      header: 'Whse price',
      cell: (l) => {
        const base = l.unitPrice * l.quantity + l.allocCostsVal + (draft.customsAffectsInventory ? l.customsValue : 0);
        const whsePrice = l.quantity > 0 ? Math.round((base / l.quantity) * 100) / 100 : 0;
        return <span className="tabular-nums">{formatAmount(whsePrice)}</span>;
      },
    },
    { key: 'projectedCustoms', header: 'Proj. customs', cell: (l) => <span className="tabular-nums">{formatAmount(l.projectedCustoms)}</span> },
    { key: 'customsValue', header: 'Customs val.', cell: (l) => <span className="tabular-nums">{formatAmount(l.customsValue)}</span> },
    { key: 'releaseNo', header: 'Release no.', cell: (l) => l.releaseNo || '—' },
  ];

  return (
    <>
      <Card>
        <Card.Header
          icon={<Icon size={24}>inventory_2</Icon>}
          actions={
            !readOnly ? (
              <Button
                type="button"
                intent="primary"
                variant="outline"
                size="small"
                shape="pill"
                leadingIcon={<Icon size={16}>content_copy</Icon>}
                onClick={() => setCopying(true)}
              >
                Copy from GRPO
              </Button>
            ) : undefined
          }
        >
          Items
        </Card.Header>
        <Card.Content>
          {draft.lines.length === 0 ? (
            <Text tone="muted" className="py-2 text-sm">
              {readOnly ? 'No items.' : 'Copy lines from a goods receipt to allocate costs to.'}
            </Text>
          ) : (
            <div className="overflow-x-auto">
              <Table
                caption="Landed cost lines"
                columns={columns}
                rows={draft.lines}
                getRowId={(l) => l.id}
                layout="fill"
              />
            </div>
          )}
          {errors.lines ? <Text tone="danger" variant="small" className="mt-1">{errors.lines}</Text> : null}
        </Card.Content>
      </Card>

      {copying
        ? createPortal(
            <CopyFromGrpoPanel
              receipts={openReceipts}
              taken={taken}
              onCancel={() => setCopying(false)}
              onCopy={(newLines) => {
                onLinesChange([...draft.lines, ...newLines]);
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
