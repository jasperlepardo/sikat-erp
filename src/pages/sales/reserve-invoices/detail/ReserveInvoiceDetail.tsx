import { useEffect, useState, type FormEvent } from 'react';
import { useAutoSave } from '../../../../components/form/useAutoSave';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Form, Panel, PanelHeader, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../../mocks/address';
import { blankReserveInvoice, type ReserveInvoice } from '../../../../mocks/reserveInvoices';
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
import { controlAccountOf } from '../../../../services/journalEntries';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { termDays } from '../../../../services/purchaseOrders';
import { logRejection } from '../../../../services/approvalRules';
import { getSalesSettings, listSalesOrders, openQty, soDueDate, soNumber } from '../../../../services/salesOrders';
import { soSeries } from '../../../../services/allSeries';
import { ALL_CURRENCIES, proposedTaxCode } from '../../sales-orders/detail/types';
import { CustomerCard } from '../../shared/CustomerCard';
import { SalesTotalsFooter } from '../../shared/TotalsFooter';
import { ReferencesTable } from '../../../purchasing/shared/ReferencesTable';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { neighbours, NotFound, PrevNext, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { useDocTitle } from '../../../../services/useDocTitle';
import { buildRiContext, riLineFromOrder, type RiContext, type RiDraft, type RiMasters } from './types';
import { RiDatesCard } from './RiCustomerCard';
import { RiShipmentCard } from './RiShipmentCard';
import { RiAssignmentCard } from './RiAssignmentCard';
import { RiAccountingCard } from './RiAccountingCard';
import { InvoiceContentsCard, type CopyPickRi } from '../../shared/InvoiceContentsCard';
import { InvoiceCustomerDetailsPanel } from '../../shared/InvoiceCustomerDetailsPanel';
import { RI_LIST_PATH, RI_STATUS_INTENT, SO_LIST_PATH } from '../../paths';
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
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
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

  const riApproved = !getSalesSettings().requireArInvoiceApproval;
  const [draft, setDraft] = useState<RiDraft | null | undefined>(isNew ? { ...blankReserveInvoice(todayISO(), CURRENT_USER_ID), approved: riApproved } : undefined);
  const [m, setM] = useState<RiMasters>();
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${RI_LIST_PATH}/${id}`, tabParam);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
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

  useDocTitle(draft?.docNum ? (isNew ? 'New reserve invoice' : draft.status === 'Draft' ? 'Draft reserve invoice' : riNumber(draft)) : undefined);
  useAutoSave(draft?.status !== 'Draft', () => saveRiRemarks(draft!.id!, { remarks: draft!.remarks, attachments: draft!.attachments }), [draft?.remarks, draft?.attachments]);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading reserve invoice…</Text>;
  if (draft === null) return <NotFound icon="receipt_long" title="Reserve invoice not found" backTo={RI_LIST_PATH} backLabel="Back to reserve invoices" />;

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
    const doc: RiDraft = { ...draft, ...overrides, lines: draft.lines.filter((l) => (draft.docType === 'Service' ? l.description.trim() || l.unitPrice : l.itemId)) };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, ctx, m, effectiveDraft);
    setProblems(found);
    if (found.length) {
      if (found.some((p) => p.tab === 'accounting') && customer) setCustomerDetailsOpen(true);
      return;
    }
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
              ? `Reserve invoice ${riNumber(r)} submitted for approval.`
              : `Reserve invoice ${riNumber(r)} added — ${r.customerName} owes ${r.currency} ${formatAmount(balance)}.`,
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
      navigate(RI_LIST_PATH, { state: { notice: `Reserve invoice ${riNumber(r)} ${notice}.` } });
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
    navigate(RI_LIST_PATH, { state: { notice: `Reserve invoice ${riNumber(saved)} rejected and returned to draft.` } });
  };

  const bases = [...new Map(draft.lines.filter((l) => l.baseId).map((l) => [l.baseId, l])).values()];

  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Draft' && !draft.approved ? [{ label: 'Submit for approval', icon: 'upload', onSelect: () => submit(null, false) }] : []),
    ...(draft.status === 'Not Confirmed'
      ? [
          { label: 'Approve', icon: 'verified', onSelect: () => submit(null, false, { approved: true }) },
          { label: 'Recall', icon: 'undo', onSelect: recallIt },
          { label: 'Reject', icon: 'cancel', onSelect: () => reject.start() },
        ]
      : []),
    ...(draft.status === 'Open' && draft.lines.some((l) => l.openQtyForIt > 0)
      ? [{ label: 'Create Delivery', icon: 'local_shipping', onSelect: () => navigate('/sales/deliveries/new', { state: { fromReserveInvoice: saved.id } }) }]
      : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(draft.status === 'Open' && !draft.appliedAmount ? [{ label: 'Cancel reserve invoice', icon: 'cancel', onSelect: cancelIt }] : []),
    ...bases.map((l) => ({
      label: `Open sales order ${l.baseDocNo}`,
      icon: 'shopping_bag',
      onSelect: () => navigate(`${SO_LIST_PATH}/${l.baseId}`),
    })),
  ];

  const tabProps = { draft, update, errors, m, ctx };
  const title = isNew ? 'New reserve invoice' : draft.status === 'Draft' ? 'Draft reserve invoice' : riNumber(draft);

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="receipt_long"
            iconIntent="default"
            iconShape="rounded"
            iconSize={32}
            iconVariant="outline"
            breadcrumbs={[{ label: 'Reserve Invoices', href: RI_LIST_PATH }, { label: title }]}
            onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
            onBack={() => navigate(RI_LIST_PATH)}
            trailing={isNew ? undefined : <PrevNext path={RI_LIST_PATH} prevId={prevId} nextId={nextId} />}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
            status={isNew ? undefined : <Badge size="small" intent={RI_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <>
                {menu.length ? <MoreMenu items={menu} /> : null}
                {ro ? null : (
                  <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                    {saving ? 'Saving…' : 'Create Reserve Invoice'}
                  </Button>
                )}
              </>
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
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
              {reject.alert('Reject reserve invoice', rejectIt)}
              {ro ? (
                <Alert intent="default" variant="outline" title={`This reserve invoice is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Cancelled'
                    ? 'Its journal entry was reversed. No stock movement was made by this document.'
                    : "It's posted to the ledger. Only remarks and attachments can change; to undo it, cancel the reserve invoice."}
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
                  <InvoiceContentsCard
                    kind="RI"
                    {...tabProps}
                    onCopy={(src, picks) => setDraft(copyLines(draft, src, picks, m))}
                    cardFooter={
                      <SalesTotalsFooter
                        {...tabProps}
                        withRounding
                        withholding={withholding.map((w) => ({ label: `${w.kind === 'Withholding VAT' ? 'VAT' : 'EWT'} withheld — ${w.atc} (${w.rate}%)`, amount: w.amount }))}
                        extraRows={
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
                </div>
                <aside className="flex flex-col gap-2 lg:col-span-4">
                  <RiDatesCard {...tabProps} />
                  <RiAccountingCard {...tabProps} />
                  <RiShipmentCard {...tabProps} />
                  <RiAssignmentCard {...tabProps} />
                </aside>
              </div>
            </Panel.Body>
          ) : null}
        </Panel>
      </Form>
      <InvoiceCustomerDetailsPanel {...tabProps} noun="reserve invoice" remarkDefault="Reserve Invoice – customer code" open={customerDetailsOpen} onClose={() => setCustomerDetailsOpen(false)} />
    </>
  );
}
