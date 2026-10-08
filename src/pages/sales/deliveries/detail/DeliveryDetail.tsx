import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Checkbox, Combobox, Form, FormField, IconButton, List, Panel, PanelHeader, panelHeaderIcons, Select, Tabs, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { formatAddress } from '../../../../mocks/address';
import { DN_SERIES, blankDelivery, deliveryHeaderFrom, type Delivery, type DnStatus } from '../../../../mocks/deliveries';
import { contactName } from '../../../../mocks/partners';
import { NO_SALES_EMPLOYEE_ID, SALES_SETTINGS, type SalesOrder } from '../../../../mocks/salesOrders';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { DnPostError, addDelivery, cancelDelivery, closeDelivery, dnJournal, dnNumber, dnTotals, getDelivery, listDeliveries, saveDeliveryDraft, saveDeliveryNotes } from '../../../../services/deliveries';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { termDays } from '../../../../services/purchaseOrders';
import { listSalesOrders, openQty, soDueDate } from '../../../../services/salesOrders';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { ALL_CURRENCIES, SO_LIST_PATH, proposedTaxCode } from '../../orders/detail/types';
import { DnContents } from './DnContents';
import { DnAccounting, DnLogistics } from './DnSections';
import { DN_LIST_PATH, buildDnContext, dnLineFromOrder, type DnContext, type DnDraft, type DnMasters } from './types';

type TabId = 'contents' | 'logistics' | 'accounting' | 'attachments';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting', attachments: 'Attachments' };

export const DN_STATUS_INTENT: Record<DnStatus, 'default' | 'primary' | 'success' | 'danger'> = { Draft: 'default', Open: 'primary', Closed: 'success', Cancelled: 'danger' };

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
  need(!d.dueDate || d.dueDate >= d.postingDate, 'accounting', 'dueDate', 'Due date is before the posting date.');
  return problems;
}

export function DeliveryDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <DeliveryForm key={id === 'new' ? location.key : id} />;
}

function DeliveryForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const fromOrder = (useLocation().state as { fromOrder?: string } | null)?.fromOrder;

  const [draft, setDraft] = useState<DnDraft | null | undefined>(isNew ? blankDelivery(todayISO(), CURRENT_USER_ID) : undefined);
  const [m, setM] = useState<DnMasters>();
  const [tab, setTab] = useState<TabId>('contents');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('customer'), listItems(), loadInventoryMasters(), companyTax.list(), taxCodes.list(), taxGroups.list(), withholdingTaxes.list(),
      withholdingGroups.list(), currencies.list(), exchangeRates.list(), accounts.list(), loadCurrentCompany(), listSalesOrders(),
    ]).then(([customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, accts, ours, orders]) => {
      if (cancelled) return;
      const masters: DnMasters = { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, accounts: accts, company: ours, orders };
      setM(masters);
      // From a sales order's "Copy to delivery": every open line at its open quantity.
      const so = fromOrder && orders.find((o) => o.id === fromOrder);
      if (isNew && so) setDraft((d) => d && copyLines(d, so, so.lines.filter((l) => openQty(l) > 0).map((l) => ({ lineId: l.id, qty: openQty(l) }))));
    });
    if (!isNew && id) {
      getDelivery(id).then((dn) => !cancelled && setDraft(dn ?? null));
      listDeliveries().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((d) => d.id)));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, fromOrder]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading delivery…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="local_shipping" title="Delivery not found" />
        <Panel.Body>
          <Button onClick={() => navigate(DN_LIST_PATH)}>Back to deliveries</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const ctx = buildDnContext(draft, m);
  const { customer } = ctx;
  const ro = ctx.readOnly;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = dnTotals(draft, ctx.rateOf, docCurrency?.rounding);
  const journal = dnJournal(draft, m.items, m.inv.groups, ctx.added);
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const baseOrders = [...new Set(draft.lines.map((l) => l.baseId).filter(Boolean))];

  const update = (patch: Partial<DnDraft>) => setDraft({ ...draft, ...patch });
  const h = bind(draft, update);

  /** Copy lines from an order: the header follows the order when it's the first one. */
  function copyLines(d: DnDraft, so: SalesOrder, picks: { lineId: string; qty: number }[]): DnDraft {
    const added = picks.map((p) => dnLineFromOrder(so, so.lines.find((l) => l.id === p.lineId)!, p.qty));
    const first = !d.lines.some((l) => l.baseId);
    const header = first ? { ...deliveryHeaderFrom(so), dueDate: soDueDate(d.postingDate, termDays(so.paymentTermId), so.dueMonths, so.dueDays) } : {};
    const numbers = [...new Set([...d.orderNumber.split(', ').filter(Boolean), String(so.docNum)])].join(', ');
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
      project: c.project || '— None —',
      shippingType: c.shippingType,
      federalTaxId: c.tin,
      salesEmployeeId: c.salesEmployeeId || NO_SALES_EMPLOYEE_ID,
      useShippedGoodsAccount: c.useShippedGoodsAccount,
      discountPct: c.totalDiscount || 0,
      billTo: bill ? formatAddress(bill, c.name) : '',
      shipTo: ship ? formatAddress(ship, c.name) : '',
      journalRemark: `Deliveries – ${c.code}`,
      lines: draft.lines.map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item && !l.baseId ? { ...l, taxCode: proposedTaxCode(item, c, m, draft.postingDate) } : l;
      }),
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (ro) {
      setSaving(true);
      const dn = await saveDeliveryNotes(draft.id!, { remarks: draft.remarks, attachments: draft.attachments });
      setSaving(false);
      return navigate(DN_LIST_PATH, { state: { notice: `Remarks saved on delivery ${dnNumber(dn)}.` } });
    }
    const doc: DnDraft = { ...draft, lines: draft.lines.filter((l) => l.itemId) };
    const found = validate(doc, ctx, m, asDraft);
    setProblems(found);
    if (found.length) {
      const first = found.find((p) => p.tab !== 'header');
      if (first) setTab(first.tab as TabId);
      return;
    }
    setSaving(true);
    try {
      const dn = asDraft ? await saveDeliveryDraft(doc) : await addDelivery(doc, ctx.fx);
      navigate(DN_LIST_PATH, { state: { notice: asDraft ? `Draft saved — ${dn.customerName}.` : `Delivery ${dnNumber(dn)} added — stock is out and the sales order lines are updated.` } });
    } catch (err) {
      if (!(err instanceof DnPostError)) throw err;
      setTab('contents');
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
  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Open' && draft.lines.some((l) => l.quantity > l.invoicedQty)
      ? [{ label: 'Copy to A/R invoice', icon: 'receipt', onSelect: () => navigate('/sales/invoices/new', { state: { fromDelivery: draft.id } }) }]
      : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: () => act(() => closeDelivery(saved), 'closed') }] : []),
    ...(draft.status === 'Open' && !invoiced ? [{ label: 'Cancel delivery', icon: 'cancel', onSelect: () => act(() => cancelDelivery(saved), 'cancelled — the stock is back and the order lines are open again') }] : []),
    ...baseOrders.map((soId) => ({ label: `Open sales order ${draft.lines.find((l) => l.baseId === soId)?.baseDocNo}`, icon: 'shopping_bag', onSelect: () => navigate(`${SO_LIST_PATH}/${soId}`) })),
    ...(customer ? [{ label: `Open customer ${customer.code}`, icon: 'person', onSelect: () => navigate(`/sales/customers/${customer.id}`) }] : []),
  ];

  const title = isNew ? 'New delivery' : draft.status === 'Draft' ? 'Draft delivery' : dnNumber(draft);

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="local_shipping"
          title={title}
          subcopy={draft.customerName ? `${draft.customerCode} · ${draft.customerName}${draft.orderNumber ? ` · order ${draft.orderNumber}` : ''}` : 'Ship goods to a customer.'}
          leading={
            isNew ? undefined : (
              <>
                <IconButton type="button" label="Next" intent="default" variant="solid" size="extra-large" disabled={!nextId} onClick={() => navigate(`${DN_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton type="button" label="Previous" intent="default" variant="solid" size="extra-large" disabled={!prevId} onClick={() => navigate(`${DN_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
              </>
            )
          }
          tabs={<Tabs variant="outline" value={tab} onValueChange={(v) => setTab(v as TabId)} items={(Object.keys(TAB_LABEL) as TabId[]).map((t) => ({ value: t, label: TAB_LABEL[t], badge: problems.some((p) => p.tab === t) ? '!' : t === 'attachments' && draft.attachments.length ? String(draft.attachments.length) : undefined }))} />}
          status={isNew ? undefined : <Badge size="small" intent={DN_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(DN_LIST_PATH)}>
                {ro ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : ro ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
          {ro ? (
            <Alert intent="default" variant="outline" title={`This delivery is ${draft.status.toLowerCase()}`}>
              {draft.status === 'Cancelled'
                ? 'The stock came back, the order lines reopened and the journal entry was reversed.'
                : 'The stock is out and the journal entry is posted. Only remarks and attachments can change; to undo it, cancel the delivery.'}
            </Alert>
          ) : null}

          <fieldset disabled={ro} className="contents">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Section icon="person" title="Customer">
                <Fields>
                  <div className="md:col-span-2">
                    {ctx.based || ro ? (
                      <ReadOnly label="Customer" value={draft.customerName || '—'} description={`${draft.customerCode} · ${draft.currency}`} hint={ctx.based && !ro ? 'Set by the sales order the lines come from.' : undefined} />
                    ) : (
                      <FormField label="Customer" required error={errors.customerId}>
                        {(p) => (
                          <Combobox
                            {...p}
                            placeholder="Search customers"
                            options={m.customers.filter((c) => c.status !== 'Inactive' || c.id === draft.customerId).map((c) => ({ value: c.id, label: c.name, subLabel: c.code, subLabelPlacement: 'top' as const, text: `${c.code} ${c.name}` }))}
                            value={draft.customerId || null}
                            onValueChange={pickCustomer}
                          />
                        )}
                      </FormField>
                    )}
                  </div>
                  {h.lookup('contactId', 'Contact person', [{ value: '', label: '— None —' }, ...(customer?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))], { disabled: !customer })}
                  {h.text('customerRef', 'Customer ref. no.')}
                  <FormField label="Currency" error={errors.currency} className="md:col-span-2">
                    {(p) => <Select {...p} disabled={ro || ctx.based} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={draft.currency} onValueChange={(currency) => update({ currency })} />}
                  </FormField>
                </Fields>
              </Section>
              <Section icon="tag" title="Document">
                <Fields>
                  <FormField label="No.">
                    {(p) => (
                      <div className="flex gap-1">
                        <Select aria-label="Series" className="w-32" disabled={ctx.added} options={DN_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                        <TextField {...p} className="flex-1" readOnly placeholder="Next number" value={draft.docNum ? String(draft.docNum) : ''} />
                      </div>
                    )}
                  </FormField>
                  <ReadOnly label="Status" value={<Badge intent={DN_STATUS_INTENT[draft.status]}>{isNew ? 'New' : draft.status}</Badge>} error={errors.status} />
                  {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When the stock goes out and the cost is posted.' })}
                  {h.date('deliveryDate', 'Delivery date', { hint: 'When it reaches the customer.' })}
                  {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
                  <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
                </Fields>
              </Section>
            </div>

            {tab === 'contents' ? (
              <DnContents
                draft={draft}
                update={update}
                errors={errors}
                m={m}
                ctx={ctx}
                onCopy={(so, picks) => setDraft(copyLines(draft, so, picks))}
              />
            ) : null}
            {tab === 'logistics' ? <DnLogistics draft={draft} update={update} errors={errors} m={m} ctx={ctx} /> : null}
            {tab === 'accounting' ? <DnAccounting draft={draft} update={update} errors={errors} m={m} ctx={ctx} /> : null}
          </fieldset>
          {tab === 'attachments' ? <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="Signed delivery receipt, courier waybill, photos." withDescription /> : null}

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <Section icon="functions" title="Totals">
              <fieldset disabled={ro} className="contents">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef)}
                  {h.master('ownerId', 'Owner', salesEmployeeDef)}
                </div>
                <List.Group divider>
                  <TotalRow label="Total before discount" value={totals.beforeDiscount} code={draft.currency} />
                  <TotalRow label="Discount" value={totals.discount ? -totals.discount : 0} code={draft.currency} input={<TextField aria-label="Document discount %" type="number" min={0} className="w-24" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />} />
                  {SALES_SETTINGS.manageFreightInDocuments ? (
                    <TotalRow label="Freight" value={totals.freight} code={draft.currency} input={<TextField aria-label="Freight" type="number" min={0} className="w-32" prefix={draft.currency} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />} />
                  ) : null}
                  <TotalRow label="Rounding" value={totals.rounding} code={draft.currency} input={<Checkbox aria-label="Apply rounding" checked={draft.rounding} onChange={(e) => update({ rounding: e.currentTarget.checked })}>{docCurrency?.rounding ?? 'No rounding'}</Checkbox>} />
                  <TotalRow label="Tax" value={totals.tax} code={draft.currency} />
                  <TotalRow label="Total" value={totals.total} code={draft.currency} strong />
                </List.Group>
              </fieldset>
              {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the delivery is added.' })}
            </Section>
            <Section icon="account_balance" title="Journal entry">
              {journal.length ? (
                <List.Group divider>
                  {journal.map((j) => (
                    <List.Item key={j.account} title={accountText(j.account, m.accounts)} content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>} />
                  ))}
                </List.Group>
              ) : (
                <Text variant="small" tone="muted">Adding moves the cost of the stock shipped: Dr COGS (or Shipped Goods) / Cr Inventory, at item cost.</Text>
              )}
              <Text variant="small" tone="muted">{ctx.added ? 'As posted, at the cost the stock left at.' : 'At current item cost. Revenue and output VAT post on the A/R invoice.'}</Text>
            </Section>
          </div>
        </Panel.Body>
      </Panel>
    </Form>
  );
}

function TotalRow({ label, value, code, input, strong }: { label: string; value: number; code: string; input?: ReactNode; strong?: boolean }) {
  const emphasis = (node: ReactNode) => (strong ? <Text as="span" weight="semibold" tone="heading">{node}</Text> : node);
  return (
    <List.Item
      title={<span className="flex items-center gap-2"><span className="whitespace-nowrap">{emphasis(label)}</span>{input ? <span className="flex-none">{input}</span> : null}</span>}
      content={<span className="whitespace-nowrap tabular-nums">{emphasis(`${code} ${formatAmount(value)}`)}</span>}
    />
  );
}

