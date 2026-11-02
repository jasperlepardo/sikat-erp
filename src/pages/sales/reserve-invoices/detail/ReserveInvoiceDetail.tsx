import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { createPortal } from 'react-dom';
import { Alert, Badge, Form, Panel, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { DocumentDetailSkeleton } from '../../../../components/form/skeletons/DocumentDetailSkeleton';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { JournalPreview } from '../../../../components/form/JournalPreview';
import { type Errors } from '../../../../components/form/fields';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions, docMode } from '../../../../components/form/DetailActions';
import { PageHeader } from '../../../../components/form/PageHeader';
import { DetailColumns } from '../../../../components/form/DetailColumns';
import { cap } from '../../../../components/form/noun';
import { isApprover, needsApproval } from '../../../../services/approval';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../../mocks/address';
import { blankReserveInvoice, type ReserveInvoice, type RiLine } from '../../../../mocks/reserveInvoices';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import {
  RiPostError,
  addReserveInvoice,
  recallReserveInvoice,
  riNumber,
  riTotals,
  riWithholding,
  riBalanceDue,
  cancelReserveInvoice,
  closeReserveInvoice,
  getReserveInvoice,
  listReserveInvoices,
  riJournal,
  saveRiDraft,
  saveRiRemarks,
} from '../../../../services/reserveInvoices';
import { loadCurrentCompany } from '../../../../services/companies';
import { todayISO } from '../../../../services/dates';
import type { Partner } from '../../../../mocks/partners';
import { recalcLineTaxes } from '../../../../services/taxRecalc';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { controlAccountOf, postingPeriodProblem } from '../../../../services/journalEntries';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { termDays } from '../../../../services/purchaseOrders';
import { logRejection } from '../../../../services/approvalRules';
import { listSalesOrders, openQty, soDueDate, soNumber } from '../../../../services/salesOrders';
import { soSeries } from '../../../../services/allSeries';
import { ALL_CURRENCIES, proposedTaxCode } from '../../sales-orders/detail/types';
import { CustomerCard } from '../../shared/CustomerCard';
import { ReferencesCard } from '../../shared/ReferencesCard';
import { SalesTotalsFooter } from '../../shared/TotalsFooter';
import { salesView } from '../../shared/salesView';
import { amt, TotalsBar, TotalsRow } from '../../../../components/form/TotalsFooterParts';
import { ReferencesTable } from '../../../purchasing/shared/ReferencesTable';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { neighbours, NotFound, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { useDocTitle } from '../../../../services/useDocTitle';
import { buildRiContext, riLineFromOrder, type RiContext, type RiDraft, type RiMasters } from './types';
import { DocumentDates } from '../../../../components/form/DatesCard';
import { DocumentJournalEntry, DocumentPayment } from '../../../../components/form/PaymentCard';
import { arReserveInvoiceDates } from '../../../documentDateDefs';
import { arReserveInvoicePayment } from '../../../documentPaymentDefs';
import { RiShipmentCard } from './RiShipmentCard';
import { AssignmentCard } from '../../../../components/form/AssignmentCard';
import { NO_SALES_EMPLOYEE } from '../../../../mocks/salesOrders';
import { RiAccountingCard } from './RiAccountingCard';
import { RiDocumentCard } from './RiDocumentCard';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { CopyPanel, type CopySourceType } from '../../../purchasing/shared/CopyPanel';
import { invoiceDoc, type CopyPickRi } from '../../shared/invoiceDoc';
import { CustomerDetailsPanel } from '../../shared/CustomerDetailsPanel';
import { DN_LIST_PATH, DN_NOUN, DN_STATUS_INTENT, RI_LIST_PATH, RI_NOUN, RI_STATUS_INTENT } from '../../paths';
import { LineRollup, type RollupDocRow } from '../../../../components/form/LineRollup';
import { useAsync } from '../../../../services/useAsync';
import { dnNumber, listDeliveries } from '../../../../services/deliveries';
import { customerWithholds } from '../../../../services/withholding';

type TabId = 'contents' | 'accounting';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', accounting: 'Customer details' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

function validate(d: RiDraft, ctx: RiContext, m: RiMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  const postingPeriod = postingPeriodProblem(d.postingDate);
  need(!postingPeriod, 'header', 'postingDate', postingPeriod ?? '');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(d.dueDate, 'header', 'dueDate', 'Due date is required.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.controlAccount, 'accounting', 'controlAccount', 'Pick the control account.');
  need(d.installments >= 1 && Number.isInteger(d.installments), 'accounting', 'installments', 'Installments must be a whole number, 1 or more.');
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a sales order.');
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
  }
  return problems;
}

export function ReserveInvoiceDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <ReserveInvoiceForm key={id === 'new' ? location.key : id} />;
}

function ReserveInvoiceForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state as { fromOrder?: string } | null;

  const riApproved = !needsApproval('ARRI');
  const [draft, setDraft] = useState<RiDraft | null | undefined>(isNew ? { ...blankReserveInvoice(todayISO(), CURRENT_USER_ID), approved: riApproved } : undefined);
  const [m, setM] = useState<RiMasters>();
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${RI_LIST_PATH}/${id}`, tabParam);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [currencyView, setCurrencyView] = useState('');
  const [copying, setCopying] = useState(false);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [contentTab, setContentTab] = useState<'item' | 'deliveries'>('item');
  const deliveriesList = useAsync(listDeliveries, []);
  const reject = useReject();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('customer'), listItems(), loadInventoryMasters(), companyTax.list(), taxCodes.list(), taxGroups.list(), withholdingTaxes.list(),
      withholdingGroups.list(), currencies.list(), exchangeRates.list(), accounts.list(), loadCurrentCompany(), listSalesOrders(), soSeries.list(),
    ]).then(([customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, accts, ours, orders, series]) => {
      if (cancelled) return;
      const masters: RiMasters = { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, accounts: accts, company: ours, orders, soSeries: series };
      setM(masters);
      if (!isNew) return;
      const so = from?.fromOrder && orders.find((o) => o.id === from.fromOrder);
      if (so) {
        const picks = so.lines.filter((l) => openQty(l) > 0).map((l) => ({ lineId: l.id, qty: openQty(l) }));
        setDraft((d) => d && copyLines(d, { kind: 'SO', doc: so }, picks, masters));
      }
    });
    if (!isNew && id) {
      getReserveInvoice(id).then((r) => !cancelled && setDraft(r ?? null));
      listReserveInvoices().then((all) => !cancelled && setSiblings(siblingKeys(all, riNumber)));
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? `New ${RI_NOUN.one}` : draft.status === 'Draft' ? `Draft ${RI_NOUN.one}` : riNumber(draft)) : undefined);
  if (draft === undefined || !m) return <DocumentDetailSkeleton />;
  if (draft === null) return <NotFound icon="receipt_long" title={`${cap(RI_NOUN.one)} not found`} backTo={RI_LIST_PATH} backLabel={`Back to ${RI_NOUN.many}`} />;

  const ctx = buildRiContext(draft, m);
  const { customer } = ctx;
  const ro = ctx.readOnly;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = riTotals(draft, ctx.rateOf, docCurrency?.rounding);
  const withholding = riWithholding(draft, customer, m.items, ctx.rateOf);
  const wtax = Math.round(withholding.reduce((n, w) => n + w.amount, 0) * 100) / 100;
  const balance = riBalanceDue(totals.total, wtax, draft.appliedAmount);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? riNumber(draft as ReserveInvoice) : draft.id));

  /** Tax codes re-proposed for the customer and date, except ones set by hand or copied from a base document. */
  const retax = (lines: RiDraft['lines'], c: Partner | undefined, date: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, c, m, date) : '';
    });
  const update = (patch: Partial<RiDraft>) => {
    const next = { ...draft, ...patch };
    if (!ro && patch.postingDate !== undefined && patch.postingDate !== draft.postingDate) next.lines = retax(next.lines, customer, next.postingDate);
    setDraft(next);
  };

  function copyLines(d: RiDraft, src: CopyPickRi, picks: { lineId: string; qty: number }[], masters: RiMasters): RiDraft {
    const c = masters.customers.find((x) => x.id === src.doc.customerId);
    const liable = customerWithholds(c);
    const added = picks.map((p) => riLineFromOrder(src.doc, src.doc.lines.find((l) => l.id === p.lineId)!, p.qty, liable));
    const first = !d.lines.some((l) => l.baseId);
    const s = src.doc;
    const header: Partial<RiDraft> = first
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
          journalRemark: defaultJournalRemark('reserve-invoices', { entityCode: s.customerCode, entityName: s.customerName }),
          docType: src.doc.docType,
        }
      : {};
    const orderNo = soNumber(src.doc);
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
      journalRemark: defaultJournalRemark('reserve-invoices', { entityCode: c.code, entityName: c.name }),
      lines: retax(draft.lines, c, draft.postingDate).map((l) => ({ ...l, wtaxLiable: liable })),
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<RiDraft> = {}) => {
    e?.preventDefault();
    if (ro && !overrides.approved) {
      setSaving(true);
      try {
        const r = await saveRiRemarks(draft.id!, { remarks: draft.remarks, attachments: draft.attachments });
        navigate(RI_LIST_PATH, { state: { notice: `${cap(RI_NOUN.one)} ${riNumber(r)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const doc: RiDraft = { ...draft, ...overrides, lines: draft.lines.filter((l) => (draft.docType === 'Service' ? l.description.trim() || l.unitPrice : l.itemId)) };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, ctx, m, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const items = await listItems();
      const r = effectiveDraft
        ? await saveRiDraft(doc)
        : await addReserveInvoice(doc, ctx.fx, { codes: m.tax.codes, withholding: riWithholding(doc, customer, items, ctx.rateOf), roundingRule: docCurrency?.rounding, items });
      navigate(RI_LIST_PATH, {
        state: {
          notice: effectiveDraft
            ? `Draft saved — ${r.customerName}.`
            : r.status === 'Not Confirmed'
              ? `${cap(RI_NOUN.one)} ${riNumber(r)} submitted for approval.`
              : `${cap(RI_NOUN.one)} ${riNumber(r)} added — ${r.customerName} owes ${r.currency} ${formatAmount(balance)}.`,
        },
      });
    } catch (err) {
      if (!(err instanceof RiPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'lines', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<ReserveInvoice>, notice: string) => {
    try {
      const r = await run();
      navigate(RI_LIST_PATH, { state: { notice: `${cap(RI_NOUN.one)} ${riNumber(r)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const saved = draft as ReserveInvoice;
  const closeIt = () => act(() => closeReserveInvoice(saved), 'closed');
  const cancelIt = () => act(() => cancelReserveInvoice(saved), 'cancelled — the entry is reversed');
  const recallIt = () => act(() => recallReserveInvoice(saved), 'recalled to draft');
  const rejectIt = async (rejectionReason: string) => {
    await logRejection('ARINV', saved.id, saved.customerId, rejectionReason);
    await recallReserveInvoice(saved);
    navigate(RI_LIST_PATH, { state: { notice: `${cap(RI_NOUN.one)} ${riNumber(saved)} rejected and returned to draft.` } });
  };

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' && draft.lines.some((l) => l.openQtyForIt > 0)
      ? [{ label: 'Create delivery', icon: 'local_shipping', onSelect: () => navigate('/sales/deliveries/new', { state: { fromReserveInvoice: saved.id } }) }]
      : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(draft.status === 'Open' && !draft.appliedAmount ? [{ label: `Cancel ${RI_NOUN.one}`, icon: 'cancel', onSelect: cancelIt }] : []),
  ];

  const tabProps = { draft, update, errors, m, ctx };
  const view = salesView(draft.currency, ctx.fx, draft.postingDate, currencyView, setCurrencyView);
  const journal = ctx.fx ? riJournal(draft, ctx.fx, { items: m.items, groups: m.inv.groups, codes: m.tax.codes, rateOf: ctx.rateOf, withholding }) : [];
  const journalEntry = <JournalPreview journal={journal} accounts={m.accounts} />;
  // Copy-from sources: this customer's open orders with something left to invoice.
  const mineCopy = (c: { customerId: string; currency: string }) => (!draft.customerId || c.customerId === draft.customerId) && (!ctx.based || c.currency === draft.currency);
  const copySos = m.orders.filter((o) => o.status === 'Open' && o.docType === draft.docType && mineCopy(o) && o.lines.some((l) => openQty(l) > 0));
  const title = isNew ? `New ${RI_NOUN.one}` : draft.status === 'Draft' ? `Draft ${RI_NOUN.one}` : riNumber(draft);

  // Second content tab: the deliveries that fulfil this reserve invoice. The invoice and the
  // deliveries both descend from the same SO line (baseType 'SO'), so they share its baseId/baseLineId.
  const counts = (d: { status: string }) => d.status !== 'Draft' && d.status !== 'Cancelled';
  const dnDocsFor = (l: RiLine): RollupDocRow[] =>
    !l.baseId ? [] : (deliveriesList ?? []).filter(counts).flatMap((dn) =>
      dn.lines
        .filter((dl) => dl.baseId === l.baseId && dl.baseLineId === l.baseLineId)
        .map((dl): RollupDocRow => ({ id: `${dn.id}:${dl.id}`, no: dnNumber(dn), href: `#${DN_LIST_PATH}/${dn.docNum ? dnNumber(dn) : dn.id}`, date: dn.postingDate, status: dn.status, intent: DN_STATUS_INTENT[dn.status], quantity: dl.quantity, uomCode: dl.uomCode })));
  const showRollups = !isNew && draft.status !== 'Draft' && !!draft.id;
  const contentTabs = (
    <Tabs
      variant="solid"
      className="w-fit max-w-full self-start"
      value={contentTab}
      onValueChange={(v) => setContentTab(v as 'item' | 'deliveries')}
      items={[
        { value: 'item', label: cap(RI_NOUN.lineLabel!) },
        { value: 'deliveries', label: cap(DN_NOUN.many) },
      ]}
    />
  );

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => e.preventDefault()} noValidate>
        <Panel className="flex-1">
          <PageHeader
            variant="plain"
            icon="receipt_long"
            parent={{ noun: RI_NOUN, to: RI_LIST_PATH }}
            title={title}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
            status={isNew ? undefined : <Badge size="small" intent={RI_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <DetailActions
                noun={RI_NOUN}
                listPath={RI_LIST_PATH}
                mode={docMode(draft.status, { canApprove: isApprover('ARRI') })}
                draft={draft}
                onRevert={setDraft}
                needsApproval={!draft.approved}
                remarksOnly={ro}
                busy={saving}
                onDraft={() => submit(null, true)}
                onSubmit={() => submit(null, false)}
                onApprove={() => submit(null, false, { approved: true })}
                onReject={reject.start}
                menu={menu}
                prevNext={isNew ? undefined : { path: RI_LIST_PATH, prevId, nextId }}
              />
            }
          />
          {page === 'activity' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'RI', id: draft.id ?? '' }} partnerId={draft.customerId} />
            </Panel.Body>
          ) : page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <SalesDocumentFlow
                kind="ARINV"
                id={draft.id}
                notes="Everything linked to this reserve invoice: the sales order it came from, and any deliveries drawn against it."
              />
            </Panel.Body>
          ) : page === 'transactions' ? (
            <Panel.Body>
              <Text variant="small" tone="muted" className="p-4">Save the document first to see related documents.</Text>
            </Panel.Body>
          ) : null}
          {page === 'details' ? (
            <DetailColumns
              header={
                <>
                  <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
                  {reject.alert(`Reject ${RI_NOUN.one}`, rejectIt)}
                  {ro ? (
                    <Alert intent="default" variant="outline" title={`This ${RI_NOUN.one} is ${draft.status.toLowerCase()}`}>
                      {draft.status === 'Cancelled'
                        ? 'Its journal entry was reversed. No stock movement was made by this document.'
                        : "It's posted to the ledger. Only remarks and attachments can change; to undo it, cancel the reserve invoice."}
                    </Alert>
                  ) : null}
                </>
              }
              main={
                <>
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
                  {showRollups ? contentTabs : null}
                  {showRollups && contentTab === 'deliveries' ? (
                    <LineRollup title={cap(DN_NOUN.many)} lines={draft.lines.filter((l) => l.itemId)} loading={!deliveriesList} docsFor={dnDocsFor} empty="No deliveries against this reserve invoice yet." />
                  ) : (
                    <DocLines
                      {...invoiceDoc({ kind: 'RI', ...tabProps, onCopyClick: () => setCopying(true), canCopy: copySos.length > 0 }, view)}
                      footer={
                        <SalesTotalsFooter
                          {...tabProps}
                          totals={totals}
                          withRounding
                          view={view}
                          withholding={withholding.map((w) => ({ label: `${w.kind === 'Withholding VAT' ? 'VAT' : 'EWT'} withheld — ${w.atc} (${w.rate}%)`, amount: w.amount }))}
                          extraRows={
                            draft.appliedAmount ? (
                              <>
                                <TotalsRow label="Applied amount" value={amt(-view.convert(draft.appliedAmount), view.code)} />
                                <TotalsBar label="Balance due" value={amt(view.convert(balance), view.code)} />
                              </>
                            ) : null
                          }
                        />
                      }
                    />
                  )}
                  <DocumentJournalEntry def={arReserveInvoicePayment} posting={journalEntry} {...tabProps} />
                  <ReferencesTable
                    refs={draft.references}
                    onChange={(references) => update({ references })}
                    readOnly={ro}
                    description="Link the sales order, customer PO, or other source documents."
                  />
                  <AttachmentsCard
                    attachments={draft.attachments}
                    onChange={(attachments) => update({ attachments })}
                    emptyHint="The signed reserve invoice, the customer's PO, Form 2307 when it arrives."
                    withDescription
                  />
                </>
              }
              aside={
                <>
                  <RiDocumentCard {...tabProps} />
                  <DocumentDates def={arReserveInvoiceDates} {...tabProps} />
                  <DocumentPayment def={arReserveInvoicePayment} posting={journalEntry} {...tabProps} />
                  <RiAccountingCard {...tabProps} />
                  <RiShipmentCard {...tabProps} />
                  <ReferencesCard {...tabProps} orderNumberHint="Set by Copy from." />
                  <AssignmentCard
                    draft={draft}
                    update={update}
                    readOnly={ctx.readOnly}
                    person={{ key: 'salesEmployeeId', label: 'Sales employee', clearable: true, placeholder: NO_SALES_EMPLOYEE, hint: 'Defaults from the customer.' }}
                    ownerHint="Owns the document."
                    remarksHint="Can be changed after the invoice is added."
                  />
                </>
              }
            />
          ) : null}
        </Panel>
      </Form>
      <CustomerDetailsPanel
        customerRefLabel="Customer PO no."
        customer={ctx.customer}
        draft={draft}
        update={update}
        readOnly={ctx.readOnly}
        noun={RI_NOUN.one}
        open={customerDetailsOpen}
        onClose={() => setCustomerDetailsOpen(false)}
      />
      {copying
        ? createPortal(
            <CopyPanel
              sources={[{
                key: 'SO' as const,
                label: 'Sales orders',
                totalHeader: 'Ordered',
                qtyHeader: 'Invoice',
                hint: 'Posts revenue immediately; stock is relieved when the delivery is created later.',
                docs: copySos.map((o) => ({
                  id: o.id,
                  label: `${soNumber(o)} · ${o.customerName}`,
                  description: o.deliveryDate ? `Due ${o.deliveryDate}` : 'No delivery date',
                  lines: o.lines.map((l) => ({ id: l.id, itemNo: l.itemNo || l.description, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                })),
              }] satisfies CopySourceType<'SO'>[]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter((id): id is string => !!id))}
              onCancel={() => setCopying(false)}
              onCopy={(_type, docId, picks) => {
                const doc = copySos.find((o) => o.id === docId);
                setCopying(false);
                if (doc) setDraft(copyLines(draft, { kind: 'SO', doc } as CopyPickRi, picks, m));
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
