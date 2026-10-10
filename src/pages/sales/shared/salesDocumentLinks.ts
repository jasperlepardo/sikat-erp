import { arNumber, arTotal, listArInvoices } from '../../../services/arInvoices';
import { arCmNumber, arCmTotal, listArCreditMemos } from '../../../services/arCreditMemos';
import { dnNumber, dnTotal, listDeliveries } from '../../../services/deliveries';
import { amountDue, listIncomingPayments, incomingNumber } from '../../../services/incomingPayments';
import { listSalesOrders, soNumber, soTotal } from '../../../services/salesOrders';
import { listSalesReturns, srNumber, srTotal } from '../../../services/salesReturns';
import { taxCodes } from '../../../services/masterData';
import { formatAmount } from '../../../services/format';
import { lineage, type LinkedDocument } from '../../purchasing/shared/lineage';
import type { CoveredLine, DocNode } from '../../purchasing/shared/documentLinks';
import { SO_LIST_PATH } from '../orders/detail/types';
import { AR_LIST_PATH } from '../invoices/detail/types';
import { AR_STATUS_INTENT } from '../invoices/detail/ArInvoiceDetail';
import { DN_LIST_PATH } from '../deliveries/detail/types';
import { DN_STATUS_INTENT } from '../deliveries/detail/DeliveryDetail';
import { RC_LIST_PATH, RC_STATUS_INTENT } from '../payments/detail/IncomingPaymentDetail';
import { SO_STATUS_INTENT } from '../orders/detail/SalesOrderDetail';
import { AR_CM_LIST_PATH, ARCM_STATUS_INTENT, SR_LIST_PATH, SR_STATUS_INTENT } from '../returns/types';

export type SalesDocKind = 'SO' | 'DN' | 'ARINV' | 'RCV' | 'ARCM' | 'SRT';

export type { LinkedDocument, CoveredLine };

const SOURCES: Record<SalesDocKind, () => Promise<DocNode[]>> = {
  SO: async () => {
    const [orders, codes] = await Promise.all([listSalesOrders(), taxCodes.list()]);
    return orders.map((so) => ({
      kind: 'SO' as const,
      id: so.id,
      type: 'Sales order',
      number: soNumber(so),
      href: `${SO_LIST_PATH}/${so.id}`,
      date: so.postingDate,
      status: so.status,
      intent: SO_STATUS_INTENT[so.status],
      currency: so.currency,
      total: soTotal(so, codes),
      bases: [],
    }));
  },

  DN: async () => {
    const [deliveries, codes] = await Promise.all([listDeliveries(), taxCodes.list()]);
    return deliveries.map((dn) => ({
      kind: 'DN' as const,
      id: dn.id,
      type: 'Delivery',
      number: dnNumber(dn),
      href: `${DN_LIST_PATH}/${dn.id}`,
      date: dn.postingDate,
      status: dn.status,
      intent: DN_STATUS_INTENT[dn.status],
      currency: dn.currency,
      total: dnTotal(dn, codes),
      bases: [...new Set(dn.lines.map((l) => l.baseId).filter(Boolean))].map((soId) => ({
        kind: 'SO' as const,
        id: soId,
        lines: dn.lines.filter((l) => l.baseId === soId) as CoveredLine[],
      })),
    }));
  },

  ARINV: async () => {
    const [invoices, codes] = await Promise.all([listArInvoices(), taxCodes.list()]);
    return invoices.map((ar) => ({
      kind: 'ARINV' as const,
      id: ar.id,
      type: ar.seriesId === 'ars-or' ? 'Official Receipt' : 'Sales Invoice',
      number: arNumber(ar),
      href: `${AR_LIST_PATH}/${ar.id}`,
      date: ar.postingDate,
      status: ar.status,
      intent: AR_STATUS_INTENT[ar.status],
      currency: ar.currency,
      total: arTotal(ar, codes),
      bases: [
        ...[...new Map(ar.lines.filter((l) => l.baseType).map((l) => [`${l.baseType}:${l.baseId}`, l])).values()].map((b) => ({
          kind: (b.baseType === 'DN' ? 'DN' : 'SO') as SalesDocKind,
          id: b.baseId,
          lines: ar.lines.filter((l) => l.baseType === b.baseType && l.baseId === b.baseId) as CoveredLine[],
        })),
      ],
    }));
  },

  RCV: async () => {
    const payments = await listIncomingPayments();
    return payments.map((p) => ({
      kind: 'RCV' as const,
      id: p.id,
      type: 'Incoming payment',
      number: incomingNumber(p),
      href: `${RC_LIST_PATH}/${p.id}`,
      date: p.postingDate,
      status: p.status,
      intent: RC_STATUS_INTENT[p.status],
      currency: p.currency,
      total: amountDue(p),
      bases: p.rows
        .filter((r) => r.selected && r.amount > 0)
        .map((r) => ({ kind: 'ARINV' as const, id: r.invoiceId, lines: [], note: `Collected ${p.currency} ${formatAmount(r.amount)}` })),
    }));
  },

  ARCM: async () => {
    const [memos, codes] = await Promise.all([listArCreditMemos(), taxCodes.list()]);
    return memos.map((m) => ({
      kind: 'ARCM' as const,
      id: m.id,
      type: 'A/R credit memo',
      number: arCmNumber(m),
      href: `${AR_CM_LIST_PATH}/${arCmNumber(m)}`,
      date: m.postingDate,
      status: m.status,
      intent: ARCM_STATUS_INTENT[m.status],
      currency: m.currency,
      total: arCmTotal(m, codes),
      bases: [
        ...[...new Set(m.lines.filter((l) => l.invoiceId).map((l) => l.invoiceId))].map((id) => ({
          kind: 'ARINV' as const,
          id,
          lines: [] as CoveredLine[],
        })),
        ...[...new Set(m.lines.filter((l) => l.baseType === 'SRT' && l.baseId).map((l) => l.baseId))].map((id) => ({
          kind: 'SRT' as const,
          id,
          lines: m.lines.filter((l) => l.baseType === 'SRT' && l.baseId === id) as CoveredLine[],
        })),
      ],
    }));
  },

  SRT: async () => {
    const [returns, codes] = await Promise.all([listSalesReturns(), taxCodes.list()]);
    return returns.map((r) => ({
      kind: 'SRT' as const,
      id: r.id,
      type: 'Sales return',
      number: srNumber(r),
      href: `${SR_LIST_PATH}/${r.docNum ? srNumber(r) : r.id}`,
      date: r.postingDate,
      status: r.status,
      intent: SR_STATUS_INTENT[r.status],
      currency: r.currency,
      total: srTotal(r, codes),
      bases: [...new Set(r.lines.filter((l) => l.baseId).map((l) => l.baseId))].map((id) => ({
        kind: 'DN' as const,
        id,
        lines: r.lines.filter((l) => l.baseId === id) as CoveredLine[],
      })),
    }));
  },
};

export async function linkedSalesDocuments(kind: SalesDocKind, id: string): Promise<LinkedDocument[]> {
  const nodes = (await Promise.all(Object.values(SOURCES).map((load) => load()))).flat() as DocNode[];
  return lineage(nodes, kind, id);
}
