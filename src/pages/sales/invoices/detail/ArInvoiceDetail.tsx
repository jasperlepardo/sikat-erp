import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Checkbox, Combobox, Form, FormField, IconButton, List, Panel, PanelHeader, panelHeaderIcons, Select, Tabs, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../../mocks/address';
import { AR_SERIES, blankArInvoice, type ArInvoice, type ArStatus } from '../../../../mocks/arInvoices';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { CURRENT_USER } from '../../../../mocks/common';
import { contactName } from '../../../../mocks/partners';
import { NO_SALES_EMPLOYEE, SALES_SETTINGS } from '../../../../mocks/salesOrders';
import {
  ArPostError,
  addArInvoice,
  arJournal,
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
import { formatDate, todayISO } from '../../../../services/dates';
import { listDeliveries } from '../../../../services/deliveries';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { controlAccountOf } from '../../../../services/journalEntries';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { termDays } from '../../../../services/purchaseOrders';
import { listSalesOrders, openQty, soDueDate } from '../../../../services/salesOrders';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { DN_LIST_PATH } from '../../deliveries/detail/types';
import { ALL_CURRENCIES, SO_LIST_PATH, proposedTaxCode } from '../../orders/detail/types';
import { ArContents, type CopyPick } from './ArContents';
import { ArAccounting, ArLogistics } from './ArSections';
import { AR_LIST_PATH, arLineFromDelivery, arLineFromOrder, buildArContext, type ArContext, type ArDraft, type ArMasters } from './types';

type TabId = 'contents' | 'logistics' | 'accounting' | 'attachments';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting', attachments: 'Attachments' };

export const AR_STATUS_INTENT: Record<ArStatus, 'default' | 'primary' | 'success' | 'danger'> = { Draft: 'default', Open: 'primary', Closed: 'success', Cancelled: 'danger' };

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
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const from = useLocation().state as { fromDelivery?: string; fromOrder?: string } | null;

  const [draft, setDraft] = useState<ArDraft | null | undefined>(isNew ? blankArInvoice(todayISO(), CURRENT_USER) : undefined);
  const [m, setM] = useState<ArMasters>();
  const [tab, setTab] = useState<TabId>('contents');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('customer'), listItems(), loadInventoryMasters(), companyTax.list(), taxCodes.list(), taxGroups.list(), withholdingTaxes.list(),
      withholdingGroups.list(), currencies.list(), exchangeRates.list(), accounts.list(), loadCurrentCompany(), listSalesOrders(), listDeliveries(),
    ]).then(([customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, accts, ours, orders, deliveries]) => {
      if (cancelled) return;
      const masters: ArMasters = { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, accounts: accts, company: ours, orders, deliveries };
      setM(masters);
      // From a delivery's or order's "Copy to A/R invoice": every open line at its open quantity.
      if (!isNew) return;
      const dn = from?.fromDelivery && deliveries.find((d) => d.id === from.fromDelivery);
      const so = from?.fromOrder && orders.find((o) => o.id === from.fromOrder);
      if (dn) setDraft((d) => d && copyLines(d, { kind: 'DN', doc: dn }, dn.lines.filter((l) => l.quantity > l.invoicedQty).map((l) => ({ lineId: l.id, qty: l.quantity - l.invoicedQty })), masters));
      else if (so) setDraft((d) => d && copyLines(d, { kind: 'SO', doc: so }, so.lines.filter((l) => openQty(l) > 0).map((l) => ({ lineId: l.id, qty: openQty(l) })), masters));
    });
    if (!isNew && id) {
      getArInvoice(id).then((a) => !cancelled && setDraft(a ?? null));
      listArInvoices().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((x) => x.id)));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading invoice…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="receipt" title="A/R invoice not found" />
        <Panel.Body>
          <Button onClick={() => navigate(AR_LIST_PATH)}>Back to invoices</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const ctx = buildArContext(draft, m);
  const { customer } = ctx;
  const ro = ctx.readOnly;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = arTotals(draft, ctx.rateOf, docCurrency?.rounding);
  const withholding = arWithholding(draft, customer, m.items, ctx.rateOf);
  const wtax = Math.round(withholding.reduce((n, w) => n + w.amount, 0) * 100) / 100;
  const balance = balanceDue(totals.total, wtax, draft.appliedAmount);
  const journal = ctx.fx ? arJournal(draft, ctx.fx, { items: m.items, groups: m.inv.groups, codes: m.tax.codes, rateOf: ctx.rateOf, withholding, roundingRule: docCurrency?.rounding }, ctx.added) : [];
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;

  const update = (patch: Partial<ArDraft>) => setDraft({ ...draft, ...patch });
  const h = bind(draft, update);

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
          project: s.project,
          paymentTerms: s.paymentTerms,
          paymentMethod: s.paymentMethod,
          indicator: s.indicator,
          federalTaxId: s.federalTaxId,
          salesEmployee: s.salesEmployee,
          discountPct: s.discountPct,
          freightTaxCode: s.freightTaxCode,
          rounding: s.rounding,
          dueMonths: s.dueMonths,
          dueDays: s.dueDays,
          cashDiscountDays: s.cashDiscountDays,
          dueDate: soDueDate(d.postingDate, termDays(s.paymentTerms), s.dueMonths, s.dueDays),
          controlAccount: c ? controlAccountOf(c) : '1120',
          journalRemark: `A/R Invoices – ${s.customerCode}`,
          docType: src.kind === 'SO' ? src.doc.docType : 'Item',
          ...(src.kind === 'DN' ? { trackingNo: src.doc.trackingNo } : {}),
        }
      : {};
    const orderNo = src.kind === 'SO' ? String(src.doc.docNum) : src.doc.orderNumber;
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
      paymentTerms: c.customerPaymentTerms,
      paymentMethod: c.defaultPaymentMethod || draft.paymentMethod,
      dueDate: soDueDate(draft.postingDate, termDays(c.customerPaymentTerms)),
      project: c.project || '— None —',
      shippingType: c.shippingType,
      federalTaxId: c.tin,
      salesEmployee: c.salesEmployee || NO_SALES_EMPLOYEE,
      discountPct: c.totalDiscount || 0,
      controlAccount: controlAccountOf(c),
      billTo: bill ? formatAddress(bill, c.name) : '',
      shipTo: ship ? formatAddress(ship, c.name) : '',
      journalRemark: `A/R Invoices – ${c.code}`,
      lines: draft.lines.map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return { ...l, wtaxLiable: liable, ...(item && !l.baseId ? { taxCode: proposedTaxCode(item, c, m, draft.postingDate) } : {}) };
      }),
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (ro) {
      setSaving(true);
      const a = await saveArNotes(draft.id!, { remarks: draft.remarks, attachments: draft.attachments });
      setSaving(false);
      return navigate(AR_LIST_PATH, { state: { notice: `Remarks saved on invoice ${arNumber(a)}.` } });
    }
    const doc: ArDraft = { ...draft, lines: draft.lines.filter((l) => (draft.docType === 'Service' ? l.description.trim() || l.unitPrice : l.itemId)) };
    const found = validate(doc, ctx, m, asDraft);
    setProblems(found);
    if (found.length) {
      const first = found.find((p) => p.tab !== 'header');
      if (first) setTab(first.tab as TabId);
      return;
    }
    setSaving(true);
    try {
      const a = asDraft ? await saveArDraft(doc) : await addArInvoice(doc, ctx.fx, { codes: m.tax.codes, withholding: arWithholding(doc, customer, m.items, ctx.rateOf), roundingRule: docCurrency?.rounding });
      navigate(AR_LIST_PATH, { state: { notice: asDraft ? `Draft saved — ${a.customerName}.` : `A/R invoice ${arNumber(a)} added — ${a.customerName} owes ${a.currency} ${formatAmount(balance)}.` } });
    } catch (err) {
      if (!(err instanceof ArPostError)) throw err;
      setTab('contents');
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
  const bases = [...new Map(draft.lines.filter((l) => l.baseId).map((l) => [l.baseId, l])).values()];
  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Open' && balance > 0 && !draft.paymentBlock
      ? [{ label: 'Receive payment', icon: 'savings', onSelect: () => navigate('/sales/payments-received/new', { state: { fromInvoice: draft.id } }) }]
      : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: () => act(() => closeArInvoice(saved), 'closed') }] : []),
    ...(draft.status === 'Open' && !draft.appliedAmount ? [{ label: 'Cancel A/R invoice', icon: 'cancel', onSelect: () => act(() => cancelArInvoice(saved), 'cancelled — the entry is reversed and its deliveries and orders are open again') }] : []),
    ...bases.map((l) => ({ label: `Open ${l.baseType === 'DN' ? 'delivery' : 'sales order'} ${l.baseDocNo}`, icon: l.baseType === 'DN' ? 'local_shipping' : 'shopping_bag', onSelect: () => navigate(`${l.baseType === 'DN' ? DN_LIST_PATH : SO_LIST_PATH}/${l.baseId}`) })),
    ...(customer ? [{ label: `Open customer ${customer.code}`, icon: 'person', onSelect: () => navigate(`/sales/customers/${customer.id}`) }] : []),
  ];

  const title = isNew ? 'New A/R invoice' : draft.status === 'Draft' ? 'Draft A/R invoice' : `A/R invoice ${arNumber(draft)}`;

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="receipt"
          title={title}
          subcopy={draft.customerName ? `${draft.customerCode} · ${draft.customerName}${draft.orderNumber ? ` · order ${draft.orderNumber}` : ''}` : 'Bill a customer.'}
          leading={
            isNew ? undefined : (
              <>
                <IconButton type="button" label="Next" intent="default" variant="solid" size="extra-large" disabled={!nextId} onClick={() => navigate(`${AR_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton type="button" label="Previous" intent="default" variant="solid" size="extra-large" disabled={!prevId} onClick={() => navigate(`${AR_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
              </>
            )
          }
          tabs={<Tabs variant="outline" value={tab} onValueChange={(v) => setTab(v as TabId)} items={(Object.keys(TAB_LABEL) as TabId[]).map((t) => ({ value: t, label: TAB_LABEL[t], badge: problems.some((p) => p.tab === t) ? '!' : t === 'attachments' && draft.attachments.length ? String(draft.attachments.length) : undefined }))} />}
          status={isNew ? undefined : <Badge intent={AR_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(AR_LIST_PATH)}>
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
            <Alert intent="default" variant="outline" title={`This invoice is ${draft.status.toLowerCase()}`}>
              {draft.status === 'Cancelled'
                ? 'Its journal entry was reversed, stock it shipped came back, and its deliveries and orders reopened.'
                : 'It’s posted to the ledger. Only remarks and attachments can change; to undo it, cancel the invoice.'}
            </Alert>
          ) : null}

          <fieldset disabled={ro} className="contents">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Section icon="person" title="Customer">
                <Fields>
                  <div className="md:col-span-2">
                    {ctx.based || ro ? (
                      <ReadOnly label="Customer" value={draft.customerName || '—'} description={`${draft.customerCode} · ${draft.currency}`} hint={ctx.based && !ro ? 'Set by the document the lines come from.' : undefined} />
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
                        <Select aria-label="Series" className="w-32" disabled={ctx.added} options={AR_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                        <TextField {...p} className="flex-1" readOnly placeholder="Next number" value={draft.docNum ? String(draft.docNum) : ''} />
                      </div>
                    )}
                  </FormField>
                  <ReadOnly label="Status" value={<Badge intent={AR_STATUS_INTENT[draft.status]}>{isNew ? 'New' : draft.status}</Badge>} error={errors.status} />
                  {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When revenue, VAT and any stock it ships are posted.' })}
                  {h.date('dueDate', 'Due date', { required: true, error: errors.dueDate, hint: `From the payment terms (${draft.paymentTerms}).` })}
                  {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
                  <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
                </Fields>
              </Section>
            </div>

            {tab === 'contents' ? <ArContents draft={draft} update={update} errors={errors} m={m} ctx={ctx} onCopy={(src, picks) => setDraft(copyLines(draft, src, picks, m))} /> : null}
            {tab === 'logistics' ? <ArLogistics draft={draft} update={update} errors={errors} m={m} ctx={ctx} /> : null}
            {tab === 'accounting' ? <ArAccounting draft={draft} update={update} errors={errors} m={m} ctx={ctx} balance={balance} /> : null}
          </fieldset>
          {tab === 'attachments' ? <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="The signed invoice, the customer's PO, Form 2307 when it arrives." withDescription /> : null}

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <Section icon="functions" title="Totals">
              <fieldset disabled={ro} className="contents">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {h.master('salesEmployee', 'Sales employee', salesEmployeeDef, { extra: [NO_SALES_EMPLOYEE, CURRENT_USER] })}
                  {h.master('owner', 'Owner', salesEmployeeDef, { extra: [CURRENT_USER] })}
                </div>
                <List.Group divider>
                  <TotalRow label="Total before discount" value={totals.beforeDiscount} code={draft.currency} />
                  <TotalRow label="Discount" value={totals.discount ? -totals.discount : 0} code={draft.currency} input={<TextField aria-label="Document discount %" type="number" min={0} className="w-24" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />} />
                  <TotalRow label="Total down payment" value={0} code={draft.currency} note="Down payments aren't built yet." />
                  {SALES_SETTINGS.manageFreightInDocuments ? (
                    <TotalRow label="Freight" value={totals.freight} code={draft.currency} input={<TextField aria-label="Freight" type="number" min={0} className="w-32" prefix={draft.currency} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />} />
                  ) : null}
                  <TotalRow label="Rounding" value={totals.rounding} code={draft.currency} input={<Checkbox aria-label="Apply rounding" checked={draft.rounding} onChange={(e) => update({ rounding: e.currentTarget.checked })}>{docCurrency?.rounding ?? 'No rounding'}</Checkbox>} />
                  <TotalRow label="Tax" value={totals.tax} code={draft.currency} />
                  <TotalRow label="Total" value={totals.total} code={draft.currency} strong />
                  {withholding.map((w) => (
                    <TotalRow key={w.label} label={`WTax — ${w.label}`} value={-w.amount} code={draft.currency} note={`On ${draft.currency} ${formatAmount(w.base)}.`} />
                  ))}
                  <TotalRow label="Applied amount" value={-draft.appliedAmount} code={draft.currency} />
                  <TotalRow label="Balance due" value={balance} code={draft.currency} strong />
                </List.Group>
              </fieldset>
              {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the invoice is added.' })}
            </Section>
            <Section icon="account_balance" title="Journal entry">
              {journal.length ? (
                <List.Group divider>
                  {journal.map((j) => (
                    <List.Item key={j.account} title={accountText(j.account, m.accounts)} content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>} />
                  ))}
                </List.Group>
              ) : (
                <Text variant="small" tone="muted">Adding posts Dr A/R / Cr Revenue and Output VAT, plus the cost of any stock the invoice ships.</Text>
              )}
              <Text variant="small" tone="muted">In PHP{draft.currency !== 'PHP' && ctx.fx ? ` at ${ctx.fx}` : ''}. {ctx.added ? 'As posted.' : 'Stock it ships is costed at today’s item cost.'}</Text>
            </Section>
          </div>
        </Panel.Body>
      </Panel>
    </Form>
  );
}

function TotalRow({ label, value, code, input, strong, note }: { label: string; value: number; code: string; input?: ReactNode; strong?: boolean; note?: string }) {
  const emphasis = (node: ReactNode) => (strong ? <Text as="span" weight="semibold" tone="heading">{node}</Text> : node);
  return (
    <List.Item
      title={
        <span className="flex flex-col">
          <span className="flex items-center gap-2"><span className="whitespace-nowrap">{emphasis(label)}</span>{input ? <span className="flex-none">{input}</span> : null}</span>
          {note ? <Text variant="small" tone="muted">{note}</Text> : null}
        </span>
      }
      content={<span className="whitespace-nowrap tabular-nums">{emphasis(`${code} ${formatAmount(value)}`)}</span>}
    />
  );
}
