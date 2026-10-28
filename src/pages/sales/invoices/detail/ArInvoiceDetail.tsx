import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { createPortal } from 'react-dom';
import { Alert, Badge, Form, Panel, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { type Errors } from '../../../../components/form/fields';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions, docMode } from '../../../../components/form/DetailActions';
import { PageHeader } from '../../../../components/form/PageHeader';
import { isApprover, needsApproval } from '../../../../services/approval';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../../mocks/address';
import { OR_SERIES_ID, blankArInvoice, type ArInvoice } from '../../../../mocks/arInvoices';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import {
  ArPostError,
  addArInvoice,
  recallArInvoice,
  arNumber,
  arTotals,
  arWithholding,
  balanceDue,
  cancelArInvoice,
  closeArInvoice,
  customerWithholds,
  getArInvoice,
  listArInvoices,
  saveArDraft,
  saveArNotes,
} from '../../../../services/arInvoices';
import { loadCurrentCompany } from '../../../../services/companies';
import { todayISO } from '../../../../services/dates';
import type { Partner } from '../../../../mocks/partners';
import { recalcLineTaxes } from '../../../../services/taxRecalc';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { listDeliveries, dnNumber } from '../../../../services/deliveries';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { controlAccountOf } from '../../../../services/journalEntries';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { termDays } from '../../../../services/purchaseOrders';
import { logRejection } from '../../../../services/approvalRules';
import { listSalesOrders, openQty, soDueDate, soNumber } from '../../../../services/salesOrders';
import { soSeries } from '../../../../services/allSeries';
import { ALL_CURRENCIES, proposedTaxCode } from '../../sales-orders/detail/types';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { CopyPanel, type CopySourceType } from '../../../purchasing/shared/CopyPanel';
import { invoiceDoc, type CopyPick } from '../../shared/invoiceDoc';
import { ArDatesCard } from './ArDatesCard';
import { ArSettingsCard } from './ArSettingsCard';
import { BpChannelCard } from '../../shared/BpChannelCard';
import { ArShipmentCard } from './ArShipmentCard';
import { ArAssignmentCard } from './ArAssignmentCard';
import { ArInstallmentsCard } from './ArInstallmentsCard';
import { InvoiceCustomerDetailsPanel } from '../../shared/InvoiceCustomerDetailsPanel';
import { CustomerCard } from '../../shared/CustomerCard';
import { SalesTotalsFooter } from '../../shared/TotalsFooter';
import { ReferencesTable } from '../../../purchasing/shared/ReferencesTable';
import { arLineFromDelivery, arLineFromOrder, buildArContext, type ArContext, type ArDraft, type ArMasters } from './types';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { neighbours, NotFound, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { AR_CM_LIST_PATH, AR_LIST_PATH, AR_NOUN, AR_STATUS_INTENT } from '../../paths';

/** Where a problem's field is: the lines, or the customer details panel (payment and accounting). */
type TabId = 'contents' | 'accounting';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', accounting: 'Customer details' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

function validate(d: ArDraft, ctx: ArContext, m: ArMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(d.dueDate, 'header', 'dueDate', 'Due date is required.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.controlAccount, 'accounting', 'controlAccount', 'Pick the control account.');
  need(d.installments >= 1 && Number.isInteger(d.installments), 'accounting', 'installments', 'Installments must be a whole number, 1 or more.');
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a delivery or sales order.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
    if (d.docType === 'Service') {
      need(l.description.trim(), 'contents', `line:${l.id}:description`, `${n}: describe the service.`);
      need(l.glAccount, 'contents', `line:${l.id}:glAccount`, `${n}: pick the revenue account.`);
      continue;
    }
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(item.salesItem, 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't a sales item.`);
    need(l.baseId || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${d.postingDate}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(!item.inventoryItem || l.baseType === 'DN' || l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse it ships from.`);
  }
  return problems;
}

export function ArInvoiceDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <ArInvoiceForm key={id === 'new' ? location.key : id} />;
}

function ArInvoiceForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state as { fromDelivery?: string; fromOrder?: string; lineFilter?: 'goods' | 'services' } | null;

  const arApproved = !needsApproval('ARINV');
  const [draft, setDraft] = useState<ArDraft | null | undefined>(isNew ? { ...blankArInvoice(todayISO(), CURRENT_USER_ID), approved: arApproved } : undefined);
  const [m, setM] = useState<ArMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${AR_LIST_PATH}/${id}`, tabParam);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const reject = useReject();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('customer'), listItems(), loadInventoryMasters(), companyTax.list(), taxCodes.list(), taxGroups.list(), withholdingTaxes.list(),
      withholdingGroups.list(), currencies.list(), exchangeRates.list(), accounts.list(), loadCurrentCompany(), listSalesOrders(), listDeliveries(), soSeries.list(),
    ]).then(([customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, accts, ours, orders, deliveries, series]) => {
      if (cancelled) return;
      const masters: ArMasters = { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, accounts: accts, company: ours, orders, deliveries, soSeries: series };
      setM(masters);
      // From a delivery's or order's "Copy to A/R invoice": every open line at its open quantity.
      if (!isNew) return;
      const dn = from?.fromDelivery && deliveries.find((d) => d.id === from.fromDelivery);
      const so = from?.fromOrder && orders.find((o) => o.id === from.fromOrder);
      if (dn) setDraft((d) => d && copyLines(d, { kind: 'DN', doc: dn }, dn.lines.filter((l) => l.quantity > l.invoicedQty).map((l) => ({ lineId: l.id, qty: l.quantity - l.invoicedQty })), masters));
      else if (so) {
        const lineFilter = from?.lineFilter;
        const picks = so.lines
          .filter((l) => {
            if (openQty(l) <= 0) return false;
            if (!lineFilter) return true;
            const isInventory = masters.items.find((i) => i.id === l.itemId)?.inventoryItem ?? false;
            return lineFilter === 'goods' ? isInventory : !isInventory;
          })
          .map((l) => ({ lineId: l.id, qty: openQty(l) }));
        setDraft((d) => {
          if (!d) return d;
          const base = copyLines(d, { kind: 'SO', doc: so }, picks, masters);
          if (lineFilter === 'services') return { ...base, docType: 'Service' as const, seriesId: OR_SERIES_ID };
          return base;
        });
      }
    });
    if (!isNew && id) {
      getArInvoice(id).then((a) => !cancelled && setDraft(a ?? null));
      listArInvoices().then((all) => !cancelled && setSiblings(siblingKeys(all, arNumber)));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? `New ${AR_NOUN.one}` : draft.status === 'Draft' ? `Draft ${AR_NOUN.one}` : arNumber(draft)) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading {AR_NOUN.one}…</Text>;
  if (draft === null) return <NotFound icon="receipt" title="A/R invoice not found" backTo={AR_LIST_PATH} backLabel={`Back to ${AR_NOUN.many}`} />;

  const ctx = buildArContext(draft, m);
  const { customer } = ctx;
  const ro = ctx.readOnly;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = arTotals(draft, ctx.rateOf, docCurrency?.rounding);
  const withholding = arWithholding(draft, customer, m.items, ctx.rateOf);
  const wtax = Math.round(withholding.reduce((n, w) => n + w.amount, 0) * 100) / 100;
  const balance = balanceDue(totals.total, wtax, draft.appliedAmount);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? arNumber(draft as ArInvoice) : draft.id));

  /** Tax codes re-proposed for the customer and date, except ones set by hand or copied from a base document. */
  const retax = (lines: ArDraft['lines'], c: Partner | undefined, date: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, c, m, date) : '';
    });
  const update = (patch: Partial<ArDraft>) => {
    const next = { ...draft, ...patch };
    if (!ro && patch.postingDate !== undefined && patch.postingDate !== draft.postingDate) next.lines = retax(next.lines, customer, next.postingDate);
    setDraft(next);
  };

  /** Copy lines from a delivery or order; the header follows the first one copied. */
  function copyLines(d: ArDraft, src: CopyPick, picks: { lineId: string; qty: number }[], masters: ArMasters): ArDraft {
    const c = masters.customers.find((x) => x.id === src.doc.customerId);
    const liable = customerWithholds(c);
    const added =
      src.kind === 'DN'
        ? picks.map((p) => arLineFromDelivery(src.doc, src.doc.lines.find((l) => l.id === p.lineId)!, p.qty, liable))
        : picks.map((p) => arLineFromOrder(src.doc, src.doc.lines.find((l) => l.id === p.lineId)!, p.qty, liable));
    const first = !d.lines.some((l) => l.baseId);
    const s = src.doc;
    const header: Partial<ArDraft> = first
      ? {
          customerId: s.customerId,
          customerCode: s.customerCode,
          customerName: s.customerName,
          contactId: s.contactId,
          customerRef: s.customerRef,
          currency: s.currency,
          shipTo: s.shipTo,
          billTo: s.billTo,
          shippingType: s.shippingType,
          language: s.language,
          bpChannelName: s.bpChannelName,
          bpChannelContact: s.bpChannelContact,
          projectId: s.projectId,
          paymentTermId: s.paymentTermId,
          paymentMethod: s.paymentMethod,
          indicator: s.indicator,
          federalTaxId: s.federalTaxId,
          salesEmployeeId: s.salesEmployeeId,
          discountPct: s.discountPct,
          freightTaxCode: s.freightTaxCode,
          rounding: s.rounding,
          dueMonths: s.dueMonths,
          dueDays: s.dueDays,
          cashDiscountDays: s.cashDiscountDays,
          dueDate: soDueDate(d.postingDate, termDays(s.paymentTermId), s.dueMonths, s.dueDays),
          controlAccount: c ? controlAccountOf(c) : '1120',
          journalRemark: defaultJournalRemark('ar-invoices', { entityCode: s.customerCode, entityName: s.customerName }),
          docType: src.kind === 'SO' ? src.doc.docType : 'Item',
          ...(src.kind === 'DN' ? { trackingNo: src.doc.trackingNo } : {}),
        }
      : {};
    const orderNo = src.kind === 'SO' ? soNumber(src.doc) : src.doc.orderNumber;
    const numbers = [...new Set([...d.orderNumber.split(', ').filter(Boolean), ...orderNo.split(', ').filter(Boolean)])].join(', ');
    return { ...d, ...header, orderNumber: numbers, lines: [...d.lines.filter((l) => l.itemId || l.description), ...added] };
  }

  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    if (!c) return update({ customerId: '', customerCode: '', customerName: '', contactId: '' });
    const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
    const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? bill;
    const liable = customerWithholds(c);
    update({
      customerId: c.id,
      customerCode: c.code,
      customerName: c.name,
      contactId: c.defaultContactId,
      currency: c.currency === ALL_CURRENCIES ? 'PHP' : c.currency,
      paymentTermId: c.customerPaymentTermId,
      paymentMethod: c.defaultPaymentMethod || draft.paymentMethod,
      dueDate: soDueDate(draft.postingDate, termDays(c.customerPaymentTermId)),
      projectId: c.projectId,
      shippingType: c.shippingType,
      federalTaxId: c.tin,
      salesEmployeeId: c.salesEmployeeId,
      discountPct: c.totalDiscount || 0,
      controlAccount: controlAccountOf(c),
      billTo: bill ? formatAddress(bill, c.name) : '',
      shipTo: ship ? formatAddress(ship, c.name) : '',
      journalRemark: defaultJournalRemark('ar-invoices', { entityCode: c.code, entityName: c.name }),
      lines: retax(draft.lines, c, draft.postingDate).map((l) => ({ ...l, wtaxLiable: liable })),
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<ArDraft> = {}) => {
    e?.preventDefault();
    // Added: only remarks and attachments save, unless this is approving it (which posts it).
    if (ro && !overrides.approved) {
      setSaving(true);
      const a = await saveArNotes(draft.id!, { remarks: draft.remarks, attachments: draft.attachments });
      setSaving(false);
      return navigate(AR_LIST_PATH, { state: { notice: `Remarks saved on invoice ${arNumber(a)}.` } });
    }
    const doc: ArDraft = { ...draft, ...overrides, lines: draft.lines.filter((l) => (draft.docType === 'Service' ? l.description.trim() || l.unitPrice : l.itemId)) };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, ctx, m, effectiveDraft);
    setProblems(found);
    if (found.length) {
      // Payment and accounting fields live in the customer panel.
      if (found.some((p) => p.tab === 'accounting') && customer) setCustomerDetailsOpen(true);
      return;
    }
    setSaving(true);
    try {
      const a = effectiveDraft ? await saveArDraft(doc) : await addArInvoice(doc, ctx.fx, { codes: m.tax.codes, withholding: arWithholding(doc, customer, m.items, ctx.rateOf), roundingRule: docCurrency?.rounding });
      navigate(AR_LIST_PATH, { state: { notice: effectiveDraft ? `Draft saved — ${a.customerName}.` : a.status === 'Not Confirmed' ? `A/R invoice ${arNumber(a)} submitted for approval.` : `A/R invoice ${arNumber(a)} added — ${a.customerName} owes ${a.currency} ${formatAmount(balance)}.` } });
    } catch (err) {
      if (!(err instanceof ArPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'lines', message: err.message }]);
      listItems().then((items) => setM((prev) => prev && { ...prev, items }));
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<ArInvoice>, notice: string) => {
    try {
      const a = await run();
      navigate(AR_LIST_PATH, { state: { notice: `A/R invoice ${arNumber(a)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const saved = draft as ArInvoice;
  const closeIt = () => act(() => closeArInvoice(saved), 'closed');
  const cancelIt = () => act(() => cancelArInvoice(saved), 'cancelled — the entry is reversed and its deliveries and orders are open again');
  const recallIt = () => act(() => recallArInvoice(saved), 'recalled to draft');
  const rejectIt = async (rejectionReason: string) => { await logRejection('ARINV', saved.id, saved.customerId, rejectionReason); await recallArInvoice(saved); navigate(AR_LIST_PATH, { state: { notice: `A/R invoice ${arNumber(saved)} rejected and returned to draft.` } }); };

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' ? [{ label: 'Create A/R credit memo', icon: 'undo', onSelect: () => navigate(`${AR_CM_LIST_PATH}/new`, { state: { fromInvoice: draft.id } }) }] : []),
    ...(draft.status === 'Open' && balance > 0 && !draft.paymentBlock
      ? [{ label: 'Receive payment', icon: 'savings', onSelect: () => navigate('/sales/incoming-payments/new', { state: { fromInvoice: draft.id } }) }]
      : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(draft.status === 'Open' && !draft.appliedAmount ? [{ label: `Cancel ${AR_NOUN.one}`, icon: 'cancel', onSelect: cancelIt }] : []),
  ];

  const tabProps = { draft, update, errors, m, ctx };
  // Copy-from sources: this customer's open deliveries with something left to bill, and open orders with something left.
  const mineCopy = (c: { customerId: string; currency: string }) => (!draft.customerId || c.customerId === draft.customerId) && (!ctx.based || c.currency === draft.currency);
  const copyDns = m.deliveries.filter((d) => d.status === 'Open' && mineCopy(d) && d.lines.some((l) => l.quantity > l.invoicedQty));
  const copySos = m.orders.filter((o) => o.status === 'Open' && o.docType === draft.docType && mineCopy(o) && o.lines.some((l) => openQty(l) > 0));
  const title = isNew ? `New ${AR_NOUN.one}` : draft.status === 'Draft' ? `Draft ${AR_NOUN.one}` : arNumber(draft);

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PageHeader
          variant="plain"
          icon="receipt"
          parent={{ noun: AR_NOUN, to: AR_LIST_PATH }}
          title={title}
          tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
          status={isNew ? undefined : <Badge size="small" intent={AR_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <DetailActions
              noun={AR_NOUN}
              listPath={AR_LIST_PATH}
              mode={docMode(draft.status, { canApprove: isApprover('ARINV') })}
              needsApproval={!draft.approved}
              remarksOnly={ro}
              busy={saving}
              onDraft={() => submit(null, true)}
              onSubmit={() => submit(null, false)}
              onApprove={() => submit(null, false, { approved: true })}
              onReject={reject.start}
              menu={menu}
              prevNext={isNew ? undefined : { path: AR_LIST_PATH, prevId, nextId }}
            />
          }
        />
        {page === 'activity' ? (
          <Panel.Body>
            <ActivityTab target={{ kind: 'ARINV', id: draft.id ?? '' }} partnerId={draft.customerId} />
          </Panel.Body>
        ) : page === 'transactions' && draft.id ? (
          <Panel.Body className="flex flex-col gap-2">
            <SalesDocumentFlow
              kind="ARINV"
              id={draft.id}
              notes="Everything linked to this invoice: the sales order or delivery it came from, and the payments collected against it."
            />
          </Panel.Body>
        ) : page === 'transactions' ? (
          <Panel.Body>
            <Text variant="small" tone="muted" className="p-4">Save the document first to see related documents.</Text>
          </Panel.Body>
        ) : null}
        {page === 'details' ? (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
            {reject.alert('Reject A/R invoice', rejectIt)}
            {ro ? (
              <Alert intent="default" variant="outline" title={`This invoice is ${draft.status.toLowerCase()}`}>
                {draft.status === 'Cancelled'
                  ? 'Its journal entry was reversed, stock it shipped came back, and its deliveries and orders reopened.'
                  : 'It’s posted to the ledger. Only remarks and attachments can change; to undo it, cancel the invoice.'}
              </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
              <div className="flex flex-col gap-2 lg:col-span-8">
                <CustomerCard
                  customers={m.customers}
                  customerId={draft.customerId}
                  customer={customer}
                  locked={ro || ctx.based}
                  error={errors.customerId}
                  hint={ctx.based && !ro ? 'Set by the document the lines come from.' : undefined}
                  onPickCustomer={pickCustomer}
                  onOpenDetails={() => setCustomerDetailsOpen(true)}
                />
                {/* Not in a disabled fieldset: the table locks its own inputs and keeps its column settings. */}
                <DocLines
                  {...invoiceDoc({ kind: 'AR', ...tabProps, onCopyClick: () => setCopying(true), canCopy: copyDns.length > 0 || copySos.length > 0 })}
                  footer={
                    <SalesTotalsFooter
                      {...tabProps}
                      withRounding
                      withholding={withholding.map((w) => ({ label: `${w.kind === 'Withholding VAT' ? 'VAT' : 'EWT'} withheld — ${w.atc} (${w.rate}%)`, amount: w.amount }))}
                      extraRows={
                        // Until something is applied, the total (or net to receive) is the balance due.
                        draft.appliedAmount ? (
                          <>
                            <div className="flex items-center justify-between gap-4">
                              <Text variant="small" tone="muted">Applied amount</Text>
                              <Text variant="small" className="tabular-nums">–{draft.currency} {formatAmount(draft.appliedAmount)}</Text>
                            </div>
                            <div className="flex items-baseline justify-between gap-4 border-t pt-1" style={{ borderColor: 'var(--color-border-neutral-subtle)' }}>
                              <Text variant="small" weight="semibold" tone="heading">Balance due</Text>
                              <Text variant="small" weight="semibold" tone="heading" className="tabular-nums">{draft.currency} {formatAmount(balance)}</Text>
                            </div>
                          </>
                        ) : null
                      }
                    />
                  }
                />
                <ArInstallmentsCard draft={draft} balance={balance} />
                <ReferencesTable
                  refs={draft.references}
                  onChange={(references) => update({ references })}
                  readOnly={ro}
                  description="Link the delivery note, sales order, customer PO, or other source documents."
                />
                <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="The signed invoice, the customer's PO, Form 2307 when it arrives." withDescription />
              </div>

              <aside className="flex flex-col gap-2 lg:col-span-4">
                <ArDatesCard {...tabProps} />
                <ArSettingsCard {...tabProps} />
                <BpChannelCard {...tabProps} />
                <ArShipmentCard {...tabProps} />
                <ArAssignmentCard {...tabProps} />
              </aside>
            </div>
          </Panel.Body>
        ) : null}
      </Panel>
    </Form>
    <InvoiceCustomerDetailsPanel {...tabProps} noun="invoice" remarkDefault="A/R Invoices – customer code" open={customerDetailsOpen} onClose={() => setCustomerDetailsOpen(false)} />
    {copying
      ? createPortal(
          <CopyPanel
            sources={[
              {
                key: 'DN' as const,
                label: 'Deliveries',
                totalHeader: 'Shipped',
                qtyHeader: 'Bill',
                hint: 'Bills what was shipped, at the delivery’s price. The stock already went out with the delivery.',
                docs: copyDns.map((d) => ({
                  id: d.id,
                  label: `${dnNumber(d)} · ${d.customerName}`,
                  description: `Shipped ${d.postingDate}${d.orderNumber ? ` · order ${d.orderNumber}` : ''}`,
                  lines: d.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: l.quantity - l.invoicedQty })),
                })),
              },
              {
                key: 'SO' as const,
                label: 'Sales orders',
                totalHeader: 'Ordered',
                qtyHeader: 'Bill',
                hint: 'Bills straight from the order with no delivery: adding the invoice also ships the stock.',
                docs: copySos.map((o) => ({
                  id: o.id,
                  label: `${soNumber(o)} · ${o.customerName}`,
                  description: o.deliveryDate ? `Due ${o.deliveryDate}` : 'No delivery date',
                  lines: o.lines.map((l) => ({ id: l.id, itemNo: l.itemNo || l.description, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                })),
              },
            ] satisfies CopySourceType<'DN' | 'SO'>[]}
            taken={new Set(draft.lines.map((l) => l.baseLineId).filter((id): id is string => !!id))}
            onCancel={() => setCopying(false)}
            onCopy={(type, docId, picks) => {
              setCopying(false);
              const src: CopyPick | null = type === 'DN'
                ? (() => { const doc = copyDns.find((d) => d.id === docId); return doc ? { kind: 'DN', doc } : null; })()
                : (() => { const doc = copySos.find((o) => o.id === docId); return doc ? { kind: 'SO', doc } : null; })();
              if (src) setDraft(copyLines(draft, src, picks, m));
            }}
          />,
          document.body,
        )
      : null}
    </>
  );
}
