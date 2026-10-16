import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Form, Panel, PanelHeader, Tabs, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { formatAddress } from '../../../../mocks/address';
import type { Partner } from '../../../../mocks/partners';
import { SALES_SETTINGS, blankSalesOrder, newSoLine, openCommitted, type SalesOrder, type SoStatus } from '../../../../mocks/salesOrders';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { BASE_PRICE_LIST_ID } from '../../../../services/priceLists';
import { matchingSeries, soSeries } from '../../../../services/allSeries';
import { termDays } from '../../../../services/purchaseOrders';
import { cancelSalesOrder, closeSalesOrder, getSalesSettings, openQty, findDuplicateCustomerRef, getSalesOrder, listSalesOrders, openOrdersTotal, recallSalesOrder, saveSalesOrder, soDueDate, soNumber, soTotals } from '../../../../services/salesOrders';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { logRejection } from '../../../../services/approvalRules';
import { listDeliveries } from '../../../../services/deliveries';
import { ContentsTab } from './ContentsTab';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { ALL_CURRENCIES, SO_LIST_PATH, buildContext, linePricing, proposedTaxCode, shortages, type Shortage, type SoContext, type SoDraft, type SoMasters } from './types';
import { PO_LIST_PATH } from '../../../purchasing/orders/detail/PurchaseOrderDetail';
import type { PoSuggestion } from '../../../purchasing/orders/detail/types';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { NotFound, PrevNext, neighbours } from '../../../../components/form/DetailNav';
import { DatesCard } from './DatesCard';
import { SettingsCard } from './SettingsCard';
import { BpChannelCard } from './BpChannelCard';
import { AssignmentCard } from './AssignmentCard';
import { SoAttachmentsCard } from './SoAttachmentsCard';
import { CustomerCard } from '../../shared/CustomerCard';
import { TotalsFooter } from '../../shared/TotalsFooter';
import { DeliverySubTab } from './DeliverySubTab';
import { CustomerDetailsPanel } from '../../shared/CustomerDetailsPanel';

type TabId = 'contents';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

export const SO_STATUS_INTENT: Record<SoStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

function validate(d: SoDraft, ctx: SoContext, m: SoMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(!d.deliveryDate || d.deliveryDate >= d.postingDate, 'header', 'deliveryDate', 'Delivery date is before the posting date.');
  need(d.currency !== ALL_CURRENCIES, 'header', 'currency', 'Pick the document currency.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate} — add it in Settings › Accounting & Tax › Exchange rates.`);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(item.salesItem, 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't a sales item.`);
    need(d.status !== 'Draft' || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${d.postingDate}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.quantity >= l.deliveredQty, 'contents', `line:${l.id}:quantity`, `${n}: ${l.deliveredQty} already delivered — quantity can't be less.`);
    need(!item.inventoryItem || l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse it ships from.`);
  }
  need(!d.requiredDate || d.requiredDate >= d.postingDate, 'header', 'requiredDate', 'Required date is before the posting date.');
  need(!d.cancellationDate || d.cancellationDate >= d.postingDate, 'header', 'cancellationDate', 'Cancellation date is before the posting date.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  return problems;
}

/** Keyed by record so moving between orders (or duplicating into /new) starts a fresh form. */
export function SalesOrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <SalesOrderForm key={id === 'new' ? location.key : id} />;
}

function SalesOrderForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: SoDraft } | null)?.copyFrom;

  const approved = !getSalesSettings().requireSoApproval;
  const [draft, setDraft] = useState<SoDraft | null | undefined>(isNew ? { ...(copyFrom ?? { ...blankSalesOrder(CURRENT_USER_ID), lines: [newSoLine({ warehouse: '' })] }), approved } : undefined);
  const [m, setM] = useState<SoMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = (v: PageId) => navigate(`${SO_LIST_PATH}/${id}/${v}`, { replace: true });
  useEffect(() => { if (!tabParam) navigate(`${SO_LIST_PATH}/${id}/details`, { replace: true }); }, []);
  const [contentTab, setContentTab] = useState<'item' | 'delivery'>('item');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [warning, setWarning] = useState<string>();
  const [closeWarning, setCloseWarning] = useState<string>();
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [openBalance, setOpenBalance] = useState(0);
  // What the order commits as saved — already in the items' Committed, so it's given back when checking stock.
  const [ownCommitted, setOwnCommitted] = useState(() => new Map<string, number>());
  const [vendors, setVendors] = useState<Partner[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('customer'),
      listItems(),
      loadInventoryMasters(),
      companyTax.list(),
      taxCodes.list(),
      taxGroups.list(),
      withholdingTaxes.list(),
      withholdingGroups.list(),
      currencies.list(),
      exchangeRates.list(),
      accounts.list(),
      loadCurrentCompany(),
      soSeries.list(),
      listPartnersByRole('vendor'),
    ]).then(([customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, accts, ours, series, vendorRows]) => {
      if (cancelled) return;
      setVendors(vendorRows);
      setM({ customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, accounts: accts, company: ours, soSeries: series });
    });
    if (!isNew && id) {
      getSalesOrder(id).then((so) => {
        if (cancelled) return;
        setDraft(so ?? null);
        if (so) setOwnCommitted(openCommitted(so));
      });
      listSalesOrders().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((o) => o.docNum ? soNumber(o) : o.id)));
    }
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // The customer's other open orders, for the credit check.
  const customerId = draft?.customerId;
  useEffect(() => {
    if (!customerId || !m) return;
    openOrdersTotal(customerId, draft?.id, m.tax.codes).then(setOpenBalance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, m]);

  useDocTitle(draft == null || !draft.docNum ? undefined : isNew ? 'New sales order' : draft.status === 'Draft' ? 'Draft sales order' : soNumber(draft));
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading sales order…</Text>;
  if (draft === null) return <NotFound icon="shopping_bag" title="Sales order not found" backTo={SO_LIST_PATH} backLabel="Back to sales orders" />;

  const ctx = buildContext(draft, m, ownCommitted);
  const { customer } = ctx;
  const short = ctx.readOnly ? [] : shortages(draft, m, ownCommitted);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? soNumber(draft as SalesOrder) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = soTotals(draft, ctx.rateOf, docCurrency?.rounding);
  const totalLc = totals.total * ctx.fx;
  const delivered = draft.lines.some((l) => l.deliveredQty > 0);
  const overCredit = SALES_SETTINGS.creditLimitCheck && customer && customer.creditLimit > 0 && openBalance + totalLc > customer.creditLimit && !ctx.readOnly;

  const update = (patch: Partial<SoDraft>) => setDraft({ ...draft, ...patch });

  /** Picking the customer fills everything that defaults from it, and reprices the lines. */
  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    if (!c) return update({ customerId: '', customerCode: '', customerName: '', contactId: '' });
    const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
    const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? bill;
    const allSeries = m.soSeries;
    const context = { businessType: c.businessType, bpGroupId: c.bpGroupId, territoryId: c.territoryId, currency: c.currency === 'All currencies' ? 'PHP' : c.currency };
    const matched = matchingSeries(allSeries, context);
    const fallback = allSeries.find((s) => s.isDefault && s.active) ?? allSeries.find((s) => s.active);
    const seriesId = (matched ?? fallback)?.id ?? draft.seriesId;
    const next: SoDraft = {
      ...draft,
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
      allowPartialDelivery: c.allowPartialDelivery,
      discountPct: c.totalDiscount || 0,
      seriesId,
      docNum: seriesId !== draft.seriesId ? 0 : draft.docNum,
      billTo: bill ? formatAddress(bill, c.name) : '',
      shipTo: ship ? formatAddress(ship, c.name) : '',
      journalRemark: defaultJournalRemark('sales-orders', { entityCode: c.code, entityName: c.name }),
    };
    const nextCtx = buildContext(next, m);
    // Tax codes and prices depend on the customer, so lines re-propose theirs.
    update({
      ...next,
      lines: draft.lines.map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        if (!item) return l;
        const taxCode = proposedTaxCode(item, c, m, next.postingDate);
        const priced = { ...l, taxCode, priceListId: c.priceListId || BASE_PRICE_LIST_ID };
        return { ...priced, ...(nextCtx.fx ? linePricing(item, priced, next, nextCtx) : {}) };
      }),
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<SoDraft> = {}) => {
    e?.preventDefault();
    // Lines never given an item (or, on service orders, a description) are dropped.
    const doc: SoDraft = { ...draft, ...overrides, lines: draft.lines.filter((l) => l.itemId) };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, buildContext(doc, m), m, effectiveDraft);
    setProblems(found);
    if (found.length) {
      const first = found.find((p) => p.tab !== 'header');
      if (first) void first.tab; // scroll to section when panel support lands
      return;
    }
    if (!effectiveDraft && !warning) {
      const dup = await findDuplicateCustomerRef(doc);
      const credit = overCredit ? `This order takes ${doc.customerName} to PHP ${formatAmount(openBalance + totalLc)} open, over their PHP ${formatAmount(customer!.creditLimit)} credit limit.` : '';
      const stock = shortages(doc, m, ownCommitted).map(shortageText).join(' ');
      const message = [dup ? `Order ${soNumber(dup)} from ${doc.customerName} already has Customer Ref. No. ${doc.customerRef}.` : '', credit, stock].filter(Boolean).join(' ');
      if (message) return setWarning(message);
    }
    setSaving(true);
    try {
      const so = await saveSalesOrder(doc, { asDraft: effectiveDraft });
      navigate(SO_LIST_PATH, { state: { notice: effectiveDraft ? `Draft saved — ${so.customerName}.` : so.status === 'Not Confirmed' ? `Sales order ${soNumber(so)} submitted for approval — ${so.customerName}.` : `Sales order ${soNumber(so)} ${isNew || draft.status === 'Draft' ? 'added' : 'updated'} — ${so.customerName}.` } });
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<SalesOrder>, notice: string) => {
    try {
      const so = await run();
      navigate(SO_LIST_PATH, { state: { notice: `Sales order ${soNumber(so)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: SoDraft = {
      ...structuredClone(draft),
      id: undefined,
      status: 'Draft',
      docNum: 0,
      customerRef: '',
      postingDate: today,
      documentDate: today,
      deliveryDate: '',
      closeDate: '',
      cancellationDate: '',
      dueDate: soDueDate(today, termDays(draft.paymentTermId), draft.dueMonths, draft.dueDays),
      attachments: [],
      lines: draft.lines.map((l) => ({ ...l, id: newSoLine().id, deliveredQty: 0, status: 'Open' as const })),
    };
    navigate(`${SO_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as SalesOrder;
  const closeIt = async () => {
    if (!closeWarning) {
      const dns = await listDeliveries();
      const openDns = dns.filter((d) => d.status === 'Open' && d.lines.some((l) => l.baseId === saved.id));
      if (openDns.length) {
        setCloseWarning(`This order has ${openDns.length} open deliver${openDns.length === 1 ? 'y' : 'ies'} — closing it will leave them unlinked. Click Close again to proceed.`);
        return;
      }
    }
    setCloseWarning(undefined);
    return act(() => closeSalesOrder(saved), 'closed');
  };
  const cancelIt = () => act(() => cancelSalesOrder(saved), 'cancelled');

  // What's still uncovered after incoming POs, one suggested PO per vendor.
  const toBuy = short.filter((s) => s.toOrder > 0);
  const vendorOf = (s: Shortage) => s.item.defaultVendorId || s.item.vendors[0]?.vendorId || '';
  const byVendor = [...new Set(toBuy.map(vendorOf))].map((vendorId) => ({
    vendorId,
    vendor: vendors.find((v) => v.id === vendorId),
    rows: toBuy.filter((s) => vendorOf(s) === vendorId),
  }));
  const suggestPo = (vendorId: string, rows: Shortage[]) => {
    const suggest: PoSuggestion = {
      vendorId,
      lines: rows.map((s) => ({ itemId: s.item.id, warehouse: s.warehouse, qty: s.toOrder })),
      reference: { docType: 'Sales order', docNo: soNumber(saved), docDate: draft.postingDate, remarks: `Stock short for ${draft.customerName}` },
    };
    navigate(`${PO_LIST_PATH}/new`, { state: { suggest } });
  };
  const openLines = draft.lines.filter((l) => openQty(l) > 0);
  const goodsLines = openLines.filter((l) => m.items.find((i) => i.id === l.itemId)?.inventoryItem);
  const svcLines = openLines.filter((l) => l.itemId ? !m.items.find((i) => i.id === l.itemId)?.inventoryItem : !!l.description);
  const isMixed = goodsLines.length > 0 && svcLines.length > 0;

  const recallIt = async () => {
    const r = await recallSalesOrder(saved);
    navigate(SO_LIST_PATH, { state: { notice: `Sales order ${soNumber(r)} recalled to draft.` } });
  };
  const rejectIt = async () => {
    await logRejection('SO', saved.id, saved.customerId, rejectionReason);
    await recallSalesOrder(saved);
    navigate(SO_LIST_PATH, { state: { notice: `Sales order ${soNumber(saved)} rejected and returned to draft.` } });
  };

  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Draft' && !draft.approved ? [{ label: 'Submit for approval', icon: 'upload', onSelect: () => submit(null, false) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Approve', icon: 'verified', onSelect: () => submit(null, false, { approved: true }) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Reject', icon: 'cancel', onSelect: () => setRejecting(true) }] : []),
    ...(draft.status === 'Open' && openLines.length > 0
      ? [{ label: 'Copy to delivery', icon: 'local_shipping', onSelect: () => navigate('/sales/deliveries/new', { state: { fromOrder: draft.id } }) }]
      : []),
    ...(draft.status === 'Open' && openLines.length > 0
      ? isMixed
        ? [
            { label: 'Sales Invoice (goods)', icon: 'receipt', onSelect: () => navigate('/sales/invoices/new', { state: { fromOrder: draft.id, lineFilter: 'goods' } }) },
            { label: 'Official Receipt (services)', icon: 'receipt_long', onSelect: () => navigate('/sales/invoices/new', { state: { fromOrder: draft.id, lineFilter: 'services' } }) },
          ]
        : [{ label: svcLines.length > 0 ? 'Copy to Official Receipt' : 'Copy to A/R invoice', icon: 'receipt', onSelect: () => navigate('/sales/invoices/new', { state: { fromOrder: draft.id, lineFilter: svcLines.length > 0 ? 'services' : undefined } }) }]
      : []),
    ...(draft.status === 'Open'
      ? byVendor.map(({ vendorId, vendor, rows }) => ({
          label: `Suggested PO${vendor ? ` — ${vendor.name}` : ''}`,
          icon: 'add_shopping_cart',
          onSelect: () => suggestPo(vendorId, rows),
        }))
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(draft.status === 'Open' && !delivered ? [{ label: 'Cancel sales order', icon: 'cancel', onSelect: cancelIt }] : []),
  ];

  const title = isNew ? 'New sales order' : draft.status === 'Draft' ? 'Draft sales order' : soNumber(draft);
  const tabProps = { draft, update, errors, m, ctx };

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="shopping_bag"
            iconIntent="default"
            iconShape="rounded"
            iconSize={32} iconVariant="outline"
            breadcrumbs={[{ label: 'Sales Orders', href: SO_LIST_PATH }, { label: title }]}
            onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
            onBack={() => navigate(SO_LIST_PATH)}
            trailing={
              isNew ? undefined : <PrevNext path={SO_LIST_PATH} prevId={prevId} nextId={nextId} />
            }
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
            status={isNew ? undefined : <Badge size="small" intent={SO_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <>
                {ctx.readOnly ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(SO_LIST_PATH)}>Cancel</Button>}
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                  {saving ? 'Saving…' : ctx.added ? 'Update' : 'Add'}
                </Button>
              </>
            }
          />
          {page === 'activity' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'SO', id: draft.id ?? '' }} partnerId={draft.customerId} />
            </Panel.Body>
          ) : page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <SalesDocumentFlow
                kind="SO"
                id={draft.id}
                notes="Everything linked to this order: the deliveries made against it, the invoices raised, and the payments collected."
              />
            </Panel.Body>
          ) : page === 'transactions' ? (
            <Panel.Body>
              <Text variant="small" tone="muted" className="p-4">Save the order first to see related documents.</Text>
            </Panel.Body>
          ) : null}
          {page === 'details' ? (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
              {rejecting ? (
                <Alert intent="danger" variant="outline" title="Reject sales order">
                  <div className="flex flex-col gap-2">
                    <TextField aria-label="Rejection reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.currentTarget.value)} placeholder="Explain why this is being rejected…" />
                    <div className="flex gap-2">
                      <Button type="button" intent="danger" variant="solid" size="small" onClick={rejectIt}>Confirm reject</Button>
                      <Button type="button" intent="white" variant="solid" size="small" onClick={() => { setRejecting(false); setRejectionReason(''); }}>Cancel</Button>
                    </div>
                  </div>
                </Alert>
              ) : null}
              {warning ? (
                <Alert intent="warning" variant="outline" title="Check before saving">
                  {warning} Press {ctx.added ? 'Update' : 'Add'} again to save anyway.
                </Alert>
              ) : null}
              {closeWarning ? (
                <Alert intent="warning" variant="outline" title="Check before closing">
                  {closeWarning}
                </Alert>
              ) : null}
              {ctx.readOnly ? (
                <Alert intent="default" variant="outline" title={`This sales order is ${draft.status.toLowerCase()}`}>
                  Only remarks and attachments can change{draft.closeDate ? ` (${draft.status.toLowerCase()} ${formatDate(draft.closeDate)})` : ''}. Its committed stock has been released.
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
                <aside className="flex flex-col gap-2 lg:col-span-3">
                  <DatesCard {...tabProps} />
                  <SettingsCard {...tabProps} />
                  <BpChannelCard {...tabProps} />
                  <AssignmentCard {...tabProps} />
                  <SoAttachmentsCard {...tabProps} />
                </aside>

                <div className="flex flex-col gap-2 lg:col-span-9">
                  <CustomerCard
                    customers={m.customers}
                    customerId={draft.customerId}
                    customer={customer}
                    locked={ctx.added}
                    error={errors.customerId}
                    overCredit={!!overCredit}
                    onPickCustomer={pickCustomer}
                    onOpenDetails={() => setCustomerDetailsOpen(true)}
                  />
                  <Tabs
                    variant="primary"
                    value={contentTab}
                    onValueChange={(v) => setContentTab(v as 'item' | 'delivery')}
                    items={[
                      { value: 'item', label: 'Item' },
                      { value: 'delivery', label: 'Delivery' },
                    ]}
                  />
                  {contentTab === 'item' ? (
                    <ContentsTab
                      {...tabProps}
                      hideDeliveries
                      cardFooter={<TotalsFooter {...tabProps} />}
                    />
                  ) : (
                    <DeliverySubTab draft={draft} />
                  )}
                </div>
              </div>
            </Panel.Body>
          ) : null}
        </Panel>
      </Form>
      <CustomerDetailsPanel
        customer={customer}
        draft={draft}
        update={update}
        readOnly={ctx.readOnly}
        noun="order"
        open={customerDetailsOpen}
        onClose={() => setCustomerDetailsOpen(false)}
        credit={{ overCredit: !!overCredit, openBalance, totalLc }}
      />
    </>
  );
}

/** "iPad Air: needs 20 pc in WH-MNL, 12 available, 5 on order — 3 to buy." */
function shortageText(s: Shortage) {
  const uom = s.item.inventoryUom;
  const incoming = s.ordered ? `, ${s.ordered} on order` : '';
  const verdict = s.toOrder ? `${s.toOrder} ${uom} to buy` : 'covered by open POs';
  return `${s.item.itemNo} ${s.item.name}: needs ${s.need} ${uom} in ${s.warehouse}, ${Math.max(0, s.available)} available${incoming} — ${verdict}.`;
}
