import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, ButtonGroup, Card, CardField, Combobox, Form, Icon, IconButton, List, Panel, PanelHeader, panelHeaderIcons, Tabs, Text, TextField, Checkbox, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { Fields, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { formatAddress, type PostalAddress } from '../../../../mocks/address';
import { contactName, type PartnerAddress } from '../../../../mocks/partners';
import { countryName } from '../../../../services/partnerMasters';
import { NO_SALES_EMPLOYEE, SALES_SETTINGS, blankSalesOrder, newSoLine, type SalesOrder, type SoStatus } from '../../../../mocks/salesOrders';
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
import { cancelSalesOrder, closeSalesOrder, openQty, findDuplicateCustomerRef, getSalesOrder, listSalesOrders, openOrdersTotal, saveSalesOrder, soDueDate, soNumber, soTotals } from '../../../../services/salesOrders';
import { listDeliveries } from '../../../../services/deliveries';
import { determineTax } from '../../../../services/taxDetermination';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { AccountingTab } from './AccountingTab';
import { ContentsTab } from './ContentsTab';
import { LogisticsTab } from './LogisticsTab';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { ALL_CURRENCIES, SO_LIST_PATH, buildContext, linePricing, proposedTaxCode, type SoContext, type SoDraft, type SoMasters } from './types';
import { useDocTitle } from '../../../../services/useDocTitle';

type TabId = 'contents' | 'logistics' | 'accounting' | 'attachments';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting', attachments: 'Attachments' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

export const SO_STATUS_INTENT: Record<SoStatus, 'default' | 'primary' | 'success' | 'danger'> = {
  Draft: 'default',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

/** Required and conditional fields from the field map, checked on Add / Update. Drafts only need a customer. */
function validate(d: SoDraft, ctx: SoContext, m: SoMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'accounting', 'postingDate', 'Posting date is required.');
  need(!d.deliveryDate || d.deliveryDate >= d.postingDate, 'accounting', 'deliveryDate', 'Delivery date is before the posting date.');
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
  need(!d.requiredDate || d.requiredDate >= d.postingDate, 'accounting', 'requiredDate', 'Required date is before the posting date.');
  need(!d.cancellationDate || d.cancellationDate >= d.postingDate, 'accounting', 'cancellationDate', 'Cancellation date is before the posting date.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'accounting', 'dueDate', 'Due date is before the posting date.');
  return problems;
}

/** Keyed by record so moving between orders (or duplicating into /new) starts a fresh form. */
export function SalesOrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <SalesOrderForm key={id === 'new' ? location.key : id} />;
}

function SalesOrderForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: SoDraft } | null)?.copyFrom;

  const [draft, setDraft] = useState<SoDraft | null | undefined>(isNew ? (copyFrom ?? { ...blankSalesOrder(CURRENT_USER_ID), lines: [newSoLine({ warehouse: '' })] }) : undefined);
  const [m, setM] = useState<SoMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [warning, setWarning] = useState<string>();
  const [closeWarning, setCloseWarning] = useState<string>();
  const [openBalance, setOpenBalance] = useState(0);
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
    ]).then(([customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, accts, ours, series]) => {
      if (cancelled) return;
      setM({ customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, accounts: accts, company: ours, soSeries: series });
    });
    if (!isNew && id) {
      getSalesOrder(id).then((so) => !cancelled && setDraft(so ?? null));
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
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="shopping_bag" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="Sales order not found" />
        <Panel.Body>
          <Button onClick={() => navigate(SO_LIST_PATH)}>Back to sales orders</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const ctx = buildContext(draft, m);
  const { customer } = ctx;
  const at = draft.id ? siblings.indexOf(draft.docNum ? soNumber(draft as SalesOrder) : draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = soTotals(draft, ctx.rateOf, docCurrency?.rounding);
  const delivered = draft.lines.some((l) => l.deliveredQty > 0);
  const totalLc = totals.total * ctx.fx;
  const overCredit = SALES_SETTINGS.creditLimitCheck && customer && customer.creditLimit > 0 && openBalance + totalLc > customer.creditLimit && !ctx.readOnly;
  // What the customer does on their side (withholding), from the tax rules — notes, not totals.
  const taxNotes = [
    ...new Set(
      draft.lines.flatMap((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item && customer ? determineTax('Sales', item, customer, m.tax, draft.postingDate).notes : [];
      }),
    ),
  ];

  const update = (patch: Partial<SoDraft>) => setDraft({ ...draft, ...patch });
  const h = bind(draft, update);

  const locationIcon = <Icon size={16}>location_on</Icon>;
  const customerAddresses = customer?.addresses ?? [];
  const addrText = (a: PartnerAddress) => formatAddress(a, customer?.name);
  const addrFields = (a: PostalAddress) => {
    const line = [a.addressLine, a.block, a.city, a.countryCode === 'PH' ? a.province : countryName(a.countryCode), a.zip].filter(Boolean).join(', ');
    return line ? [{ label: 'Address', value: line }] : [];
  };
  const addrOptions = (current: string, defaultId: string | undefined, tag: string) => {
    const known = customerAddresses.map((a) => ({
      value: a.id,
      label: `${a.label || 'Untitled address'}${a.id === defaultId ? ` (${tag})` : ''}`,
      icon: locationIcon,
      fields: addrFields(a),
    }));
    if (!current || customerAddresses.some((a) => addrText(a) === current)) return known;
    const lines = current.split('\n').filter(Boolean);
    const rest = lines.slice(1).join(', ');
    return [{ value: '__custom__', label: lines[0] ?? 'Address on this order', icon: locationIcon, fields: rest ? [{ label: 'Address', value: rest }] : [] }, ...known];
  };
  const addrPicked = (current: string) => customerAddresses.find((a) => addrText(a) === current)?.id ?? (current ? '__custom__' : '');
  const fillAddr = (field: 'shipTo' | 'billTo', id: string) => {
    const a = customerAddresses.find((x) => x.id === id);
    if (a) update({ [field]: addrText(a) });
  };

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
      journalRemark: `Sales Orders – ${c.code}`,
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

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    // Lines never given an item (or, on service orders, a description) are dropped.
    const doc: SoDraft = { ...draft, lines: draft.lines.filter((l) => l.itemId) };
    const found = validate(doc, buildContext(doc, m), m, asDraft);
    setProblems(found);
    if (found.length) {
      const first = found.find((p) => p.tab !== 'header');
      if (first) void first.tab; // scroll to section when panel support lands
      return;
    }
    if (!asDraft && !warning) {
      const dup = await findDuplicateCustomerRef(doc);
      const credit = overCredit ? `This order takes ${doc.customerName} to PHP ${formatAmount(openBalance + totalLc)} open, over their PHP ${formatAmount(customer!.creditLimit)} credit limit.` : '';
      const message = [dup ? `Order ${soNumber(dup)} from ${doc.customerName} already has Customer Ref. No. ${doc.customerRef}.` : '', credit].filter(Boolean).join(' ');
      if (message) return setWarning(message);
    }
    setSaving(true);
    try {
      const so = await saveSalesOrder(doc, { asDraft });
      navigate(SO_LIST_PATH, { state: { notice: asDraft ? `Draft saved — ${so.customerName}.` : `Sales order ${soNumber(so)} ${isNew || draft.status === 'Draft' ? 'added' : 'updated'} — ${so.customerName}.` } });
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
  const openLines = draft.lines.filter((l) => openQty(l) > 0);
  const goodsLines = openLines.filter((l) => m.items.find((i) => i.id === l.itemId)?.inventoryItem);
  const svcLines = openLines.filter((l) => l.itemId ? !m.items.find((i) => i.id === l.itemId)?.inventoryItem : !!l.description);
  const isMixed = goodsLines.length > 0 && svcLines.length > 0;

  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
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
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(draft.status === 'Open' && !delivered ? [{ label: 'Cancel sales order', icon: 'cancel', onSelect: cancelIt }] : []),
    ...(customer ? [{ label: `Open customer ${customer.code}`, icon: 'person', onSelect: () => navigate(`/sales/customers/${customer.id}`) }] : []),
  ];

  const title = isNew ? 'New sales order' : draft.status === 'Draft' ? 'Draft sales order' : soNumber(draft);

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="shopping_bag"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32} iconVariant="outline"
          title={title}
          trailing={
            isNew ? undefined : (
              <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
                <IconButton type="button" label="Previous" size="small"
                  shape="pill" disabled={!prevId} onClick={() => navigate(`${SO_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
                <IconButton type="button" label="Next" size="small"
                  shape="pill" disabled={!nextId} onClick={() => navigate(`${SO_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
              </ButtonGroup>
            )
          }
          tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
          status={isNew ? undefined : <Badge size="small" intent={SO_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(SO_LIST_PATH)}>
                {ctx.readOnly ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : ctx.added ? 'Update' : 'Add'}
              </Button>
            </>
          }
        />
        {page === 'activity' ? (
          <Panel.Body>
            <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
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
        {page === 'details' ? <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
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

          <fieldset disabled={ctx.readOnly} className="contents">
            <div className="grid grid-cols-1 gap-2">
              <Section icon="person" title="Customer">
                <Fields>
                  <div className="md:col-span-2">
                    <CardField
                      label="Customer"
                      required
                      placeholder="Search customers"
                      options={m.customers
                        .filter((c) => c.status !== 'Inactive' || c.id === draft.customerId)
                        .map((c): CardFieldOption => ({
                          value: c.id,
                          label: c.name,
                          icon: <Icon size={16}>person</Icon>,
                          fields: [
                            { label: 'Code', value: c.code },
                            ...(c.tin ? [{ label: 'TIN', value: c.tin }] : []),
                          ],
                        }))}
                      value={draft.customerId}
                      onValueChange={(id) => pickCustomer(id || null)}
                      readOnly={!!(customer && ctx.added)}
                    />
                    {errors.customerId && <Text variant="small" tone="danger">{errors.customerId}</Text>}
                  </div>
                  <CardField
                    label="Contact person"
                    options={(customer?.contacts ?? [])
                      .filter((c) => c.active || c.id === draft.contactId)
                      .map((c) => ({
                        value: c.id,
                        label: contactName(c),
                        icon: <Icon size={16}>person</Icon>,
                        fields: [
                          ...(c.position ? [{ label: 'Position', value: c.position }] : []),
                          ...(c.mobile || c.tel1 ? [{ label: 'Phone', value: c.mobile || c.tel1 }] : []),
                          ...(c.email ? [{ label: 'Email', value: c.email }] : []),
                        ],
                      }))}
                    value={draft.contactId}
                    onValueChange={(contactId) => update({ contactId: contactId ?? '' })}
                    placeholder={customer ? 'Select a contact person' : 'Pick a customer first'}
                    readOnly={ctx.readOnly || !customer}
                  />
                  {h.text('customerRef', 'Customer ref. no.', { hint: "The customer's own PO or reference number." })}
                  <CardField
                    label="Ship to"
                    options={addrOptions(draft.shipTo, customer?.defaultShipToId, 'default ship-to')}
                    value={addrPicked(draft.shipTo)}
                    onValueChange={(v) => fillAddr('shipTo', v)}
                    placeholder={customer ? 'Select a delivery address' : 'Pick a customer first'}
                    readOnly={ctx.readOnly}
                  />
                  <CardField
                    label="Bill to"
                    options={addrOptions(draft.billTo, customer?.defaultBillToId, 'default bill-to')}
                    value={addrPicked(draft.billTo)}
                    onValueChange={(v) => fillAddr('billTo', v)}
                    placeholder={customer ? 'Select a billing address' : 'Pick a customer first'}
                    readOnly={ctx.readOnly}
                  />
                  {customer && !customerAddresses.length ? (
                    <Text variant="small" tone="muted">
                      {customer.name} has no addresses yet — add them on the customer record.
                    </Text>
                  ) : null}
                </Fields>
                {customer && customer.creditLimit > 0 ? (
                  <Card>
                    <Card.Header icon={<Icon size={24}>credit_score</Icon>}>Credit</Card.Header>
                    <Card.Content>
                      <div className="flex items-baseline justify-between gap-2">
                        <Text variant="h3" as="p" tone={overCredit ? 'danger' : undefined}>
                          PHP {formatAmount(openBalance + totalLc)}
                        </Text>
                        <Text variant="small" tone={overCredit ? 'danger' : 'muted'}>
                          {Math.round(((openBalance + totalLc) / customer.creditLimit) * 100)}% of PHP {formatAmount(customer.creditLimit)}
                        </Text>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-neutral-subtle)' }}>
                        {overCredit ? (
                          <div className="h-full w-full rounded-full" style={{ backgroundColor: 'var(--color-bg-danger)' }} />
                        ) : (
                          <>
                            <div className="h-full" style={{ width: `${Math.min((openBalance / customer.creditLimit) * 100, 100)}%`, backgroundColor: 'var(--color-bg-primary)' }} />
                            <div className="h-full" style={{ width: `${Math.min((totalLc / customer.creditLimit) * 100, Math.max(0, 100 - (openBalance / customer.creditLimit) * 100))}%`, backgroundColor: 'var(--color-bg-primary-muted)' }} />
                          </>
                        )}
                      </div>
                      <div className="flex justify-between gap-2">
                        <Text variant="small" tone={overCredit ? 'danger' : 'muted'}>
                          {overCredit
                            ? `Over limit by PHP ${formatAmount(openBalance + totalLc - customer.creditLimit)}`
                            : `PHP ${formatAmount(customer.creditLimit - openBalance - totalLc)} available`}
                        </Text>
                        {!overCredit && totalLc > 0 ? (
                          <Text variant="small" tone="muted">
                            this order PHP {formatAmount(totalLc)}
                          </Text>
                        ) : null}
                      </div>
                    </Card.Content>
                  </Card>
                ) : null}
              </Section>
            </div>

            <ContentsTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} />
            <LogisticsTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} />
            <AccountingTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} />
          </fieldset>
          <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="The customer's PO, quotation or approval e-mail." withDescription />


          <Section icon="functions" title="Totals">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Fields cols={1}>
                <fieldset disabled={ctx.readOnly} className="contents">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true, placeholder: NO_SALES_EMPLOYEE, hint: 'Defaults from the customer.' })}
                    {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document.' })}
                  </div>
                </fieldset>
                {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the order is closed.' })}
              </Fields>
              <fieldset disabled={ctx.readOnly} className="contents">
                <List.Group divider>
                  <TotalRow label="Total before discount" value={totals.beforeDiscount} code={draft.currency} />
                  <TotalRow
                    label="Discount"
                    value={totals.discount ? -totals.discount : 0}
                    code={draft.currency}
                    input={
                      <TextField aria-label="Document discount %" type="number" min={0} className="w-24" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />
                    }
                  />
                  {SALES_SETTINGS.manageFreightInDocuments ? (
                    <TotalRow
                      label="Freight"
                      value={totals.freight}
                      code={draft.currency}
                      input={
                        <div className="flex gap-1">
                          <TextField aria-label={`Freight (${draft.currency}, net)`} type="number" min={0} className="w-32" prefix={draft.currency} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />
                          <Combobox
                            aria-label="Freight tax code"
                            className="w-28"
                            options={m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: c.code }))}
                            value={draft.freightTaxCode}
                            onValueChange={(freightTaxCode) => update({ freightTaxCode: freightTaxCode ?? '' })}
                          />
                        </div>
                      }
                    />
                  ) : null}
                  <TotalRow
                    label="Rounding"
                    value={totals.rounding}
                    code={draft.currency}
                    input={
                      <Checkbox aria-label="Apply rounding" checked={draft.rounding} onChange={(e) => update({ rounding: e.currentTarget.checked })}>
                        {docCurrency?.rounding ?? 'No rounding'}
                      </Checkbox>
                    }
                  />
                  <TotalRow label="Tax" value={totals.tax} code={draft.currency} />
                  <TotalRow label="Total" value={totals.total} code={draft.currency} strong />
                  {draft.currency !== 'PHP' ? (
                    <TotalNote>
                      ≈ PHP {formatAmount(totalLc)} at {ctx.fx ? `${ctx.fx} (${formatDate(ctx.fxDate)} rate)` : '—'}.
                    </TotalNote>
                  ) : null}
                  {taxNotes.map((n) => (
                    <TotalNote key={n}>{n}</TotalNote>
                  ))}
                </List.Group>
              </fieldset>
            </div>
          </Section>
        </Panel.Body> : null}
      </Panel>
    </Form>
  );
}

function TotalRow({ label, value, code, input, strong }: { label: string; value: number; code: string; input?: ReactNode; strong?: boolean }) {
  const emphasis = (node: ReactNode) => (strong ? <Text as="span" weight="semibold" tone="heading">{node}</Text> : node);
  return (
    <List.Item
      title={
        <span className="flex items-center gap-2">
          <span className="whitespace-nowrap">{emphasis(label)}</span>
          {input ? <span className="flex-none">{input}</span> : null}
        </span>
      }
      content={<span className="whitespace-nowrap tabular-nums">{emphasis(`${code} ${formatAmount(value)}`)}</span>}
    />
  );
}

function TotalNote({ children }: { children: ReactNode }) {
  return (
    <List.Item
      variant="value-only"
      content={
        <Text variant="small" tone="muted">
          {children}
        </Text>
      }
    />
  );
}
