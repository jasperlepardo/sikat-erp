import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Combobox, Form, FormField, IconButton, List, Panel, PanelHeader, panelHeaderIcons, Select, Tabs, Text, TextField, Checkbox } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { formatAddress } from '../../../../mocks/address';
import { contactName, type Partner } from '../../../../mocks/partners';
import { NO_SALES_EMPLOYEE, SALES_SETTINGS, SO_SERIES, blankSalesOrder, newSoLine, type SalesOrder, type SoStatus } from '../../../../mocks/salesOrders';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { BASE_PRICE_LIST_ID, priceListName } from '../../../../services/priceLists';
import { termDays } from '../../../../services/purchaseOrders';
import { cancelSalesOrder, closeSalesOrder, openQty, findDuplicateCustomerRef, getSalesOrder, listSalesOrders, openOrdersTotal, saveSalesOrder, seriesOf, soDueDate, soNumber, soTotals } from '../../../../services/salesOrders';
import { determineTax } from '../../../../services/taxDetermination';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { AccountingTab } from './AccountingTab';
import { ContentsTab } from './ContentsTab';
import { LogisticsTab } from './LogisticsTab';
import { ALL_CURRENCIES, SO_LIST_PATH, buildContext, linePricing, proposedTaxCode, type SoContext, type SoDraft, type SoMasters } from './types';

type TabId = 'contents' | 'logistics' | 'accounting' | 'attachments';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting', attachments: 'Attachments' };

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
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(!d.deliveryDate || d.deliveryDate >= d.postingDate, 'header', 'deliveryDate', 'Delivery date is before the posting date.');
  need(d.currency !== ALL_CURRENCIES, 'header', 'currency', 'Pick the document currency.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate} — add it in Settings › Accounting & Tax › Exchange rates.`);

  need(d.lines.length, 'contents', 'lines', 'Add at least one line.');
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
  const [tab, setTab] = useState<TabId>('contents');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [warning, setWarning] = useState<string>();
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
    ]).then(([customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, accts, ours]) => {
      if (cancelled) return;
      setM({ customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, accounts: accts, company: ours });
    });
    if (!isNew && id) {
      getSalesOrder(id).then((so) => !cancelled && setDraft(so ?? null));
      listSalesOrders().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((o) => o.id)));
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

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading sales order…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="shopping_bag" title="Sales order not found" />
        <Panel.Body>
          <Button onClick={() => navigate(SO_LIST_PATH)}>Back to sales orders</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const ctx = buildContext(draft, m);
  const { customer } = ctx;
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const series = seriesOf(draft.seriesId);
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

  /** Picking the customer fills everything that defaults from it, and reprices the lines. */
  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    if (!c) return update({ customerId: '', customerCode: '', customerName: '', contactId: '' });
    const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
    const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? bill;
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
    const doc: SoDraft = { ...draft, lines: draft.lines.filter((l) => (draft.docType === 'Service' ? l.description.trim() || l.unitPrice : l.itemId)) };
    const found = validate(doc, buildContext(doc, m), m, asDraft);
    setProblems(found);
    if (found.length) {
      const first = found.find((p) => p.tab !== 'header');
      if (first) setTab(first.tab as TabId);
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
  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Open' && draft.docType === 'Item' && draft.lines.some((l) => openQty(l) > 0)
      ? [{ label: 'Copy to delivery', icon: 'local_shipping', onSelect: () => navigate('/sales/deliveries/new', { state: { fromOrder: draft.id } }) }]
      : []),
    ...(draft.status === 'Open' && draft.lines.some((l) => openQty(l) > 0)
      ? [{ label: 'Copy to A/R invoice', icon: 'receipt', onSelect: () => navigate('/sales/invoices/new', { state: { fromOrder: draft.id } }) }]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: () => act(() => closeSalesOrder(saved), 'closed') }] : []),
    ...(draft.status === 'Open' && !delivered ? [{ label: 'Cancel sales order', icon: 'cancel', onSelect: () => act(() => cancelSalesOrder(saved), 'cancelled') }] : []),
    ...(customer ? [{ label: `Open customer ${customer.code}`, icon: 'person', onSelect: () => navigate(`/sales/customers/${customer.id}`) }] : []),
  ];

  const title = isNew ? 'New sales order' : draft.status === 'Draft' ? 'Draft sales order' : soNumber(draft);
  const tabBadge = (t: TabId) => (problems.some((p) => p.tab === t) ? '!' : t === 'attachments' && draft.attachments.length ? String(draft.attachments.length) : undefined);

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="shopping_bag"
          title={title}
          subcopy={draft.customerName ? `${draft.customerCode} · ${draft.customerName}` : 'Take an order from a customer.'}
          leading={
            isNew ? undefined : (
              <>
                <IconButton type="button" label="Next" intent="default" variant="solid" size="extra-large" disabled={!nextId} onClick={() => navigate(`${SO_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton type="button" label="Previous" intent="default" variant="solid" size="extra-large" disabled={!prevId} onClick={() => navigate(`${SO_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
              </>
            )
          }
          tabs={<Tabs variant="outline" value={tab} onValueChange={(v) => setTab(v as TabId)} items={(Object.keys(TAB_LABEL) as TabId[]).map((t) => ({ value: t, label: TAB_LABEL[t], badge: tabBadge(t) }))} />}
          status={isNew ? undefined : <Badge size="small" intent={SO_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(SO_LIST_PATH)}>
                {ctx.readOnly ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : ctx.added ? 'Update' : 'Add'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
          {warning ? (
            <Alert intent="warning" variant="outline" title="Check before saving">
              {warning} Press {ctx.added ? 'Update' : 'Add'} again to save anyway.
            </Alert>
          ) : null}
          {ctx.readOnly ? (
            <Alert intent="default" variant="outline" title={`This sales order is ${draft.status.toLowerCase()}`}>
              Only remarks and attachments can change{draft.closeDate ? ` (${draft.status.toLowerCase()} ${formatDate(draft.closeDate)})` : ''}. Its committed stock has been released.
            </Alert>
          ) : null}

          <fieldset disabled={ctx.readOnly} className="contents">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Section icon="person" title="Customer">
                <Fields>
                  <div className="md:col-span-2">
                    {customer && ctx.added ? (
                      <ReadOnly label="Customer" value={draft.customerName} description={`${draft.customerCode} · ${draft.currency}`} />
                    ) : (
                      <FormField label="Customer" required error={errors.customerId} tooltip="Only customers are listed. Name, currency and the defaults come from the customer.">
                        {(p) => (
                          <Combobox
                            {...p}
                            placeholder="Search customers"
                            options={m.customers
                              .filter((c) => c.status !== 'Inactive' || c.id === draft.customerId)
                              .map((c: Partner) => ({ value: c.id, label: c.name, subLabel: c.code, subLabelPlacement: 'top' as const, description: priceListName(c.priceListId), text: `${c.code} ${c.name}` }))}
                            value={draft.customerId || null}
                            onValueChange={pickCustomer}
                          />
                        )}
                      </FormField>
                    )}
                  </div>
                  {h.lookup(
                    'contactId',
                    'Contact person',
                    [{ value: '', label: '— None —' }, ...(customer?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))],
                    { hint: !customer ? 'Pick a customer first.' : "Defaults to the customer's default contact.", disabled: !customer },
                  )}
                  {h.text('customerRef', 'Customer ref. no.', { hint: "The customer's own PO or reference number." })}
                  <FormField label="Currency" required error={errors.currency} tooltip={delivered ? 'Locked: items were already delivered.' : `Defaults to the customer's currency (${customer?.currency ?? '—'}).`} className="md:col-span-2">
                    {(p) => (
                      <Select
                        {...p}
                        disabled={ctx.readOnly || delivered || ctx.added}
                        options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                        value={draft.currency}
                        onValueChange={(currency) => update({ currency })}
                      />
                    )}
                  </FormField>
                  {customer && customer.creditLimit > 0 ? (
                    <ReadOnly
                      label="Credit"
                      value={`PHP ${formatAmount(openBalance)} open of PHP ${formatAmount(customer.creditLimit)}`}
                      error={overCredit ? `This order (PHP ${formatAmount(totalLc)}) goes over the limit.` : undefined}
                      hint="Other open orders against the credit limit."
                    />
                  ) : null}
                </Fields>
              </Section>

              <Section icon="tag" title="Document">
                <Fields>
                  <FormField label="No." tooltip={ctx.added ? undefined : 'Assigned from the series when the order is added.'}>
                    {(p) => (
                      <div className="flex gap-1">
                        <Select aria-label="Series" className="w-40" disabled={ctx.added} options={SO_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId, docNum: 0 })} />
                        <TextField {...p} className="flex-1" readOnly placeholder="Next number" value={draft.docNum ? String(draft.docNum) : ''} />
                      </div>
                    )}
                  </FormField>
                  <ReadOnly label="Status" value={<Badge intent={SO_STATUS_INTENT[isNew ? 'Draft' : draft.status]}>{isNew ? 'New' : draft.status}</Badge>} hint={`${series.name} series. Open, Closed or Cancelled.`} error={errors.status} />
                  {h.date('postingDate', 'Posting date', {
                    required: true,
                    error: errors.postingDate,
                    disabled: ctx.added,
                    hint: 'Defaults to today. Sets the exchange rate, tax rates and which prices apply.',
                  })}
                  {h.date('deliveryDate', 'Delivery date', { error: errors.deliveryDate, hint: 'When the customer expects it. Drives delivery planning.' })}
                  {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate, hint: 'Defaults to today.' })}
                  <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} hint="Set when the order is closed or cancelled." />
                </Fields>
              </Section>
            </div>

            {tab === 'contents' ? <ContentsTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} /> : null}
            {tab === 'logistics' ? <LogisticsTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} /> : null}
            {tab === 'accounting' ? <AccountingTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} /> : null}
          </fieldset>
          {tab === 'attachments' ? (
            <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="The customer's PO, quotation or approval e-mail." withDescription />
          ) : null}

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
        </Panel.Body>
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
