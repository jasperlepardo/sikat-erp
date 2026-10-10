import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
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
import { MasterLookup } from '../../../components/form/MasterLookup';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { StatusField } from '../../../components/form/StatusField';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../mocks/address';
import { accountText } from '../../../mocks/chartOfAccounts';
import { CURRENT_USER_ID } from '../../../mocks/common';
import { RETURN_REASONS } from '../../../mocks/goodsReturns';
import { contactName, type Partner } from '../../../mocks/partners';
import { INDICATORS } from '../../../mocks/purchaseOrders';
import { blankSalesReturn, newSrLine, SR_SERIES, SR_STATUSES, type SalesReturn, type SrLine, type SrStatus } from '../../../mocks/salesReturns';
import { rateAt } from '../../../mocks/taxes';
import type { Account } from '../../../mocks/chartOfAccounts';
import type { Company } from '../../../mocks/companies';
import type { Currency, ExchangeRate } from '../../../mocks/currencies';
import type { Item } from '../../../mocks/items';
import type { InventoryMasters } from '../../../services/inventoryMasters';
import type { TaxMasterData } from '../../../services/taxDetermination';
import { loadCurrentCompany } from '../../../services/companies';
import { formatDate, todayISO } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { dnNumber, dnOpenQty, listDeliveries } from '../../../services/deliveries';
import { loadInventoryMasters, activeOptions } from '../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../services/items';
import { postDocumentEntry, reverseDocumentEntry } from '../../../services/journalEntries';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes, rateOn } from '../../../services/masterData';
import { listPartnersByRole } from '../../../services/partners';
import { dueDateFor } from '../../../services/purchaseOrders';
import {
  SrPostError,
  addSalesReturn,
  cancelSalesReturn,
  getSalesReturn,
  listSalesReturns,
  saveReturnDraft,
  saveReturnRemarks,
  srJournal,
  srNumber,
  srOpenQty,
  srTotals,
} from '../../../services/salesReturns';
import { salesEmployeeDef, projectDef, paymentTermDef, countryDef } from '../../settings/masterDefs';
import { SalesDocumentFlow } from '../shared/SalesDocumentFlow';
import { useDocTitle } from '../../../services/useDocTitle';
import { AR_CM_LIST_PATH, SR_LIST_PATH, SR_STATUS_INTENT } from './types';
import { EditPanel } from '../../partners/detail/EditPanel';
import type { Delivery } from '../../../mocks/deliveries';

type Draft = Omit<SalesReturn, 'id'> & { id?: string };
type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

const ALL_CURRENCIES = 'All currencies';
const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const round2 = (n: number) => Math.round(n * 100) / 100;

const LINE_GROUPS = { details: 'Item details', references: 'References' } as const;
type LineGroup = keyof typeof LINE_GROUPS;

interface SrMasters {
  customers: Partner[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
  currencies: Currency[];
  rates: ExchangeRate[];
  accounts: Account[];
  company: Company;
  deliveries: Delivery[];
  returns: SalesReturn[];
}

async function loadSrMasters(): Promise<SrMasters> {
  const [customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, deliveriesAll, returnsAll] = await Promise.all([
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
    loadCurrentCompany(),
    listDeliveries(),
    listSalesReturns(),
  ]);
  return { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, deliveries: deliveriesAll, returns: returnsAll, accounts: inv.accounts };
}

function customerDefaults(c: Partner | undefined, d: Draft): Partial<Draft> {
  if (!c) return {};
  const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? c.addresses[0];
  const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
  return {
    customerId: c.id,
    customerCode: c.code,
    customerName: c.name,
    contactId: c.defaultContactId,
    currency: c.currency === ALL_CURRENCIES ? 'PHP' : c.currency,
    paymentTermId: c.customerPaymentTermId,
    paymentMethod: c.defaultPaymentMethod || d.paymentMethod,
    dueDate: dueDateFor(d.postingDate, c.customerPaymentTermId),
    projectId: c.projectId,
    shippingType: c.shippingType,
    federalTaxId: c.tin,
    salesEmployeeId: c.salesEmployeeId,
    journalRemark: `Sales Returns – ${c.code}`,
    shipTo: ship ? formatAddress(ship, c.name) : '',
    billTo: bill ? formatAddress(bill, c.name) : '',
  };
}

function customerAddressOptions(c: Partner | undefined) {
  return (c?.addresses ?? []).map((a) => ({ value: formatAddress(a, c!.name), label: `${a.label || 'Address'} · ${a.city || a.countryCode}` }));
}

function validate(d: Draft, fx: number, m: SrMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'contents', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'accounting', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'accounting', 'documentDate', 'Document date is required.');
  need(fx > 0, 'accounting', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a delivery.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    if (item.inventoryItem) {
      need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse the goods return to.`);
    }
  }
  return problems;
}

export function SalesReturnDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <SalesReturnForm key={id === 'new' ? location.key : id} />;
}

function SalesReturnForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const state = useLocation().state as { fromDelivery?: string } | null;

  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? blankSalesReturn(todayISO(), CURRENT_USER_ID) : undefined);
  const [m, setM] = useState<SrMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [shownGroups, setShownGroups] = useState<LineGroup[]>(['references']);
  const [lineSettingsOpen, setLineSettingsOpen] = useState(false);

  useEffect(() => {
    loadSrMasters().then((masters) => {
      setM(masters);
      if (isNew && state?.fromDelivery) {
        const dn = masters.deliveries.find((d) => d.id === state.fromDelivery);
        if (dn) {
          const customer = masters.customers.find((c) => c.id === dn.customerId);
          const lines = dn.lines
            .filter((l) => dnOpenQty(l, dn) > 0)
            .map((l) => {
              const { invoicedQty: _i, ...base } = l;
              return newSrLine({
                ...base,
                id: `srl-${crypto.randomUUID().slice(0, 8)}`,
                quantity: dnOpenQty(l, dn),
                baseType: 'DN' as const,
                baseId: dn.id,
                baseLineId: l.id,
                baseDocNo: dnNumber(dn),
                creditedQty: 0,
                returnReason: '',
              });
            });
          setDraft((d) => d && {
            ...d,
            ...customerDefaults(customer, d),
            currency: dn.currency,
            contactId: dn.contactId || (d.contactId ?? ''),
            paymentTermId: dn.paymentTermId || d.paymentTermId,
            discountPct: dn.discountPct,
            salesEmployeeId: dn.salesEmployeeId || d.salesEmployeeId,
            shipTo: dn.shipTo,
            billTo: dn.billTo,
            lines,
            orderNumber: dn.orderNumber || '',
          });
        }
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getSalesReturn(id).then((r) => !cancelled && setDraft(r ?? null));
    listSalesReturns().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((r) => r.docNum ? srNumber(r) : r.id)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New sales return' : srNumber(draft)) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading sales return…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="assignment_return" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="Sales return not found" />
        <Panel.Body>
          <Button onClick={() => navigate(SR_LIST_PATH)}>Back to sales returns</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const added = draft.status !== 'Draft';
  const date = draft.postingDate || todayISO();
  const fxRate = draft.currency === 'PHP' ? undefined : rateOn(m.rates, draft.currency, date);
  const fx = draft.currency === 'PHP' ? 1 : added ? draft.fxRate : (fxRate?.rate ?? 0);
  const code = draft.currency;
  const rateOf = (taxCode: string) => {
    const c = m.tax.codes.find((x) => x.code === taxCode);
    return c ? (rateAt(c, date) ?? 0) : 0;
  };
  const customer = m.customers.find((c) => c.id === draft.customerId);
  const at = (draft as SalesReturn).id ? siblings.indexOf(draft.docNum ? srNumber(draft as SalesReturn) : (draft as SalesReturn).id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totals = srTotals(draft, rateOf);
  const journal = fx ? srJournal(draft, m.items, m.inv.groups, added) : [];

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTermId))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTermId);
    }
    setDraft(next);
  };
  const h = bind(draft, update);

  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    update(c ? { ...customerDefaults(c, draft), lines: draft.lines.filter((l) => !l.baseType) } : { customerId: '', customerCode: '', customerName: '', contactId: '', shipTo: '', billTo: '' });
  };

  // Open deliveries for this customer with something left to return
  const availableDeliveries = draft.customerId
    ? m.deliveries.filter(
        (dn) =>
          dn.customerId === draft.customerId &&
          dn.status === 'Open' &&
          dn.currency === code &&
          dn.lines.some((l) => dnOpenQty(l, dn) > 0),
      )
    : [];

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await saveReturnRemarks(draft as SalesReturn, { remarks: draft.remarks, attachments: draft.attachments });
        navigate(SR_LIST_PATH, { state: { notice: `Sales return ${srNumber(saved)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const found = validate(draft, fx, m, asDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      if (asDraft) {
        const saved = await saveReturnDraft(draft);
        navigate(SR_LIST_PATH, { state: { notice: `Draft saved — ${saved.customerName}.` } });
        return;
      }
      const saved = await addSalesReturn(draft, fx);
      await postDocumentEntry({
        origin: 'SR',
        originNo: saved.docNum,
        originId: saved.id,
        postingDate: saved.postingDate,
        dueDate: saved.dueDate,
        remarks: saved.journalRemark,
        lines: srJournal(saved, m.items, m.inv.groups, true),
      });
      navigate(SR_LIST_PATH, {
        state: {
          notice: `Sales return ${srNumber(saved)} added — the stock is back in.`,
        },
      });
    } catch (err) {
      if (!(err instanceof SrPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as SalesReturn;
  const bases = [...new Map(draft.lines.filter((l) => l.baseType).map((l) => [l.baseId, l])).values()];
  const creditable = draft.status === 'Open' && draft.lines.some((l) => srOpenQty(l, draft) > 0);

  const cancelIt = async () => {
    try {
      const r = await cancelSalesReturn(saved);
      await reverseDocumentEntry(saved.id);
      navigate(SR_LIST_PATH, { state: { notice: `Sales return ${srNumber(r)} cancelled — the stock is back out.` } });
    } catch (err) {
      setProblems([{ tab: 'contents', key: 'status', message: (err as Error).message }]);
    }
  };

  const statusMoves: Partial<Record<SrStatus, () => void>> =
    draft.status === 'Draft' ? { Open: () => submit(null) } :
    (draft.status === 'Open' || draft.status === 'Closed') ? { Cancelled: cancelIt } : {};

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(creditable ? [{ label: 'Copy to A/R credit memo', icon: 'undo', onSelect: () => navigate(`${AR_CM_LIST_PATH}/new`, { state: { fromReturn: saved.id } }) }] : []),
    ...(draft.status === 'Open' && !draft.lines.some((l) => l.creditedQty > 0)
      ? [{ label: 'Cancel sales return', icon: 'cancel', onSelect: cancelIt }]
      : []),
    ...bases.map((l) => ({
      label: `Open delivery ${l.baseDocNo}`,
      icon: 'local_shipping',
      onSelect: () => navigate(`/sales/deliveries/${l.baseId}`),
    })),
    ...(customer ? [{ label: `Open customer ${customer.code}`, icon: 'person', onSelect: () => navigate(`/sales/customers/${customer.id}`) }] : []),
  ];

  const title = isNew ? 'New sales return' : added ? srNumber(draft) : 'Draft sales return';
  const addressOptions = customerAddressOptions(customer);
  const withCurrent = (opts: { value: string; label: string }[], v: string) =>
    !v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v.split('\n')[0] }, ...opts];

  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${rateOf(c.code)}%)` }));
  const warehouseOptions = (current: string) => m.inv.warehouses.filter((w) => w.active || w.code === current).map((w) => ({ value: w.code, label: `${w.code} — ${w.name}` }));

  const patch = (lineId: string, p: Partial<SrLine>) => update({ lines: draft.lines.map((l) => (l.id === lineId ? { ...l, ...p } : l)) });
  const net = (l: SrLine) => round2(l.quantity * (l.itemsPerUnit || 1) * l.unitPrice * (1 - l.discountPct / 100));
  const itemOf = (l: SrLine) => m.items.find((i) => i.id === l.itemId);

  const isGroup = (g: LineGroup) => shownGroups.includes(g);

  type SrCol = TableColumn<SrLine> & { group?: LineGroup };
  const col = (key: string, header: string, cell: (l: SrLine) => import('react').ReactNode, group?: LineGroup): SrCol => ({ key, header, cell, group });

  const lineColumns: SrCol[] = [
    col('item', 'Item', (l) => {
      const item = itemOf(l);
      if (item) {
        return (
          <div className="flex w-52 shrink-0 flex-col whitespace-normal">
            <Text variant="caption">{item.itemNo}</Text>
            <Text variant="small">{l.description}</Text>
            {!added && !l.baseType ? <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', description: '' })}>Change</Link> : null}
          </div>
        );
      }
      const itemOptions = m.items
        .filter((i) => i.id === l.itemId || (i.salesItem && isValidToday(i, date)))
        .map((i) => ({ value: i.id, label: i.itemNo, subLabel: i.description, text: `${i.itemNo} ${i.description}` }));
      return (
        <FormField label="" error={errors[`line:${l.id}:item`]}>
          {(fp) => (
            <Combobox
              {...fp}
              aria-label="Item"
              className="w-52"
              placeholder="Search items"
              options={itemOptions}
              value={l.itemId || null}
              disabled={added}
              onValueChange={(itemId) => {
                const item = m.items.find((i) => i.id === itemId);
                if (!item) { patch(l.id, { itemId: '', itemNo: '' }); return; }
                patch(l.id, { itemId: item.id, itemNo: item.itemNo, description: item.description, uomCode: item.inventoryUom || 'pc', unitPrice: item.itemCost, countryOfOriginCode: item.countryOfOriginCode });
              }}
            />
          )}
        </FormField>
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      if (!l.itemId) return null;
      const dn = l.baseType === 'DN' ? m.deliveries.find((d) => d.id === l.baseId) : undefined;
      const dl = dn?.lines.find((x) => x.id === l.baseLineId);
      const openHint = dn && dl ? `${dnOpenQty(dl, dn)} open on ${l.baseDocNo}` : undefined;
      return (
        <div className="flex w-32 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} className="w-full" invalid={Boolean(errors[`line:${l.id}:quantity`])} value={String(l.quantity)} disabled={added} onChange={(e) => patch(l.id, { quantity: Number(e.currentTarget.value) || 0 })} />
          <Text variant="small" tone="muted">{l.uomCode}</Text>
          {openHint ? <Text variant="small" tone="muted">{openHint}</Text> : null}
        </div>
      );
    }),
    col('warehouse', 'Warehouse', (l) => {
      const item = itemOf(l);
      if (!item?.inventoryItem) return <Text variant="small" tone="muted">—</Text>;
      return (
        <Select
          aria-label="Warehouse"
          className="w-40"
          options={[{ value: '', label: '— None —' }, ...warehouseOptions(l.warehouse)]}
          value={l.warehouse}
          disabled={added}
          onValueChange={(warehouse) => patch(l.id, { warehouse })}
        />
      );
    }),
    col('pricing', 'Price / Disc. / Tax', (l) =>
      l.itemId ? (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Unit price" type="number" min={0} prefix={code} invalid={Boolean(errors[`line:${l.id}:unitPrice`])} value={String(l.unitPrice)} disabled={added} onChange={(e) => patch(l.id, { unitPrice: Number(e.currentTarget.value) || 0 })} />
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(l.discountPct)} disabled={added} onChange={(e) => patch(l.id, { discountPct: Math.min(100, Number(e.currentTarget.value) || 0) })} />
          <Select aria-label="Tax code" invalid={Boolean(errors[`line:${l.id}:taxCode`])} options={[{ value: '', label: '— None —' }, ...taxOptions]} value={l.taxCode} disabled={added} onValueChange={(taxCode) => patch(l.id, { taxCode })} />
        </div>
      ) : null,
    ),
    col('total', `Total (${code})`, (l) => l.itemId ? <span className="whitespace-nowrap tabular-nums">{formatAmount(net(l))}</span> : null),
    col('returnReason', 'Return reason', (l) =>
      l.itemId ? (
        <Select
          aria-label="Return reason"
          className="w-44"
          options={[{ value: '', label: '— None —' }, ...RETURN_REASONS.map((r) => ({ value: r, label: r }))]}
          value={l.returnReason}
          disabled={added}
          onValueChange={(returnReason) => patch(l.id, { returnReason })}
        />
      ) : null,
    ),
    // ── Details group ──────────────────────────────────────────────────────────
    col('returnCost', 'Return cost', (l) => {
      const item = itemOf(l);
      if (!item?.inventoryItem) return null;
      const enabled = l.unitCostLc > 0;
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          {!added ? (
            <Checkbox
              checked={enabled}
              onChange={(e) => patch(l.id, { unitCostLc: e.currentTarget.checked ? (item.itemCost || 0) : 0 })}
            >
              Set manually
            </Checkbox>
          ) : null}
          {enabled || added ? (
            <TextField
              aria-label="Return cost"
              type="number"
              min={0}
              prefix="PHP"
              value={String(l.unitCostLc || item.itemCost || 0)}
              disabled={added || !enabled}
              onChange={(e) => patch(l.id, { unitCostLc: Number(e.currentTarget.value) || 0 })}
            />
          ) : (
            <Text variant="small" tone="muted">Auto (item cost)</Text>
          )}
        </div>
      );
    }, 'details'),
    col('countryOfOrigin', 'Country of origin', (l) =>
      l.itemId ? (
        <MasterLookup
          def={countryDef}
          fieldProps={{ 'aria-label': 'Country of origin', className: 'w-40' }}
          clearable
          value={l.countryOfOriginCode}
          onChange={(countryOfOriginCode) => patch(l.id, { countryOfOriginCode })}
        />
      ) : null,
    'details'),
    // ── References group ───────────────────────────────────────────────────────
    col('baseDoc', 'Base document', (l) => {
      if (!l.baseType) return l.itemId ? <Text variant="small" tone="muted">—</Text> : null;
      return (
        <Link intent="primary" href={`#/sales/deliveries/${l.baseId}`}>
          Delivery {l.baseDocNo}
        </Link>
      );
    }, 'references'),
    col('creditedQty', 'Credited', (l) =>
      l.itemId ? <span className="tabular-nums text-sm">{l.creditedQty > 0 ? `${l.creditedQty} ${l.uomCode}` : '—'}</span> : null,
    'references'),
  ].filter((c) => !c.group || isGroup(c.group));

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="assignment_return"
            iconIntent="default"
            iconShape="rounded"
            iconSize={32}
            iconVariant="outline"
            title={title}
            trailing={
              isNew ? undefined : (
                <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
                  <IconButton type="button" label="Previous" size="small" shape="pill" disabled={!prevId} onClick={() => navigate(`${SR_LIST_PATH}/${prevId}`)}>
                    {panelHeaderIcons.arrowUpward}
                  </IconButton>
                  <IconButton type="button" label="Next" size="small" shape="pill" disabled={!nextId} onClick={() => navigate(`${SR_LIST_PATH}/${nextId}`)}>
                    {panelHeaderIcons.arrowDownward}
                  </IconButton>
                </ButtonGroup>
              )
            }
            tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
            status={isNew ? undefined : <Badge size="small" intent={SR_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <>
                <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(SR_LIST_PATH)}>
                  {added ? 'Back' : 'Cancel'}
                </Button>
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                  {saving ? 'Saving…' : added ? 'Save' : 'Add'}
                </Button>
              </>
            }
          />
          {page === 'transactions' && (draft as SalesReturn).id ? (
            <Panel.Body className="flex flex-col gap-2">
              <SalesDocumentFlow
                kind="SRT"
                id={(draft as SalesReturn).id}
                notes="Everything linked to this sales return: the deliveries it sent goods back from, and the credit memos that credited it."
              />
            </Panel.Body>
          ) : page !== 'details' ? (
            <Panel.Body>
              <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
              {added ? (
                <Alert intent="default" variant="outline" title={draft.status === 'Open' ? 'Waiting for the customer credit' : `This sales return is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Open'
                    ? 'The stock is back in. Copy the return to an A/R credit memo to give the customer their credit. Only remarks and attachments can change.'
                    : 'Only remarks and attachments can change.'}
                </Alert>
              ) : null}

              <fieldset disabled={added} className="contents">
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <Section icon="person" title="Customer">
                    <Fields>
                      <div className="md:col-span-2">
                        {customer && (added || draft.lines.some((l) => l.baseType)) ? (
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
                      {h.text('customerRef', 'Customer ref. no.', { hint: "The customer's return authorization no." })}
                      <FormField label="Currency" className="md:col-span-2">
                        {(p) => (
                          <Select
                            {...p}
                            disabled={added || draft.lines.some((l) => l.baseType)}
                            options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                            value={code}
                            onValueChange={(currency) => update({ currency })}
                          />
                        )}
                      </FormField>
                    </Fields>
                  </Section>
                  <Section icon="tag" title="Document">
                    <Fields>
                      <FormField label="No.">
                        {() => (
                          <div className="flex gap-1">
                            <Select aria-label="Series" className="w-40" disabled={added} options={SR_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                            <span className="flex-1 self-center text-sm">{draft.docNum ? srNumber(draft) : <span className="text-(--color-text-placeholder)">Next number</span>}</span>
                          </div>
                        )}
                      </FormField>
                      <StatusField statuses={SR_STATUSES} intents={SR_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Open while the customer's credit is outstanding; Closed once fully credited." error={errors.status} />
                      {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When the stock comes back in.' })}
                      {h.date('dueDate', 'Due date', { hint: 'When the customer credit is due.' })}
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
                  description={`What the customer is sending back, in the line's unit. Stock comes back in at item cost.`}
                  rows={draft.lines}
                  getRowId={(l) => l.id}
                  columns={lineColumns}
                  unsortable={lineColumns.map((c) => c.key)}
                  noPagination
                  onColumnSettings={() => setLineSettingsOpen((v) => !v)}
                  empty={
                    <Text variant="small" tone="muted">
                      {draft.customerId ? 'Copy from a delivery, or add lines.' : 'Pick a customer first.'}
                    </Text>
                  }
                  onRemove={!added ? (removed) => update({ lines: draft.lines.filter((l) => !removed.includes(l)) }) : undefined}
                  actions={
                    !added && draft.customerId ? (
                      <div className="flex gap-2">
                        {availableDeliveries.length ? (
                          <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={16}>content_copy</Icon>} onClick={() => setCopying(true)}>
                            Copy from delivery
                          </Button>
                        ) : null}
                        <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ lines: [...draft.lines, newSrLine()] })}>
                          Add line
                        </Button>
                      </div>
                    ) : undefined
                  }
                >
                  {lineSettingsOpen ? (
                    <Card>
                      <Card.Header icon={<Icon size={24}>tune</Icon>}>Columns</Card.Header>
                      <Card.Content>
                        <div className="flex flex-wrap gap-x-6 gap-y-3">
                          {(Object.keys(LINE_GROUPS) as LineGroup[]).map((g) => (
                            <Checkbox key={g} checked={isGroup(g)} onChange={(e) => setShownGroups(e.currentTarget.checked ? [...shownGroups, g] : shownGroups.filter((x) => x !== g))}>
                              {LINE_GROUPS[g]}
                            </Checkbox>
                          ))}
                        </div>
                      </Card.Content>
                    </Card>
                  ) : null}
                </DataTable>

                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <Section icon="local_shipping" title="Logistics">
                    <Fields>
                      {h.lookup('shipTo', 'Return address', withCurrent(addressOptions, draft.shipTo), { hint: "Where the customer sends the goods.", disabled: !customer })}
                      {h.lookup('billTo', 'Bill to', withCurrent(addressOptions, draft.billTo), { disabled: !customer })}
                      {h.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
                    </Fields>
                  </Section>
                  <Section icon="account_balance" title="Accounting">
                    <Fields>
                      {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
                      {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
                      {h.date('dueDate', 'Due date')}
                      {h.text('journalRemark', 'Journal remark')}
                      {h.master('paymentTermId', 'Payment terms', paymentTermDef)}
                      {h.master('projectId', 'BP project', projectDef, { clearable: true })}
                      {h.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...asOptions(INDICATORS)])}
                      <ReadOnly label="Federal tax ID" value={customer?.tin || '—'} hint="The customer's TIN." />
                      <ReadOnly label="Order number" value={draft.orderNumber || '—'} />
                    </Fields>
                  </Section>
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <Section icon="functions" title="Totals">
                  <Fields cols={1}>
                    <fieldset disabled={added} className="contents">
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
                          input={
                            <TextField
                              aria-label="Document discount %"
                              type="number"
                              min={0}
                              className="w-24"
                              suffix="%"
                              value={String(draft.discountPct)}
                              onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })}
                            />
                          }
                        />
                        <TotalRow label="Tax" value={totals.tax} code={code} />
                        <TotalRow label="Total credit" value={totals.total} code={code} strong />
                      </List.Group>
                    </fieldset>
                    {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the return is added.' })}
                  </Fields>
                </Section>
                <Section icon="account_balance" title="Journal entry">
                  {journal.length ? (
                    <List.Group divider>
                      {journal.map((j) => (
                        <List.Item key={j.account} title={accountText(j.account, m.accounts)} content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>} />
                      ))}
                    </List.Group>
                  ) : null}
                  <Text variant="small" tone="muted">
                    In PHP, at item cost. Dr Inventory / Cr COGS — the reverse of the delivery entry.
                  </Text>
                </Section>
              </div>
              <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the RMA, photos of damage, or the courier return waybill." />
            </Panel.Body>
          )}
        </Panel>
      </Form>
      {copying
        ? createPortal(
            <CopyFromDeliveryPanel
              deliveries={availableDeliveries}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(dn, picks) => {
                const lines = picks.map(({ lineId, qty }) => {
                  const dl = dn.lines.find((l) => l.id === lineId)!;
                  const { invoicedQty: _i, ...base } = dl;
                  return newSrLine({
                    ...base,
                    id: `srl-${crypto.randomUUID().slice(0, 8)}`,
                    quantity: qty,
                    baseType: 'DN' as const,
                    baseId: dn.id,
                    baseLineId: dl.id,
                    baseDocNo: dnNumber(dn),
                    creditedQty: 0,
                    returnReason: '',
                  });
                });
                const first = !draft.lines.some((l) => l.baseType);
                setDraft((d) => d && {
                  ...d,
                  ...(first ? {
                    currency: dn.currency,
                    contactId: dn.contactId || d.contactId,
                    paymentTermId: dn.paymentTermId || d.paymentTermId,
                    discountPct: dn.discountPct,
                    salesEmployeeId: dn.salesEmployeeId || d.salesEmployeeId,
                    shipTo: dn.shipTo,
                    billTo: dn.billTo,
                  } : {}),
                  orderNumber: [...new Set([...(d.orderNumber ?? '').split(', ').filter(Boolean), dn.orderNumber].filter(Boolean))].join(', '),
                  lines: [...d.lines.filter((l) => l.itemId), ...lines],
                });
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

// ── Copy from delivery panel ──────────────────────────────────────────────────

function CopyFromDeliveryPanel({
  deliveries,
  taken,
  onCancel,
  onCopy,
}: {
  deliveries: Delivery[];
  taken: Set<string>;
  onCancel: () => void;
  onCopy: (dn: Delivery, picks: { lineId: string; qty: number }[]) => void;
}) {
  const sorted = [...deliveries].sort((a, b) => b.postingDate.localeCompare(a.postingDate));
  const [selected, setSelected] = useState<string | null>(sorted[0]?.id ?? null);
  const dn = sorted.find((d) => d.id === selected);
  const [qtys, setQtys] = useState<Record<string, number>>({});

  useEffect(() => {
    if (dn) {
      setQtys(Object.fromEntries(dn.lines.map((l) => [l.id, dnOpenQty(l, dn)])));
    }
  }, [selected, dn]);

  const lineColumns: TableColumn<Delivery['lines'][number]>[] = [
    { key: 'item', header: 'Item', cell: (l) => <span>{l.itemNo} <span className="text-muted-foreground text-xs">{l.description}</span></span> },
    { key: 'shipped', header: 'Shipped', cell: (l) => `${l.quantity} ${l.uomCode}` },
    { key: 'open', header: 'Open', cell: (l) => `${dn ? dnOpenQty(l, dn) : 0} ${l.uomCode}` },
    {
      key: 'return',
      header: 'Return qty',
      cell: (l) => {
        if (taken.has(l.id)) return <Text variant="small" tone="muted">Already on return</Text>;
        const openQ = dn ? dnOpenQty(l, dn) : 0;
        return (
          <TextField
            aria-label={`Return qty for ${l.itemNo}`}
            type="number"
            min={0}
            max={openQ}
            className="w-24"
            value={String(qtys[l.id] ?? openQ)}
            onChange={(e) => setQtys((q) => ({ ...q, [l.id]: Math.min(openQ, Number(e.currentTarget.value) || 0) }))}
          />
        );
      },
    },
  ];

  return (
    <EditPanel
      icon="local_shipping"
      title="Copy from delivery"
      onCancel={onCancel}
      onDone={() => {
        if (!dn) return onCancel();
        const picks = dn.lines
          .filter((l) => !taken.has(l.id) && (qtys[l.id] ?? dnOpenQty(l, dn)) > 0)
          .map((l) => ({ lineId: l.id, qty: qtys[l.id] ?? dnOpenQty(l, dn) }));
        if (picks.length) onCopy(dn, picks);
        else onCancel();
      }}
    >
      <Section icon="local_shipping" title="Pick a delivery">
        <Fields cols={1}>
          <Select
            aria-label="Delivery"
            options={sorted.map((d) => ({ value: d.id, label: `${dnNumber(d)} · ${formatDate(d.postingDate)} · ${d.currency}` }))}
            value={selected ?? ''}
            onValueChange={setSelected}
          />
        </Fields>
      </Section>
      {dn ? (
        <DataTable
          icon="receipt_long"
          title="Lines"
          rows={dn.lines}
          getRowId={(l) => l.id}
          columns={lineColumns}
          unsortable={lineColumns.map((c) => c.key)}
          noPagination
          empty={null}
        />
      ) : null}
    </EditPanel>
  );
}

// ── Total row ────────────────────────────────────────────────────────────────

function TotalRow({ label, value, code, input, strong }: { label: string; value: number; code: string; input?: import('react').ReactNode; strong?: boolean }) {
  const emphasis = (node: import('react').ReactNode) => (strong ? <Text as="span" weight="semibold" tone="heading">{node}</Text> : node);
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
