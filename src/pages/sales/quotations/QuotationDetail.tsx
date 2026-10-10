import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Combobox,
  Form,
  FormField,
  Icon,
  IconButton,
  Link,
  List,
  Panel,
  PanelHeader,
  panelHeaderIcons,
  Select,
  Tabs,
  Text,
  TextField,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { DataTable } from '../../../components/form/DataTable';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { StatusField } from '../../../components/form/StatusField';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../mocks/address';
import { CURRENT_USER_ID } from '../../../mocks/common';
import { contactName, type Partner } from '../../../mocks/partners';
import { QUOTATION_STATUSES, QT_SERIES, blankQuotation, newQuoteLine, type Quotation, type QuoteLine } from '../../../mocks/quotations';
import { rateAt } from '../../../mocks/taxes';
import type { Company } from '../../../mocks/companies';
import type { Currency, ExchangeRate } from '../../../mocks/currencies';
import type { Item } from '../../../mocks/items';
import type { InventoryMasters } from '../../../services/inventoryMasters';
import type { TaxMasterData } from '../../../services/taxDetermination';
import { loadCurrentCompany } from '../../../services/companies';
import { formatDate, todayISO } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { loadInventoryMasters, activeOptions } from '../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../services/items';
import { itemsPerUom } from '../../../mocks/items';
import { companyTax, currencies, exchangeRates, taxCodes, rateOn } from '../../../services/masterData';
import { listPartnersByRole } from '../../../services/partners';
import {
  addQuotation,
  cancelQuotation,
  closeQuotation,
  getQuotation,
  listQuotations,
  qtNumber,
  qtTotals,
  saveQuotationDraft,
  saveQuotationRemarks,
} from '../../../services/quotations';
import { salesEmployeeDef, projectDef, paymentTermDef } from '../../settings/masterDefs';
import { useDocTitle } from '../../../services/useDocTitle';
import { BASE_PRICE_LIST_ID, determinePrice, isGrossList } from '../../../services/priceLists';
import { determineTax, type TaxMasterData as TaxMD } from '../../../services/taxDetermination';
import { SYSTEM_TAX_CODES } from '../../../mocks/taxes';
import { QT_LIST_PATH, QT_STATUS_INTENT } from './QuotationList';
import { blankSalesOrder, newSoLine } from '../../../mocks/salesOrders';
import { SO_LIST_PATH } from '../orders/detail/types';
import { SalesDocumentFlow } from '../shared/SalesDocumentFlow';

type Draft = Omit<Quotation, 'id'> & { id?: string };
type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

const ALL_CURRENCIES = 'All currencies';
const round2 = (n: number) => Math.round(n * 100) / 100;

interface QtMasters {
  customers: Partner[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
  currencies: Currency[];
  rates: ExchangeRate[];
  company: Company;
}

async function loadQtMasters(): Promise<QtMasters> {
  const [customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours] = await Promise.all([
    listPartnersByRole('customer'),
    listItems(),
    loadInventoryMasters(),
    companyTax.list(),
    taxCodes.list(),
    (await import('../../../services/masterData')).taxGroups.list(),
    (await import('../../../services/masterData')).withholdingTaxes.list(),
    (await import('../../../services/masterData')).withholdingGroups.list(),
    currencies.list(),
    exchangeRates.list(),
    loadCurrentCompany(),
  ]);
  return { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours };
}

function proposedTaxCode(item: Item, customer: Partner | undefined, m: QtMasters, date: string) {
  if (!customer) return '';
  const result = determineTax('Sales', item, customer, m.tax as TaxMD, date);
  return result.taxCode?.code ?? '';
}

function linePricing(item: Item, l: Pick<QuoteLine, 'priceListId' | 'uomCode' | 'quantity' | 'taxCode'>, draft: Draft, customers: Partner[], vatRegistered: boolean, rateOf: (c: string) => number, fx: number) {
  const customer = customers.find((c) => c.id === draft.customerId);
  const p = determinePrice({ item, partner: customer, priceListId: l.priceListId, uom: l.uomCode, quantity: l.quantity, date: draft.postingDate });
  const vat = vatRegistered ? rateOf(SYSTEM_TAX_CODES.VATABLE) : 0;
  const net = isGrossList(p.basisListId) ? p.price / (1 + vat / 100) : p.price;
  return {
    unitPrice: fx ? round2(net / fx) : 0,
    discountPct: p.discountPct,
    priceSource: p.source.label,
  };
}

function customerDefaults(c: Partner, d: Draft): Partial<Draft> {
  const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
  const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? bill;
  return {
    customerId: c.id,
    customerCode: c.code,
    customerName: c.name,
    contactId: c.defaultContactId,
    currency: c.currency === ALL_CURRENCIES ? 'PHP' : c.currency,
    paymentTermId: c.customerPaymentTermId,
    paymentMethod: c.defaultPaymentMethod || d.paymentMethod,
    projectId: c.projectId,
    shippingType: c.shippingType,
    federalTaxId: c.tin,
    salesEmployeeId: c.salesEmployeeId,
    journalRemark: `Sales Quotations – ${c.code}`,
    billTo: bill ? formatAddress(bill, c.name) : '',
    shipTo: ship ? formatAddress(ship, c.name) : '',
  };
}

function customerAddressOptions(c: Partner | undefined) {
  return (c?.addresses ?? []).map((a) => ({ value: formatAddress(a, c!.name), label: `${a.label || 'Address'} · ${a.city || a.countryCode}` }));
}

function validate(d: Draft, fx: number, _m: QtMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'contents', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'accounting', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'accounting', 'documentDate', 'Document date is required.');
  need(fx > 0, 'accounting', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    need(l.itemId, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
  }
  return problems;
}

export function QuotationDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <QuotationForm key={id === 'new' ? location.key : id} />;
}

function QuotationForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? blankQuotation(CURRENT_USER_ID) : undefined);
  const [m, setM] = useState<QtMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadQtMasters().then(setM);
    if (isNew || !id) return;
    let cancelled = false;
    getQuotation(id).then((q) => !cancelled && setDraft(q ?? null));
    listQuotations().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((q) => q.docNum ? qtNumber(q) : q.id)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New quotation' : qtNumber(draft)) : undefined);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading quotation…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="request_quote" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="Quotation not found" />
        <Panel.Body><Button onClick={() => navigate(QT_LIST_PATH)}>Back to quotations</Button></Panel.Body>
      </Panel>
    );
  }

  const added = draft.status !== 'Draft';
  const readOnly = draft.status === 'Closed' || draft.status === 'Cancelled';
  const date = draft.postingDate || todayISO();
  const fxRate = draft.currency === 'PHP' ? undefined : rateOn(m.rates, draft.currency, date);
  const fx = draft.currency === 'PHP' ? 1 : added ? 1 : (fxRate?.rate ?? 0);
  const code = draft.currency;
  const vatRegistered = m.tax.company.vatRegistered;
  const rateOf = (taxCode: string) => {
    const c = m.tax.codes.find((x) => x.code === taxCode);
    return c ? (rateAt(c, date) ?? 0) : 0;
  };
  const customer = m.customers.find((c) => c.id === draft.customerId);
  const at = (draft as Quotation).id ? siblings.indexOf(draft.docNum ? qtNumber(draft as Quotation) : (draft as Quotation).id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totals = qtTotals(draft, rateOf);
  const net = (l: QuoteLine) => round2(l.quantity * l.unitPrice * (1 - l.discountPct / 100));
  const isExpired = draft.status === 'Open' && !!draft.validUntil && draft.validUntil < todayISO();

  const update = (patch: Partial<Draft>) => setDraft((d) => d && { ...d, ...patch });
  const h = bind(draft, update);

  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    update(c ? customerDefaults(c, draft) : { customerId: '', customerCode: '', customerName: '', contactId: '', shipTo: '', billTo: '' });
  };

  const patch = (lineId: string, p: Partial<QuoteLine>) => update({ lines: draft.lines.map((l) => (l.id === lineId ? { ...l, ...p } : l)) });

  const pickItem = (l: QuoteLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) { patch(l.id, { itemId: '' }); return; }
    const uom = m.inv.uoms.find((u) => u.code === item.salesUom);
    const priceListId = customer?.priceListId || BASE_PRICE_LIST_ID;
    const taxCode = proposedTaxCode(item, customer, m, date);
    const base: Partial<QuoteLine> = {
      itemId: item.id,
      itemNo: item.itemNo,
      description: item.name,
      uomCode: item.salesUom,
      uomName: uom?.name ?? item.salesUom,
      itemsPerUnit: itemsPerUom(item, item.salesUom) ?? 1,
      warehouse: item.inventoryItem ? (item.warehouses[0]?.code ?? 'WH-MNL') : '',
      priceListId,
      taxCode,
    };
    const pricing = linePricing(item, { ...l, ...base }, draft, m.customers, vatRegistered, rateOf, fx);
    patch(l.id, { ...base, ...pricing });
  };

  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${rateOf(c.code)}%)` }));
  const warehouseOpts = (cur: string) => activeOptions(m.inv.warehouses, (w) => w.code, (w) => `${w.code} — ${w.name}`, cur);
  const addressOpts = customerAddressOptions(customer);
  const withCurrent = (opts: { value: string; label: string }[], v: string) =>
    !v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v.split('\n')[0] }, ...opts];

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await saveQuotationRemarks(draft as Quotation, { remarks: draft.remarks, attachments: draft.attachments });
        navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(saved)} saved.` } });
      } finally { setSaving(false); }
      return;
    }
    const found = validate(draft, fx, m, asDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      if (asDraft) {
        const saved = await saveQuotationDraft(draft);
        navigate(QT_LIST_PATH, { state: { notice: `Draft saved — ${saved.customerName}.` } });
        return;
      }
      const saved = await addQuotation(draft);
      navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(saved)} added.` } });
    } finally { setSaving(false); }
  };

  const saved = draft as Quotation;

  const statusMoves: Partial<Record<string, () => void>> =
    draft.status === 'Draft' ? { Open: () => submit(null) } :
    draft.status === 'Open' ? {
      Closed: async () => { const r = await closeQuotation(saved); navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(r)} closed.` } }); },
      Cancelled: async () => { const r = await cancelQuotation(saved); navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(r)} cancelled.` } }); },
    } : {};

  const convertToOrder = () => {
    const copyFrom = {
      ...blankSalesOrder(CURRENT_USER_ID),
      customerId: draft.customerId,
      customerCode: draft.customerCode,
      customerName: draft.customerName,
      contactId: draft.contactId,
      customerRef: draft.customerRef,
      currency: draft.currency,
      paymentTermId: draft.paymentTermId,
      paymentMethod: draft.paymentMethod,
      projectId: draft.projectId,
      shippingType: draft.shippingType,
      federalTaxId: draft.federalTaxId,
      salesEmployeeId: draft.salesEmployeeId,
      shipTo: draft.shipTo,
      billTo: draft.billTo,
      discountPct: draft.discountPct,
      freight: draft.freight,
      freightTaxCode: draft.freightTaxCode,
      remarks: `Based on quotation ${qtNumber(saved)}${draft.remarks ? `\n${draft.remarks}` : ''}`,
      lines: draft.lines.map((l) => newSoLine({
        itemId: l.itemId,
        itemNo: l.itemNo,
        description: l.description,
        quantity: l.quantity,
        uomCode: l.uomCode,
        uomName: l.uomName,
        itemsPerUnit: l.itemsPerUnit,
        warehouse: l.warehouse,
        priceListId: l.priceListId,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        priceSource: l.priceSource,
        taxCode: l.taxCode,
        glAccount: l.glAccount,
      })),
    };
    navigate(`${SO_LIST_PATH}/new`, { state: { copyFrom } });
  };

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Copy to sales order', icon: 'shopping_bag', onSelect: convertToOrder }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close quotation', icon: 'task_alt', onSelect: () => closeQuotation(saved).then((r) => navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(r)} closed.` } })) }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Cancel quotation', icon: 'cancel', onSelect: () => cancelQuotation(saved).then((r) => navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(r)} cancelled.` } })) }] : []),
    ...(customer ? [{ label: `Open customer ${customer.code}`, icon: 'storefront', onSelect: () => navigate(`/sales/customers/${customer.id}`) }] : []),
  ];

  const title = isNew ? 'New quotation' : added ? qtNumber(draft) : 'Draft quotation';

  const lineColumns: TableColumn<QuoteLine>[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        if (item) {
          return (
            <div className="flex w-52 shrink-0 flex-col whitespace-normal">
              <Text variant="caption">{item.itemNo}</Text>
              <Text variant="small">{l.description}</Text>
              {!readOnly ? <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', description: '' })}>Change</Link> : null}
            </div>
          );
        }
        const opts = m.items
          .filter((i) => i.id === l.itemId || (i.salesItem && isValidToday(i, date)))
          .map((i) => ({ value: i.id, label: i.itemNo, subLabel: i.description, text: `${i.itemNo} ${i.name} ${i.description}` }));
        return (
          <FormField label="" error={errors[`line:${l.id}:item`]}>
            {(fp) => (
              <Combobox {...fp} aria-label="Item" className="w-52" placeholder="Search items" options={opts} value={l.itemId || null} disabled={readOnly} onValueChange={(v) => pickItem(l, v)} />
            )}
          </FormField>
        );
      },
    },
    {
      key: 'qty',
      header: 'Qty / UoM',
      cell: (l) => !l.itemId ? null : (
        <div className="flex w-32 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(errors[`line:${l.id}:quantity`])} value={String(l.quantity)} disabled={readOnly} onChange={(e) => patch(l.id, { quantity: Number(e.currentTarget.value) || 0 })} />
          <Text variant="small" tone="muted">{l.uomCode}</Text>
        </div>
      ),
    },
    {
      key: 'pricing',
      header: 'Price / Disc. / Tax',
      cell: (l) => !l.itemId ? null : (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Unit price" type="number" min={0} prefix={code} invalid={Boolean(errors[`line:${l.id}:unitPrice`])} value={String(l.unitPrice)} disabled={readOnly} onChange={(e) => patch(l.id, { unitPrice: round2(Number(e.currentTarget.value) || 0), priceSource: 'Manual' })} />
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(l.discountPct)} disabled={readOnly} onChange={(e) => patch(l.id, { discountPct: Math.min(100, Number(e.currentTarget.value) || 0) })} />
          <Select aria-label="Tax code" invalid={Boolean(errors[`line:${l.id}:taxCode`])} options={[{ value: '', label: '— None —' }, ...taxOptions]} value={l.taxCode} disabled={readOnly} onValueChange={(taxCode) => patch(l.id, { taxCode })} />
        </div>
      ),
    },
    {
      key: 'total',
      header: `Total (${code})`,
      cell: (l) => l.itemId ? <span className="whitespace-nowrap tabular-nums">{formatAmount(net(l))}</span> : null,
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      cell: (l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        if (!item?.inventoryItem) return l.itemId ? <Text variant="small" tone="muted">—</Text> : null;
        return (
          <Select aria-label="Warehouse" className="w-40" options={[{ value: '', label: '— None —' }, ...warehouseOpts(l.warehouse)]} value={l.warehouse} disabled={readOnly} onValueChange={(warehouse) => patch(l.id, { warehouse })} />
        );
      },
    },
  ];

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="request_quote"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          title={title}
          trailing={
            isNew ? undefined : (
              <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
                <IconButton type="button" label="Previous" size="small" shape="pill" disabled={!prevId} onClick={() => navigate(`${QT_LIST_PATH}/${prevId}`)}>{panelHeaderIcons.arrowUpward}</IconButton>
                <IconButton type="button" label="Next" size="small" shape="pill" disabled={!nextId} onClick={() => navigate(`${QT_LIST_PATH}/${nextId}`)}>{panelHeaderIcons.arrowDownward}</IconButton>
              </ButtonGroup>
            )
          }
          tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
          status={
            isNew ? undefined : (
              <div className="flex gap-1">
                <Badge size="small" intent={QT_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                {isExpired ? <Badge size="small" intent="danger">Expired</Badge> : null}
                {draft.convertedToOrderId ? <Badge size="small" variant="outline">Converted</Badge> : null}
              </div>
            )
          }
          actions={
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(QT_LIST_PATH)}>
                {readOnly ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : added ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />

        {page !== 'details' ? (
          <Panel.Body>
            {page === 'transactions' ? (
              added ? (
                <SalesDocumentFlow kind="QT" id={saved.id} notes="Sales orders and downstream documents created from this quotation." />
              ) : (
                <Text variant="small" tone="muted" className="p-4">Transactions will show here once the quotation is added.</Text>
              )
            ) : (
              <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
            )}
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />

            {added ? (
              <Alert intent="default" variant="outline" title={
                draft.status === 'Open'
                  ? (isExpired ? 'This quotation has expired' : 'Quotation is open')
                  : `This quotation is ${draft.status.toLowerCase()}`
              }>
                {draft.status === 'Open'
                  ? (isExpired
                    ? 'The valid until date has passed. Copy to a sales order or close it.'
                    : 'Copy to a sales order when the customer confirms. Only remarks and attachments can change.')
                  : 'Only remarks and attachments can change.'}
              </Alert>
            ) : null}

            <fieldset disabled={readOnly} className="contents">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {/* Customer */}
                <Section icon="storefront" title="Customer">
                  <Fields>
                    <div className="md:col-span-2">
                      {customer && added ? (
                        <ReadOnly label="Customer" value={draft.customerName} description={`${draft.customerCode} · ${code}`} />
                      ) : (
                        <FormField label="Customer" required error={errors.customerId}>
                          {(p) => (
                            <Combobox
                              {...p}
                              placeholder="Search customers"
                              options={m.customers.filter((c) => c.status !== 'Inactive' || c.id === draft.customerId).map((c) => ({ value: c.id, label: c.name, subLabel: c.code, subLabelPlacement: 'top' as const, description: c.currency, text: `${c.code} ${c.name}` }))}
                              value={draft.customerId || null}
                              onValueChange={pickCustomer}
                            />
                          )}
                        </FormField>
                      )}
                    </div>
                    {h.lookup('contactId', 'Contact person', [{ value: '', label: '— None —' }, ...(customer?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))], { disabled: !customer })}
                    {h.text('customerRef', 'Customer ref. no.')}
                    <FormField label="Currency" className="md:col-span-2">
                      {(p) => (
                        <Select {...p} disabled={added} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={code} onValueChange={(currency) => update({ currency })} />
                      )}
                    </FormField>
                  </Fields>
                </Section>

                {/* Document */}
                <Section icon="tag" title="Document">
                  <Fields>
                    <FormField label="No.">
                      {() => (
                        <div className="flex gap-1">
                          <Select aria-label="Series" className="w-40" disabled={added} options={QT_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                          <span className="flex-1 self-center text-sm">
                            {draft.docNum ? qtNumber(draft) : <span className="text-(--color-text-placeholder)">Next number</span>}
                          </span>
                        </div>
                      )}
                    </FormField>
                    <StatusField statuses={QUOTATION_STATUSES} intents={QT_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Open once added; Close or Cancel to end it." error={errors.status} />
                    {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
                    {h.date('validUntil', 'Valid until', { hint: 'After this date the quotation is expired.' })}
                    {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
                    <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
                  </Fields>
                </Section>
              </div>

              {/* Contents */}
              <DataTable
                variant="card"
                icon="receipt_long"
                title="Contents"
                description="Items and prices being quoted. No stock is committed until copied to a sales order."
                rows={draft.lines}
                getRowId={(l) => l.id}
                columns={lineColumns}
                unsortable={lineColumns.map((c) => c.key)}
                noPagination
                empty={<Text variant="small" tone="muted">{draft.customerId ? 'Add items to quote.' : 'Pick a customer first.'}</Text>}
                onRemove={!readOnly ? (removed) => update({ lines: draft.lines.filter((l) => !removed.includes(l)) }) : undefined}
                actions={
                  !readOnly && draft.customerId ? (
                    <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ lines: [...draft.lines, newQuoteLine()] })}>
                      Add line
                    </Button>
                  ) : undefined
                }
              />

              {/* Logistics + Accounting */}
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <Section icon="local_shipping" title="Logistics">
                  <Fields>
                    {h.lookup('shipTo', 'Ship to', withCurrent(addressOpts, draft.shipTo), { disabled: !customer })}
                    {h.lookup('billTo', 'Bill to', withCurrent(addressOpts, draft.billTo), { disabled: !customer })}
                    {h.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
                  </Fields>
                </Section>
                <Section icon="account_balance" title="Accounting">
                  <Fields>
                    {h.text('journalRemark', 'Journal remark')}
                    {h.master('paymentTermId', 'Payment terms', paymentTermDef)}
                    {h.master('projectId', 'BP project', projectDef, { clearable: true })}
                    {h.text('indicator', 'Indicator')}
                    <ReadOnly label="Federal tax ID" value={customer?.tin || '—'} hint="The customer's TIN." />
                  </Fields>
                </Section>
              </div>
            </fieldset>

            {/* Totals + Remarks */}
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Section icon="functions" title="Totals">
                <Fields cols={1}>
                  <fieldset disabled={readOnly} className="contents">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true })}
                      {h.master('ownerId', 'Owner', salesEmployeeDef)}
                    </div>
                    <List.Group divider>
                      <TotalRow label="Total before discount" value={totals.beforeDiscount} code={code} />
                      <TotalRow
                        label="Discount"
                        value={totals.discount ? -totals.discount : 0}
                        code={code}
                        input={<TextField aria-label="Document discount %" type="number" min={0} className="w-24" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />}
                      />
                      <TotalRow label="Tax" value={totals.tax} code={code} />
                      <TotalRow label="Total" value={totals.total} code={code} strong />
                    </List.Group>
                  </fieldset>
                  {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the quotation is added.' })}
                </Fields>
              </Section>
            </div>

            <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the RFQ, specs sheet, or supporting documents." />
          </Panel.Body>
        )}
      </Panel>
    </Form>
  );
}

function TotalRow({ label, value, code, input, strong }: { label: string; value: number; code: string; input?: import('react').ReactNode; strong?: boolean }) {
  const emphasis = (node: import('react').ReactNode) => strong ? <Text as="span" weight="semibold" tone="heading">{node}</Text> : node;
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
