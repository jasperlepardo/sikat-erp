import { useNavigate } from 'react-router';
import { Badge, Card, Icon, Panel, Table, TableLink, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DOC_TYPE_LABEL, type DocType } from '../../mocks/approvalRules';
import { useAsync } from '../../services/useAsync';
import { approverName } from '../../services/approvalRules';
import { formatDate } from '../../services/dates';
import { listRfqs, rfqNumber } from '../../services/rfqs';
import { listPurchaseOrders, poNumber } from '../../services/purchaseOrders';
import { listGoodsReceipts, grNumber } from '../../services/goodsReceipts';
import { listApInvoices, apNumber } from '../../services/apInvoices';
import { listGoodsReturns, returnNumber } from '../../services/goodsReturns';
import { listCreditMemos, memoNumber } from '../../services/apCreditMemos';
import { listDownPayments, dprNumber } from '../../services/apDownPayments';
import { listPayments, paymentNumber } from '../../services/outgoingPayments';
import { listQuotations, qtNumber } from '../../services/quotations';
import { listSalesOrders, soNumber } from '../../services/salesOrders';
import { listDeliveries, dnNumber } from '../../services/deliveries';
import { listArInvoices, arNumber } from '../../services/arInvoices';
import { listSalesReturns, srNumber } from '../../services/salesReturns';
import { listArCreditMemos, arCmNumber } from '../../services/arCreditMemos';
import { listIncomingPayments, incomingNumber } from '../../services/incomingPayments';

import { PO_LIST_PATH } from '../purchasing/orders/detail/PurchaseOrderDetail';
import { RFQ_LIST_PATH } from '../purchasing/rfqs/detail/RfqDetail';
import { GR_LIST_PATH } from '../purchasing/receipts/detail/GoodsReceiptDetail';
import { AP_LIST_PATH } from '../purchasing/invoices/detail/ApInvoiceDetail';
import { RETURN_LIST_PATH, MEMO_LIST_PATH } from '../purchasing/returns/types';
import { DPR_LIST_PATH } from '../purchasing/down-payments/DprDetail';
import { PAYMENT_LIST_PATH } from '../purchasing/payments/detail/PaymentDetail';
import { QT_LIST_PATH } from '../sales/quotations/QuotationList';
import { SO_LIST_PATH } from '../sales/orders/detail/types';
import { DN_LIST_PATH } from '../sales/deliveries/detail/types';
import { AR_LIST_PATH } from '../sales/invoices/detail/types';
import { SR_LIST_PATH, AR_CM_LIST_PATH } from '../sales/returns/types';
import { RC_LIST_PATH } from '../sales/payments/detail/IncomingPaymentDetail';

interface PendingItem {
  id: string;
  docType: DocType;
  number: string;
  partnerName: string;
  postingDate: string;
  path: string;
}

const PURCHASING_TYPES: DocType[] = ['RFQ', 'PO', 'GRPO', 'APINV', 'GRET', 'CM', 'DPR', 'PMT'];
const SALES_TYPES: DocType[] = ['QT', 'SO', 'DN', 'ARINV', 'SR', 'ARCM', 'RC'];

export function ApprovalsPage() {
  const navigate = useNavigate();

  const data = useAsync(() => Promise.all([
    listRfqs(), listPurchaseOrders(), listGoodsReceipts(), listApInvoices(),
    listGoodsReturns(), listCreditMemos(), listDownPayments(), listPayments(),
    listQuotations(), listSalesOrders(), listDeliveries(), listArInvoices(),
    listSalesReturns(), listArCreditMemos(), listIncomingPayments(),
  ]), []);

  const pending: PendingItem[] = [];

  if (data) {
    const [rfqs, pos, grs, apis, grets, cms, dprs, pmts, qts, sos, dns, aris, srs, arcms, rcs] = data;

    const push = (docType: DocType, items: Array<{ id: string; seriesId: string; status: string; docNum: number; postingDate: string; vendorName?: string; customerName?: string; payeeName?: string }>, numFn: (d: { seriesId: string; docNum: number; postingDate: string }) => string, basePath: string) => {
      for (const d of items) {
        if (d.status !== 'Not Confirmed') continue;
        const num = d.docNum ? numFn(d) : 'Draft';
        pending.push({
          id: d.id,
          docType,
          number: num,
          partnerName: d.vendorName ?? d.customerName ?? d.payeeName ?? '—',
          postingDate: d.postingDate,
          path: `${basePath}/${d.docNum ? num : d.id}`,
        });
      }
    };

    push('RFQ', rfqs, rfqNumber, RFQ_LIST_PATH);
    push('PO', pos, poNumber, PO_LIST_PATH);
    push('GRPO', grs, grNumber, GR_LIST_PATH);
    push('APINV', apis, apNumber, AP_LIST_PATH);
    push('GRET', grets, returnNumber, `${RETURN_LIST_PATH}`);
    push('CM', cms, memoNumber, MEMO_LIST_PATH);
    push('DPR', dprs, dprNumber, DPR_LIST_PATH);
    push('PMT', pmts, paymentNumber, PAYMENT_LIST_PATH);
    push('QT', qts, qtNumber, QT_LIST_PATH);
    push('SO', sos, soNumber, SO_LIST_PATH);
    push('DN', dns, dnNumber, DN_LIST_PATH);
    push('ARINV', aris, arNumber, AR_LIST_PATH);
    push('SR', srs, srNumber, SR_LIST_PATH);
    push('ARCM', arcms, arCmNumber, AR_CM_LIST_PATH);
    push('RC', rcs, incomingNumber, RC_LIST_PATH);
  }

  pending.sort((a, b) => b.postingDate.localeCompare(a.postingDate));

  const purchasing = pending.filter((p) => PURCHASING_TYPES.includes(p.docType));
  const sales = pending.filter((p) => SALES_TYPES.includes(p.docType));

  const columns: TableColumn<PendingItem>[] = [
    {
      key: 'docType',
      header: 'Document',
      cell: (p) => (
        <div>
          <Text weight="medium">{DOC_TYPE_LABEL[p.docType]}</Text>
          <Text variant="small" tone="muted">{p.number}</Text>
        </div>
      ),
    },
    { key: 'partner', header: 'Partner', cell: (p) => <TableLink onClick={() => navigate(p.path)}>{p.partnerName}</TableLink> },
    { key: 'date', header: 'Date', cell: (p) => formatDate(p.postingDate) },
    {
      key: 'approver',
      header: 'Approver',
      cell: (p) => {
        const name = approverName(p.docType);
        return name ? <Text>{name}</Text> : <Text tone="muted">—</Text>;
      },
    },
    {
      key: 'action',
      header: '',
      cell: (p) => (
        <TableLink onClick={() => navigate(p.path)}>
          <span className="flex items-center gap-1">
            <Icon size={14}>open_in_new</Icon> Open
          </span>
        </TableLink>
      ),
    },
  ];

  const section = (title: string, items: PendingItem[]) => (
    <Card key={title}>
      <Card.Header icon={<Icon size={24}>{title === 'Purchasing' ? 'shopping_cart' : 'sell'}</Icon>}>
        {title}
        {items.length > 0 && (
          <Badge size="small" intent="warning" className="ml-2">{items.length}</Badge>
        )}
      </Card.Header>
      <Card.Content>
        {items.length === 0 ? (
          <Text tone="muted" className="py-4 text-center block">No pending approvals.</Text>
        ) : (
          <Table rows={items} columns={columns} getRowId={(p) => p.id} layout="scroll" />
        )}
      </Card.Content>
    </Card>
  );

  const total = pending.length;

  return (
    <Panel className="flex-1">
      <Panel.Body>
        <div className="flex items-center gap-3 mb-4">
          <Icon size={28}>verified</Icon>
          <div>
            <Text as="h1" variant="h2" weight="semibold">Pending Approvals</Text>
            {data ? (
              <Text variant="small" tone="muted">
                {total === 0 ? 'Nothing awaiting approval.' : `${total} document${total === 1 ? '' : 's'} awaiting approval`}
              </Text>
            ) : (
              <Text variant="small" tone="muted">Loading…</Text>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {section('Purchasing', purchasing)}
          {section('Sales', sales)}
        </div>
      </Panel.Body>
    </Panel>
  );
}
