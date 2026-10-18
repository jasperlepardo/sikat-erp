import { arNumber, arTotal, listArInvoices } from '../../../services/arInvoices';
import { cachedUntilChange } from '../../../services/store';
import { arCmNumber, arCmTotal, listArCreditMemos } from '../../../services/arCreditMemos';
import { dnNumber, dnTotal, listDeliveries } from '../../../services/deliveries';
import { amountDue, listIncomingPayments, incomingNumber } from '../../../services/incomingPayments';
import { listSalesOrders, soNumber, soTotal } from '../../../services/salesOrders';
import { listSalesReturns, srNumber, srTotal } from '../../../services/salesReturns';
import { listQuotations, qtNumber, qtTotal } from '../../../services/quotations';
import { taxCodes } from '../../../services/masterData';
import { formatAmount } from '../../../services/format';
import { lineage, type LinkedDocument } from '../../purchasing/shared/lineage';
import { coveredLines, type CoveredLine, type DocNode } from '../../purchasing/shared/documentLinks';
import { SO_LIST_PATH } from '../sales-orders/detail/types';
import { AR_LIST_PATH } from '../invoices/detail/types';
import { AR_STATUS_INTENT } from '../invoices/detail/ArInvoiceDetail';
import { DN_LIST_PATH } from '../deliveries/detail/types';
import { DN_STATUS_INTENT } from '../deliveries/detail/DeliveryDetail';
import { RC_LIST_PATH, RC_STATUS_INTENT } from '../payments-received/detail/IncomingPaymentDetail';
import { SO_STATUS_INTENT } from '../sales-orders/detail/SalesOrderDetail';
import { AR_CM_LIST_PATH, ARCM_STATUS_INTENT, SR_LIST_PATH, SR_STATUS_INTENT } from '../returns-and-credits/types';
import { QT_LIST_PATH, QT_STATUS_INTENT } from '../quotations/QuotationList';
import { listJournalEntries, jeNumber, jeTotals } from '../../../services/journalEntries';
import { JE_LIST_PATH, JE_STATUS_INTENT } from '../../accounting/journal/JournalEntryDetail';
import { listBlanketAgreements, baNumber, baTotals } from '../../../services/blanketAgreements';
import { BA_LIST_PATH, BA_STATUS_INTENT } from '../agreements/BlanketAgreementList';

export type SalesDocKind = 'QT' | 'SO' | 'DN' | 'ARINV' | 'RCV' | 'ARCM' | 'SRT' | 'JE' | 'BA';

export type { LinkedDocument, CoveredLine };

const SALES_ORIGIN: Partial<Record<string, SalesDocKind>> = {
  DN: 'DN',
  IN: 'ARINV',
  RC: 'RCV',
  AC: 'ARCM',
  SR: 'SRT',
};

const SOURCES: Record<SalesDocKind, () => Promise<DocNode[]>> = {
  QT: async () => {
    const [quots, codes] = await Promise.all([listQuotations(), taxCodes.list()]);
    return quots.map((q) => ({
      kind: 'QT' as const,
      id: q.id,
      type: 'Quotation',
      number: q.docNum ? qtNumber(q) : q.id,
      href: `${QT_LIST_PATH}/${q.docNum ? qtNumber(q) : q.id}`,
      date: q.postingDate,
      status: q.status,
      intent: QT_STATUS_INTENT[q.status],
      currency: q.currency,
      total: qtTotal(q, codes),
      partnerId: q.customerId,
      items: coveredLines(q.lines),
      bases: [],
    }));
  },

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
      partnerId: so.customerId,
      items: coveredLines(so.lines),
      bases: [
        ...(so.baseQuotationId ? [{ kind: 'QT' as const, id: so.baseQuotationId, lines: [] }] : []),
        ...[...new Set(so.lines.map((l) => l.agreementId).filter(Boolean))].map((id) => ({
          kind: 'BA' as const,
          id,
          lines: [] as CoveredLine[],
        })),
      ],
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
      partnerId: dn.customerId,
      items: coveredLines(dn.lines),
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
      partnerId: ar.customerId,
      items: coveredLines(ar.lines),
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
      partnerId: p.customerId,
      items: [],
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
      partnerId: m.customerId,
      items: coveredLines(m.lines),
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
      partnerId: r.customerId,
      items: coveredLines(r.lines),
      bases: [...new Set(r.lines.filter((l) => l.baseId).map((l) => l.baseId))].map((id) => ({
        kind: 'DN' as const,
        id,
        lines: r.lines.filter((l) => l.baseId === id) as CoveredLine[],
      })),
      targets: r.replacementDnId ? [{ kind: 'DN' as const, id: r.replacementDnId, lines: [] as CoveredLine[], via: 'replacement' }] : [],
    }));
  },

  JE: async () => {
    const jes = await listJournalEntries();
    return jes
      .filter((je) => je.originId && SALES_ORIGIN[je.origin])
      .map((je) => ({
        kind: 'JE' as const,
        id: je.id,
        type: je.reverses ? 'Reversal entry' : 'Journal entry',
        number: jeNumber(je),
        href: `${JE_LIST_PATH}/${je.id}`,
        date: je.postingDate,
        status: je.reverses ? 'Reversal' : je.status,
        intent: JE_STATUS_INTENT[je.status],
        currency: 'PHP',
        total: jeTotals(je.lines).debit,
        partnerId: '',
        items: [],
        bases: [{ kind: SALES_ORIGIN[je.origin]!, id: je.originId, lines: [] }],
      }));
  },

  BA: async () => {
    const bas = await listBlanketAgreements();
    return bas.map((ba) => ({
      kind: 'BA' as const,
      id: ba.id,
      type: 'Blanket agreement',
      number: ba.docNum ? baNumber(ba) : ba.id,
      href: `${BA_LIST_PATH}/${ba.docNum ? baNumber(ba) : ba.id}`,
      date: ba.startDate,
      status: ba.status,
      intent: BA_STATUS_INTENT[ba.status],
      currency: ba.currency,
      total: baTotals(ba).plannedTotal,
      partnerId: ba.customerId,
      items: [],
      bases: [],
    }));
  },
};

/**
 * Every sales document, as graph nodes. Built once and shared until any collection changes (the
 * Activity tabs, document flows and CRM › Activities all ask for it), so treat the nodes as read-only.
 */
const allSalesDocNodes = cachedUntilChange(async () => (await Promise.all(Object.values(SOURCES).map((load) => load()))).flat() as DocNode[]);

export async function salesDocNodes(): Promise<DocNode[]> {
  return [...(await allSalesDocNodes())];
}

export async function linkedSalesDocuments(kind: SalesDocKind, id: string): Promise<LinkedDocument[]> {
  return lineage(await salesDocNodes(), kind, id);
}
