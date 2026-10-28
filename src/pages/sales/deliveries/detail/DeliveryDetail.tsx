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
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { formatAddress } from '../../../../mocks/address';
import { blankDelivery, deliveryHeaderFrom, type Delivery } from '../../../../mocks/deliveries';
import { type SalesOrder } from '../../../../mocks/salesOrders';
import { loadCurrentCompany } from '../../../../services/companies';
import { todayISO } from '../../../../services/dates';
import { recalcLineTaxes } from '../../../../services/taxRecalc';
import type { Partner } from '../../../../mocks/partners';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { DnPostError, addDelivery, cancelDelivery, closeDelivery, dnNumber, getDelivery, listDeliveries, recallDelivery, saveDeliveryDraft, saveDeliveryNotes } from '../../../../services/deliveries';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { termDays } from '../../../../services/purchaseOrders';
import { logRejection } from '../../../../services/approvalRules';
import { listSalesOrders, openQty, soDueDate, soNumber } from '../../../../services/salesOrders';
import { soSeries } from '../../../../services/allSeries';
import { ALL_CURRENCIES, proposedTaxCode } from '../../sales-orders/detail/types';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { CopyPanel, type CopySourceType } from '../../../purchasing/shared/CopyPanel';
import { dnDoc } from './dnDoc';
import { buildDnContext, dnLineFromOrder, type DnContext, type DnDraft, type DnMasters } from './types';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { neighbours, NotFound, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { DnDatesCard } from './DnDatesCard';
import { DnSettingsCard } from './DnSettingsCard';
import { BpChannelCard } from '../../shared/BpChannelCard';
import { DnShipmentCard } from './DnShipmentCard';
import { DnAssignmentCard } from './DnAssignmentCard';
import { CustomerCard } from '../../shared/CustomerCard';
import { DnCustomerDetailsPanel } from './DnCustomerDetailsPanel';
import { ReferencesTable } from '../../../purchasing/shared/ReferencesTable';
import { DN_LIST_PATH, DN_NOUN, DN_STATUS_INTENT, SR_LIST_PATH } from '../../paths';

type TabId = 'contents';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

function validate(d: DnDraft, ctx: DnContext, m: DnMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a sales order.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(item.salesItem && item.inventoryItem, 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't a stocked sales item.`);
    need(l.baseId || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${d.postingDate}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(item.manageBy !== 'Serial Numbers' || Number.isInteger(l.quantity * l.itemsPerUnit), 'contents', `line:${l.id}:quantity`, `${n}: serial-managed items ship in whole units.`);
    need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse it ships from.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
  }
  need(!d.dueDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  return problems;
}

export function DeliveryDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <DeliveryForm key={id === 'new' ? location.key : id} />;
}

function DeliveryForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const fromOrder = (location.state as { fromOrder?: string } | null)?.fromOrder;

  const dnApproved = !needsApproval('DN');
  const [draft, setDraft] = useState<DnDraft | null | undefined>(isNew ? { ...blankDelivery(todayISO(), CURRENT_USER_ID), approved: dnApproved } : undefined);
  const [m, setM] = useState<DnMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${DN_LIST_PATH}/${id}`, tabParam);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const reject = useReject();
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('customer'), listItems(), loadInventoryMasters(), companyTax.list(), taxCodes.list(), taxGroups.list(), withholdingTaxes.list(),
      withholdingGroups.list(), currencies.list(), exchangeRates.list(), accounts.list(), loadCurrentCompany(), listSalesOrders(), soSeries.list(),
    ]).then(([customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, accts, ours, orders, series]) => {
      if (cancelled) return;
      const masters: DnMasters = { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, accounts: accts, company: ours, orders, soSeries: series };
      setM(masters);
      const so = fromOrder && orders.find((o) => o.id === fromOrder);
      if (isNew && so) setDraft((d) => d && copyLines(d, so, so.lines.filter((l) => openQty(l) > 0).map((l) => ({ lineId: l.id, qty: openQty(l) }))));
    });
    if (!isNew && id) {
      getDelivery(id).then((dn) => !cancelled && setDraft(dn ?? null));
      listDeliveries().then((all) => !cancelled && setSiblings(siblingKeys(all, dnNumber)));
    }
    return () => { cancelled = true; };
  }, [id, isNew, fromOrder]);

  useDocTitle(draft?.docNum ? (isNew ? `New ${DN_NOUN.one}` : draft.status === 'Draft' ? `Draft ${DN_NOUN.one}` : dnNumber(draft)) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading delivery…</Text>;
  if (draft === null) return <NotFound icon="local_shipping" title="Delivery not found" backTo={DN_LIST_PATH} backLabel="Back to deliveries" />;

  const ctx = buildDnContext(draft, m);
  const { customer } = ctx;
  const ro = ctx.readOnly;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? dnNumber(draft as Delivery) : draft.id));

  /** Tax codes re-proposed for the customer and date, except ones set by hand or copied from an order. */
  const retax = (lines: DnDraft['lines'], c: Partner | undefined, date: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, c, m, date) : '';
    });
  const update = (patch: Partial<DnDraft>) => {
    const next = { ...draft, ...patch };
    if (!ro && patch.postingDate !== undefined && patch.postingDate !== draft.postingDate) next.lines = retax(next.lines, customer, next.postingDate);
    setDraft(next);
  };

  function copyLines(d: DnDraft, so: SalesOrder, picks: { lineId: string; qty: number }[]): DnDraft {
    const added = picks.map((p) => dnLineFromOrder(so, so.lines.find((l) => l.id === p.lineId)!, p.qty));
    const first = !d.lines.some((l) => l.baseId);
    const header = first ? { ...deliveryHeaderFrom(so), dueDate: soDueDate(d.postingDate, termDays(so.paymentTermId), so.dueMonths, so.dueDays) } : {};
    const numbers = [...new Set([...d.orderNumber.split(', ').filter(Boolean), soNumber(so)])].join(', ');
    return { ...d, ...header, orderNumber: numbers, lines: [...d.lines.filter((l) => l.itemId), ...added] };
  }

  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    if (!c) return update({ customerId: '', customerCode: '', customerName: '', contactId: '' });
    const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
    const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? bill;
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
      useShippedGoodsAccount: c.useShippedGoodsAccount,
      discountPct: c.totalDiscount || 0,
      billTo: bill ? formatAddress(bill, c.name) : '',
      shipTo: ship ? formatAddress(ship, c.name) : '',
      journalRemark: defaultJournalRemark('deliveries', { entityCode: c.code, entityName: c.name }),
      lines: retax(draft.lines, c, draft.postingDate),
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<DnDraft> = {}) => {
    e?.preventDefault();
    // Added: only remarks and attachments save, unless this is approving it (which posts it).
    if (ro && !overrides.approved) {
      setSaving(true);
      const dn = await saveDeliveryNotes(draft.id!, { remarks: draft.remarks, attachments: draft.attachments });
      setSaving(false);
      return navigate(DN_LIST_PATH, { state: { notice: `Remarks saved on delivery ${dnNumber(dn)}.` } });
    }
    const doc: DnDraft = { ...draft, ...overrides, lines: draft.lines.filter((l) => l.itemId) };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, ctx, m, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const dn = effectiveDraft ? await saveDeliveryDraft(doc) : await addDelivery(doc, ctx.fx);
      navigate(DN_LIST_PATH, { state: { notice: effectiveDraft ? `Draft saved — ${dn.customerName}.` : dn.status === 'Not Confirmed' ? `Delivery ${dnNumber(dn)} submitted for approval.` : `Delivery ${dnNumber(dn)} added — stock is out and the sales order lines are updated.` } });
    } catch (err) {
      if (!(err instanceof DnPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'lines', message: err.message }]);
      listItems().then((items) => setM((prev) => prev && { ...prev, items }));
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<Delivery>, notice: string) => {
    try {
      const dn = await run();
      navigate(DN_LIST_PATH, { state: { notice: `Delivery ${dnNumber(dn)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const saved = draft as Delivery;
  const invoiced = draft.lines.some((l) => l.invoicedQty > 0);
  const closeIt = () => act(() => closeDelivery(saved), 'closed');
  const cancelIt = () => act(() => cancelDelivery(saved), 'cancelled — the stock is back and the order lines are open again');
  const recallIt = () => act(() => recallDelivery(saved), 'recalled to draft');
  const rejectIt = async (rejectionReason: string) => {
    await logRejection('DN', saved.id, saved.customerId, rejectionReason);
    await recallDelivery(saved);
    navigate(DN_LIST_PATH, { state: { notice: `Delivery ${dnNumber(saved)} rejected and returned to draft.` } });
  };
  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' && draft.lines.some((l) => l.quantity > l.invoicedQty)
      ? [{ label: 'Create A/R invoice', icon: 'receipt', onSelect: () => navigate('/sales/customer-invoices/new', { state: { fromDelivery: draft.id } }) }]
      : []),
    ...(draft.status === 'Open' ? [{ label: 'Create sales return', icon: 'assignment_return', onSelect: () => navigate(`${SR_LIST_PATH}/new`, { state: { fromDelivery: draft.id } }) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(draft.status === 'Open' && !invoiced ? [{ label: `Cancel ${DN_NOUN.one}`, icon: 'cancel', onSelect: cancelIt }] : []),
  ];

  const title = isNew ? `New ${DN_NOUN.one}` : draft.status === 'Draft' ? `Draft ${DN_NOUN.one}` : dnNumber(draft);
  const tabProps = { draft, update, errors, m, ctx };
  // Open orders of this customer (or any customer, before one is picked) with something left to ship.
  const copyableOrders = m.orders.filter((o) => o.status === 'Open' && o.docType === 'Item' && (!draft.customerId || o.customerId === draft.customerId) && o.lines.some((l) => openQty(l) > 0) && (!ctx.based || o.currency === draft.currency));

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PageHeader
            variant="plain"
            icon="local_shipping"
            parent={{ noun: DN_NOUN, to: DN_LIST_PATH }}
            title={title}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
            status={isNew ? undefined : <Badge size="small" intent={DN_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <DetailActions
                noun={DN_NOUN}
                listPath={DN_LIST_PATH}
                mode={docMode(draft.status, { canApprove: isApprover('DN') })}
                needsApproval={!draft.approved}
                remarksOnly={ro}
                busy={saving}
                onDraft={() => submit(null, true)}
                onSubmit={() => submit(null, false)}
                onApprove={() => submit(null, false, { approved: true })}
                onReject={reject.start}
                menu={menu}
                prevNext={isNew ? undefined : { path: DN_LIST_PATH, prevId, nextId }}
              />
            }
          />
          {page === 'activity' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'DN', id: draft.id ?? '' }} partnerId={draft.customerId} />
            </Panel.Body>
          ) : page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <SalesDocumentFlow kind="DN" id={draft.id} notes="Everything linked to this delivery: the sales order it came from, the invoices and payments it generated." />
            </Panel.Body>
          ) : page === 'transactions' ? (
            <Panel.Body>
              <Text variant="small" tone="muted" className="p-4">Save the document first to see related documents.</Text>
            </Panel.Body>
          ) : null}
          {page === 'details' ? (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
              {reject.alert('Reject delivery', rejectIt)}
              {ro ? (
                <Alert intent="default" variant="outline" title={`This delivery is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Cancelled'
                    ? 'The stock came back, the order lines reopened and the journal entry was reversed.'
                    : 'The stock is out and the journal entry is posted. Only remarks and attachments can change; to undo it, cancel the delivery.'}
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
                    hint={ctx.based && !ro ? 'Set by the sales order the lines come from.' : undefined}
                    onPickCustomer={pickCustomer}
                    onOpenDetails={() => setCustomerDetailsOpen(true)}
                  />
                  {/* Not in a disabled fieldset: the table locks its own inputs and keeps its column settings. */}
                  <DocLines {...dnDoc({ ...tabProps, onCopyClick: () => setCopying(true), canCopy: copyableOrders.length > 0 })} />
                  <ReferencesTable
                    refs={draft.references}
                    onChange={(references) => update({ references })}
                    readOnly={ro}
                    description="Link the sales order, customer PO, or other source documents."
                  />
                  <AttachmentsCard
                    attachments={draft.attachments}
                    onChange={(attachments) => update({ attachments })}
                    emptyHint="Signed delivery receipt, courier waybill, photos."
                    withDescription
                  />
                </div>

                <aside className="flex flex-col gap-2 lg:col-span-4">
                  <DnDatesCard {...tabProps} />
                  <DnSettingsCard {...tabProps} />
                  <BpChannelCard {...tabProps} />
                  <DnShipmentCard {...tabProps} />
                  <DnAssignmentCard {...tabProps} />
                </aside>
              </div>
            </Panel.Body>
          ) : null}
        </Panel>
      </Form>
      <DnCustomerDetailsPanel
        {...tabProps}
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
                qtyHeader: 'Deliver',
                hint: 'Open lines come at their open quantity; ship less if the order allows partial delivery.',
                docs: copyableOrders.map((o) => ({
                  id: o.id,
                  label: `${soNumber(o)} · ${o.customerName}`,
                  description: `${o.deliveryDate ? `Due ${o.deliveryDate}` : 'No delivery date'}${o.allowPartialDelivery ? '' : ' · full delivery only'}`,
                  lines: o.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                })),
              }] satisfies CopySourceType<'SO'>[]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter((id): id is string => !!id))}
              onCancel={() => setCopying(false)}
              onCopy={(_type, docId, picks) => {
                const order = m.orders.find((o) => o.id === docId);
                setCopying(false);
                if (order) setDraft(copyLines(draft, order, picks));
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
