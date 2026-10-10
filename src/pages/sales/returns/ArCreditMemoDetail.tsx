import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Checkbox,
  Combobox,
  Form,
  FormField,
  IconButton,
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
import { DataTable } from '../../../components/form/DataTable';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { StatusField } from '../../../components/form/StatusField';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { AccountField } from '../../../components/form/AccountField';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { formatAddress } from '../../../mocks/address';
import { AR_CREDIT_SERIES, AR_CM_STATUSES, blankArCreditMemo, newArCmLine, type ArCreditMemo, type ArCmLine, type ArCmStatus } from '../../../mocks/arCreditMemos';
import type { ArInvoice } from '../../../mocks/arInvoices';
import { accountText } from '../../../mocks/chartOfAccounts';
import { CURRENT_USER_ID } from '../../../mocks/common';
import type { Currency, ExchangeRate } from '../../../mocks/currencies';
import { RETURN_REASONS } from '../../../mocks/goodsReturns';
import { PAYMENT_METHODS } from '../../../mocks/masters';
import { contactName, type Partner } from '../../../mocks/partners';
import { INDICATORS } from '../../../mocks/purchaseOrders';
import { rateAt } from '../../../mocks/taxes';
import type { Account } from '../../../mocks/chartOfAccounts';
import type { Company } from '../../../mocks/companies';
import type { Item } from '../../../mocks/items';
import {
  ArCmPostError,
  addArCreditMemo,
  applyArCredit,
  arCmJournal,
  arCmNumber,
  arCmTotals,
  arCreditMemoFromInvoice,
  arCreditMemoFromReturn,
  baseArInvoiceIds,
  cancelArCreditMemo,
  getArCreditMemo,
  listArCreditMemos,
  receivesStock,
  saveArCmDraft,
  saveArCmRemarks,
  type ArCmInput,
  type ArInvoiceBalances,
} from '../../../services/arCreditMemos';
import { listSalesReturns, srNumber, srOpenQty } from '../../../services/salesReturns';
import type { SalesReturn } from '../../../mocks/salesReturns';
import { arAmounts, arNumber, listArInvoices } from '../../../services/arInvoices';
import { loadCurrentCompany } from '../../../services/companies';
import { formatDate, todayISO } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { loadInventoryMasters, activeOptions, type InventoryMasters } from '../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../services/items';
import { postDocumentEntry, reverseDocumentEntry } from '../../../services/journalEntries';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes, rateOn } from '../../../services/masterData';
import { listPartnersByRole } from '../../../services/partners';
import { dueDateFor } from '../../../services/purchaseOrders';
import { type TaxMasterData } from '../../../services/taxDetermination';
import { paymentTermDef, projectDef, salesEmployeeDef } from '../../settings/masterDefs';
import { EditPanel } from '../../partners/detail/EditPanel';
import { SalesDocumentFlow } from '../shared/SalesDocumentFlow';
import { useDocTitle } from '../../../services/useDocTitle';
import { AR_CM_LIST_PATH, ARCM_STATUS_INTENT } from './types';

type TabId = 'header';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

const ALL_CURRENCIES = 'All currencies';
const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const round2 = (n: number) => Math.round(n * 100) / 100;

interface ArCmMasters {
  customers: Partner[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
  currencies: Currency[];
  rates: ExchangeRate[];
  accounts: Account[];
  company: Company;
  invoices: ArInvoice[];
  returns: SalesReturn[];
}

async function loadArCmMasters(): Promise<ArCmMasters> {
  const [customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, invoices, returns] = await Promise.all([
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
    listArInvoices(),
    listSalesReturns(),
  ]);
  return { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, invoices, returns, accounts: inv.accounts };
}

/** Invoices open to credit against (status Open or Closed). */
const creditableInvoices = (m: ArCmMasters, customerId: string) =>
  m.invoices.filter((i) => i.customerId === customerId && (i.status === 'Open' || i.status === 'Closed'));

function validate(d: ArCmInput, fx: number, m: ArCmMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.controlAccount, 'header', 'controlAccount', 'Pick the control account.');
  need(d.lines.length, 'header', 'lines', 'Add at least one line, or copy from an A/R invoice.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'header', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.quantity > 0, 'header', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'header', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'header', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
    if (receivesStock(l, m.items)) {
      need(l.warehouse, 'header', `line:${l.id}:warehouse`, `${n}: pick the warehouse the goods return to.`);
    }
  }
  return problems;
}

export function ArCreditMemoDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <ArCreditMemoForm key={id === 'new' ? location.key : id} />;
}

function ArCreditMemoForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const state = useLocation().state as { fromInvoice?: string; fromReturn?: string } | null;

  const [draft, setDraft] = useState<ArCmInput | null | undefined>(isNew ? blankArCreditMemo(todayISO(), CURRENT_USER_ID) : undefined);
  const [m, setM] = useState<ArCmMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadArCmMasters().then((masters) => {
      setM(masters);
      if (isNew && state?.fromInvoice) {
        const inv = masters.invoices.find((i) => i.id === state.fromInvoice);
        if (inv) {
          const lines = arCreditMemoFromInvoice(inv, inv.lines.map((l) => ({ lineId: l.id, qty: l.quantity })), masters.items);
          const customer = masters.customers.find((c) => c.id === inv.customerId);
          setDraft((d) => d && {
            ...d,
            ...customerDefaults(customer, d),
            currency: inv.currency,
            contactId: inv.contactId || d.contactId,
            paymentTermId: inv.paymentTermId || d.paymentTermId,
            discountPct: inv.discountPct,
            salesEmployeeId: inv.salesEmployeeId || d.salesEmployeeId,
            controlAccount: inv.controlAccount || '1120',
            shipTo: inv.shipTo,
            billTo: inv.billTo,
            lines,
            orderNumber: inv.orderNumber || '',
          });
        }
      }
      if (isNew && state?.fromReturn) {
        const sr = masters.returns.find((r) => r.id === state.fromReturn);
        if (sr) {
          const lines = arCreditMemoFromReturn(
            sr,
            sr.lines.map((l) => ({ lineId: l.id, qty: srOpenQty(l, sr) })).filter((p) => p.qty > 0),
            masters.items,
            srNumber,
            srOpenQty,
          );
          const customer = masters.customers.find((c) => c.id === sr.customerId);
          setDraft((d) => d && {
            ...d,
            ...customerDefaults(customer, d),
            currency: sr.currency,
            contactId: sr.contactId || d.contactId,
            paymentTermId: sr.paymentTermId || d.paymentTermId,
            discountPct: sr.discountPct,
            salesEmployeeId: sr.salesEmployeeId || d.salesEmployeeId,
            controlAccount: '1120',
            shipTo: sr.shipTo,
            billTo: sr.billTo,
            lines,
          });
        }
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getArCreditMemo(id).then((c) => !cancelled && setDraft(c ?? null));
    listArCreditMemos().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((c) => c.docNum ? arCmNumber(c) : c.id)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New A/R credit memo' : arCmNumber(draft as ArCreditMemo)) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading A/R credit memo…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="undo" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="A/R credit memo not found" />
        <Panel.Body>
          <Button onClick={() => navigate(AR_CM_LIST_PATH)}>Back to credit memos</Button>
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
  const at = (draft as ArCreditMemo).id ? siblings.indexOf(draft.docNum ? arCmNumber(draft as ArCreditMemo) : (draft as ArCreditMemo).id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totals = arCmTotals(draft, rateOf);
  const openBalance = round2(totals.total - draft.appliedAmount);
  const journal = fx ? arCmJournal(draft, fx, { items: m.items, groups: m.inv.groups, codes: m.tax.codes, rateOf }) : [];

  const update = (patch: Partial<ArCmInput>) => {
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

  const sameCurrency = <T extends { currency: string }>(docs: T[]) => docs.filter((d) => !draft.lines.some((l) => l.baseType) || d.currency === code);
  const invoices = draft.customerId ? sameCurrency(creditableInvoices(m, draft.customerId)) : [];

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await saveArCmRemarks(draft as ArCreditMemo, { remarks: draft.remarks });
        navigate(AR_CM_LIST_PATH, { state: { notice: `A/R credit memo ${arCmNumber(saved)} saved.` } });
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
        const saved = await saveArCmDraft(draft);
        navigate(AR_CM_LIST_PATH, { state: { notice: `Draft saved — ${saved.customerName}.` } });
        return;
      }
      const balances: ArInvoiceBalances = new Map(
        baseArInvoiceIds(draft).flatMap((invoiceId) => {
          const inv = m.invoices.find((i) => i.id === invoiceId);
          if (!inv || inv.status !== 'Open') return [];
          const amounts = arAmounts(inv, customer, m.items, m.tax.codes);
          return [[invoiceId, { docNo: arNumber(inv), balance: amounts.balanceDue, total: amounts.due }]];
        }),
      );
      const saved = await addArCreditMemo(draft, fx, totals.total, balances);
      await postDocumentEntry({
        origin: 'AC',
        originNo: saved.docNum,
        originId: saved.id,
        postingDate: saved.postingDate,
        dueDate: saved.dueDate,
        remarks: saved.journalRemark,
        partnerId: saved.customerId,
        controlAccount: saved.controlAccount,
        lines: journal,
      });
      const applied = saved.applications.map((a) => `${a.docNo} (${code} ${formatAmount(a.amount)})`).join(', ');
      navigate(AR_CM_LIST_PATH, {
        state: {
          notice: `A/R credit memo ${arCmNumber(saved)} added — ${code} ${formatAmount(totals.total)} credit${applied ? `, applied to ${applied}` : ''}${saved.status === 'Open' ? `; ${code} ${formatAmount(totals.total - saved.appliedAmount)} left to apply` : ''}.`,
        },
      });
    } catch (err) {
      if (!(err instanceof ArCmPostError)) throw err;
      setProblems([{ tab: 'header', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as ArCreditMemo;
  const openInvoices = draft.customerId ? m.invoices.filter((i) => i.customerId === draft.customerId && i.status === 'Open' && i.currency === code).map((inv) => {
    const amounts = arAmounts(inv, customer, m.items, m.tax.codes);
    return { inv, balanceDue: amounts.balanceDue, total: amounts.due };
  }).filter((x) => x.balanceDue > 0) : [];

  const cancelIt = async () => {
    try {
      const totalsByInvoice = new Map(
        saved.applications.map((a) => {
          const inv = m.invoices.find((i) => i.id === a.invoiceId);
          const amounts = inv ? arAmounts(inv, customer, m.items, m.tax.codes) : undefined;
          return [a.invoiceId, amounts?.due ?? Infinity];
        }),
      );
      const c = await cancelArCreditMemo(saved, totalsByInvoice);
      await reverseDocumentEntry(saved.id);
      navigate(AR_CM_LIST_PATH, { state: { notice: `A/R credit memo ${arCmNumber(c)} cancelled.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const statusMoves: Partial<Record<ArCmStatus, () => void>> =
    draft.status === 'Draft'
      ? { Open: () => submit(null) }
      : draft.status === 'Open' || draft.status === 'Closed'
        ? { Cancelled: cancelIt }
        : {};

  const baseInvIds = baseArInvoiceIds(draft);
  const baseInvoiceDocs = baseInvIds.flatMap((invoiceId) => {
    const inv = m.invoices.find((i) => i.id === invoiceId);
    return inv ? [{ id: inv.id, docNo: arNumber(inv) }] : [];
  });

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Open' && openBalance > 0 && openInvoices.length ? [{ label: 'Apply credit to an invoice', icon: 'request_quote', onSelect: () => setApplying(true) }] : []),
    ...(draft.status === 'Open' || draft.status === 'Closed' ? [{ label: 'Cancel credit memo', icon: 'cancel', onSelect: cancelIt }] : []),
    ...baseInvoiceDocs.map((inv) => ({
      label: `Open A/R invoice ${inv.docNo}`,
      icon: 'receipt' as const,
      onSelect: () => navigate(`/sales/invoices/${inv.id}`),
    })),
    ...(customer ? [{ label: `Open customer ${customer.code}`, icon: 'person', onSelect: () => navigate(`/sales/customers/${customer.id}`) }] : []),
  ];

  const title = isNew ? 'New A/R credit memo' : added ? arCmNumber(draft as ArCreditMemo) : 'Draft A/R credit memo';

  const addressOptions = customerAddressOptions(customer);
  const withCurrent = (opts: { value: string; label: string }[], v: string) =>
    !v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v.split('\n')[0] }, ...opts];

  const returnGoodsColumn: TableColumn<ArCmLine> = {
    key: 'returnGoods',
    header: 'Return goods',
    cell: (l) => {
      const item = m.items.find((i) => i.id === l.itemId);
      if (!item) return null;
      if (!item.inventoryItem) return <Text variant="small" tone="muted">Not stocked</Text>;
      return (
        <Checkbox
          aria-label={`Return goods for ${l.itemNo}`}
          checked={l.returnGoods}
          disabled={added}
          onChange={(e) => update({ lines: draft.lines.map((x) => (x.id === l.id ? { ...x, returnGoods: e.currentTarget.checked } : x)) })}
        >
          {l.returnGoods ? 'Put back' : 'Price only'}
        </Checkbox>
      );
    },
  };

  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${rateOf(c.code)}%)` }));

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="undo"
            iconIntent="default"
            iconShape="rounded"
            iconSize={32} iconVariant="outline"
            title={title}
            trailing={
              isNew ? undefined : (
                <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
                  <IconButton type="button" label="Previous" size="small" shape="pill" disabled={!prevId} onClick={() => navigate(`${AR_CM_LIST_PATH}/${prevId}`)}>
                    {panelHeaderIcons.arrowUpward}
                  </IconButton>
                  <IconButton type="button" label="Next" size="small" shape="pill" disabled={!nextId} onClick={() => navigate(`${AR_CM_LIST_PATH}/${nextId}`)}>
                    {panelHeaderIcons.arrowDownward}
                  </IconButton>
                </ButtonGroup>
              )
            }
            tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
            status={isNew ? undefined : <Badge size="small" intent={ARCM_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <>
                <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(AR_CM_LIST_PATH)}>
                  {added ? 'Back' : 'Cancel'}
                </Button>
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                  {saving ? 'Saving…' : added ? 'Save' : 'Add'}
                </Button>
              </>
            }
          />
          {page === 'transactions' && (draft as ArCreditMemo).id ? (
            <Panel.Body className="flex flex-col gap-2">
              <SalesDocumentFlow
                kind="ARCM"
                id={(draft as ArCreditMemo).id}
                notes="Everything linked to this credit memo: the A/R invoices it credits."
              />
            </Panel.Body>
          ) : page !== 'details' ? (
            <Panel.Body>
              <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={() => 'Details'} />
              {added ? (
                <Alert intent="default" variant="outline" title={draft.status === 'Open' ? `${code} ${formatAmount(openBalance)} of credit left to apply` : `This credit memo is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Open'
                    ? 'Apply it to another open invoice of this customer with You can also › Apply credit to an invoice. Only remarks can change.'
                    : 'Only remarks can change.'}
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
                      {h.text('customerRef', 'Customer ref. no.', { hint: "The customer's credit request no." })}
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
                            <Select aria-label="Series" className="w-40" disabled={added} options={AR_CREDIT_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                            <span className="flex-1 self-center text-sm">{draft.docNum ? arCmNumber(draft as ArCreditMemo) : <span className="text-(--color-text-placeholder)">Next number</span>}</span>
                          </div>
                        )}
                      </FormField>
                      <StatusField statuses={AR_CM_STATUSES} intents={ARCM_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Open while credit is left to apply; Closed once all of it is applied." error={errors.status} />
                      {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
                      {h.date('dueDate', 'Due date')}
                      {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
                      <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
                    </Fields>
                  </Section>
                </div>

                {/* Contents */}
                <ContentsSection
                  lines={draft.lines}
                  onChange={(lines) => update({ lines })}
                  errors={errors}
                  m={m}
                  rateOf={rateOf}
                  taxOptions={taxOptions}
                  added={added}
                  postingDate={draft.postingDate}
                  customerId={draft.customerId}
                  currency={code}
                  invoices={invoices}
                  onCopyFromInvoice={(inv, picks) => {
                    const newLines = arCreditMemoFromInvoice(inv, picks, m.items);
                    const first = !draft.lines.some((l) => l.baseType);
                    setDraft((d) => d && {
                      ...d,
                      ...(first ? {
                        currency: inv.currency,
                        contactId: inv.contactId || d.contactId,
                        paymentTermId: inv.paymentTermId || d.paymentTermId,
                        discountPct: inv.discountPct,
                        salesEmployeeId: inv.salesEmployeeId || d.salesEmployeeId,
                        controlAccount: inv.controlAccount || '1120',
                        shipTo: inv.shipTo,
                        billTo: inv.billTo,
                      } : {}),
                      lines: [...d.lines.filter((l) => l.itemId), ...newLines],
                    });
                  }}
                  extraColumns={[returnGoodsColumn]}
                />

                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <Section icon="local_shipping" title="Logistics">
                    <Fields>
                      {h.lookup('shipTo', 'Return from', withCurrent(addressOptions, draft.shipTo), { hint: 'Where goods are returned from.', disabled: !customer })}
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
                      <AccountField
                        label="Control account"
                        role="receivable"
                        value={draft.controlAccount}
                        onChange={(controlAccount) => update({ controlAccount })}
                        accounts={m.accounts}
                        required
                        error={errors.controlAccount}
                        disabled={added}
                        hint="The customer's receivable account by default."
                      />
                      {h.master('paymentTermId', 'Payment terms', paymentTermDef)}
                      {h.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
                      {h.master('projectId', 'BP project', projectDef, { clearable: true })}
                      {h.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...asOptions(INDICATORS)])}
                      <ReadOnly label="Federal tax ID" value={customer?.tin || '—'} hint="The customer's TIN." />
                      <ReadOnly label="Order number" value={draft.orderNumber || '—'} />
                    </Fields>
                  </Section>
                </div>

                <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="Customer's return authorization, photos of defective goods." withDescription />
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
                        <TotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
                        <TotalRow label="Open balance" value={openBalance} code={code} strong />
                      </List.Group>
                    </fieldset>
                    {draft.applications.length ? (
                      <Text variant="small" tone="muted">
                        Applied to {draft.applications.map((a) => `A/R invoice ${a.docNo} (${code} ${formatAmount(a.amount)}, ${formatDate(a.date)})`).join('; ')}.
                      </Text>
                    ) : null}
                    {h.area('remarks', 'Remarks', { rows: 3 })}
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
                    In PHP{code === 'PHP' ? '' : ` at ${fx}`}. Dr Revenue and Output VAT / Cr A/R (reducing what the customer owes), plus Dr Inventory / Cr COGS for returned stock.
                  </Text>
                </Section>
              </div>
            </Panel.Body>
          )}
        </Panel>
      </Form>
      {applying && (draft as ArCreditMemo).id
        ? createPortal(
            <ApplyCreditPanel
              code={code}
              open={openBalance}
              invoices={openInvoices.map((x) => ({ id: x.inv.id, docNo: arNumber(x.inv), dueDate: x.inv.dueDate, balance: x.balanceDue, total: x.total }))}
              onCancel={() => setApplying(false)}
              onDone={async (picks) => {
                const c = await applyArCredit(saved, totals.total, picks);
                setApplying(false);
                navigate(AR_CM_LIST_PATH, { state: { notice: `Applied ${code} ${formatAmount(picks.reduce((n, p) => n + p.amount, 0))} of credit memo ${arCmNumber(c)}.` } });
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

// ── Line helpers ──────────────────────────────────────────────────────────────

interface ContentsSectionProps {
  lines: ArCmLine[];
  onChange: (lines: ArCmLine[]) => void;
  errors: Errors;
  m: ArCmMasters;
  rateOf: (code: string) => number;
  taxOptions: { value: string; label: string }[];
  added: boolean;
  postingDate: string;
  customerId: string;
  currency: string;
  invoices: ArInvoice[];
  onCopyFromInvoice: (inv: ArInvoice, picks: { lineId: string; qty: number }[]) => void;
  extraColumns?: TableColumn<ArCmLine>[];
}

function ContentsSection({ lines, onChange, errors, m, taxOptions, added, postingDate, customerId, currency, invoices, onCopyFromInvoice, extraColumns = [] }: ContentsSectionProps) {
  const [copying, setCopying] = useState(false);

  const patch = (id: string, p: Partial<ArCmLine>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const err = (l: ArCmLine, f: string) => errors[`line:${l.id}:${f}`];
  const net = (l: ArCmLine) => round2(l.quantity * (l.itemsPerUnit || 1) * l.unitPrice * (1 - l.discountPct / 100));
  const itemOf = (l: ArCmLine) => m.items.find((i) => i.id === l.itemId);

  const warehouseOptions = (current: string) => {
    const all = m.inv.warehouses.filter((w) => w.active || w.code === current);
    return all.map((w) => ({ value: w.code, label: `${w.code} — ${w.name}` }));
  };

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.salesItem && isValidToday(i, postingDate)))
      .map((i) => ({ value: i.id, label: i.itemNo, subLabel: i.description, text: `${i.itemNo} ${i.description}` }));

  const columns: TableColumn<ArCmLine>[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (l) => {
        if (l.baseType) {
          const item = itemOf(l);
          return (
            <div>
              <div className="text-sm font-medium">{item?.itemNo || l.itemNo}</div>
              <div className="text-xs text-muted-foreground">{l.description}</div>
              <div className="text-xs text-muted-foreground">From {l.baseDocNo}</div>
            </div>
          );
        }
        return (
          <FormField label="" error={err(l, 'item')}>
            {(fp) => (
              <Combobox
                {...fp}
                aria-label="Item"
                placeholder="Pick an item"
                options={itemOptions(l.itemId)}
                value={l.itemId || null}
                disabled={added}
                onValueChange={(itemId) => {
                  const item = m.items.find((i) => i.id === itemId);
                  if (!item) { patch(l.id, { itemId: '', itemNo: '' }); return; }
                  patch(l.id, { itemId: item.id, itemNo: item.itemNo, description: item.description, uomCode: item.inventoryUom || 'pc', unitPrice: item.itemCost });
                }}
              />
            )}
          </FormField>
        );
      },
    },
    {
      key: 'quantity',
      header: 'Qty',
      cell: (l) => (
        <TextField
          aria-label="Quantity"
          type="number"
          min={0}
          className="w-24"
          value={String(l.quantity)}
          disabled={added}
          onChange={(e) => patch(l.id, { quantity: Number(e.currentTarget.value) || 0 })}
        />
      ),
    },
    {
      key: 'uom',
      header: 'UoM',
      cell: (l) => <span className="text-sm">{l.uomCode}</span>,
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      cell: (l) => {
        const item = itemOf(l);
        if (!item?.inventoryItem) return <Text variant="small" tone="muted">—</Text>;
        return (
          <Select
            aria-label="Warehouse"
            options={[{ value: '', label: '— None —' }, ...warehouseOptions(l.warehouse)]}
            value={l.warehouse}
            disabled={added}
            onValueChange={(warehouse) => patch(l.id, { warehouse })}
          />
        );
      },
    },
    {
      key: 'unitPrice',
      header: 'Unit price',
      cell: (l) => (
        <TextField
          aria-label="Unit price"
          type="number"
          min={0}
          className="w-32"
          prefix={currency}
          value={String(l.unitPrice)}
          disabled={added}
          onChange={(e) => patch(l.id, { unitPrice: Number(e.currentTarget.value) || 0 })}
        />
      ),
    },
    {
      key: 'discountPct',
      header: 'Disc. %',
      cell: (l) => (
        <TextField
          aria-label="Discount %"
          type="number"
          min={0}
          className="w-20"
          suffix="%"
          value={String(l.discountPct)}
          disabled={added}
          onChange={(e) => patch(l.id, { discountPct: Math.min(100, Number(e.currentTarget.value) || 0) })}
        />
      ),
    },
    {
      key: 'total',
      header: `Total (${currency})`,
      cell: (l) => <span className="tabular-nums">{formatAmount(net(l))}</span>,
    },
    {
      key: 'taxCode',
      header: 'Tax code',
      cell: (l) => (
        <Select
          aria-label="Tax code"
          options={[{ value: '', label: '— None —' }, ...taxOptions]}
          value={l.taxCode}
          disabled={added}
          onValueChange={(taxCode) => patch(l.id, { taxCode })}
        />
      ),
    },
    {
      key: 'returnReason',
      header: 'Return reason',
      cell: (l) => (
        <Select
          aria-label="Return reason"
          options={[{ value: '', label: '— None —' }, ...RETURN_REASONS.map((r) => ({ value: r, label: r }))]}
          value={l.returnReason}
          disabled={added}
          onValueChange={(returnReason) => patch(l.id, { returnReason })}
        />
      ),
    },
    ...extraColumns,
  ];

  return (
    <>
      <DataTable
        variant="card"
        icon="receipt_long"
        title="Contents"
        description={`What is credited to the customer, in ${currency}.`}
        rows={lines}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key)}
        noPagination
        empty={
          <Text variant="small" tone="muted">
            {customerId ? 'Copy from an A/R invoice, or add lines.' : 'Pick a customer first.'}
          </Text>
        }
        onRemove={!added ? (removed) => onChange(lines.filter((l) => !removed.includes(l))) : undefined}
        actions={
          !added && customerId ? (
            <div className="flex gap-2">
              {invoices.length ? (
                <Button type="button" size="small" intent="white" variant="solid" onClick={() => setCopying(true)}>
                  Copy from invoice
                </Button>
              ) : null}
              <Button type="button" size="small" intent="white" variant="solid" onClick={() => onChange([...lines, newArCmLine()])}>
                Add line
              </Button>
            </div>
          ) : undefined
        }
      />
      {copying
        ? createPortal(
            <CopyFromInvoicePanel
              invoices={invoices}
              onCancel={() => setCopying(false)}
              onCopy={(inv, picks) => {
                onCopyFromInvoice(inv, picks);
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

// ── Copy from invoice panel ───────────────────────────────────────────────────

function CopyFromInvoicePanel({
  invoices,
  onCancel,
  onCopy,
}: {
  invoices: ArInvoice[];
  onCancel: () => void;
  onCopy: (inv: ArInvoice, picks: { lineId: string; qty: number }[]) => void;
}) {
  const sorted = [...invoices].sort((a, b) => b.postingDate.localeCompare(a.postingDate));
  const [selected, setSelected] = useState<string | null>(sorted[0]?.id ?? null);
  const inv = sorted.find((i) => i.id === selected);
  const [qtys, setQtys] = useState<Record<string, number>>({});

  useEffect(() => {
    if (inv) {
      setQtys(Object.fromEntries(inv.lines.map((l) => [l.id, l.quantity])));
    }
  }, [selected, inv]);

  const lineColumns: TableColumn<(typeof sorted)[0]['lines'][number]>[] = [
    { key: 'item', header: 'Item', cell: (l) => <span>{l.itemNo} <span className="text-muted-foreground text-xs">{l.description}</span></span> },
    { key: 'qty', header: 'Billed', cell: (l) => `${l.quantity} ${l.uomCode}` },
    {
      key: 'credit',
      header: 'Credit qty',
      cell: (l) => (
        <TextField
          aria-label={`Credit qty for ${l.itemNo}`}
          type="number"
          min={0}
          max={l.quantity}
          className="w-24"
          value={String(qtys[l.id] ?? l.quantity)}
          onChange={(e) => setQtys((q) => ({ ...q, [l.id]: Math.min(l.quantity, Number(e.currentTarget.value) || 0) }))}
        />
      ),
    },
  ];

  return (
    <EditPanel
      icon="receipt"
      title="Copy from A/R invoice"
      onCancel={onCancel}
      onDone={() => {
        if (!inv) return onCancel();
        const picks = inv.lines.filter((l) => (qtys[l.id] ?? l.quantity) > 0).map((l) => ({ lineId: l.id, qty: qtys[l.id] ?? l.quantity }));
        if (picks.length) onCopy(inv, picks);
        else onCancel();
      }}
    >
      <Section icon="receipt" title="Pick an invoice">
        <Fields cols={1}>
          <Select
            aria-label="Invoice"
            options={sorted.map((i) => ({ value: i.id, label: `${arNumber(i)} · ${formatDate(i.postingDate)} · ${i.currency}` }))}
            value={selected ?? ''}
            onValueChange={setSelected}
          />
        </Fields>
      </Section>
      {inv ? (
        <DataTable
          icon="receipt_long"
          title="Lines"
          rows={inv.lines}
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

// ── Apply credit panel ────────────────────────────────────────────────────────

function ApplyCreditPanel({
  code,
  open,
  invoices,
  onCancel,
  onDone,
}: {
  code: string;
  open: number;
  invoices: { id: string; docNo: string; dueDate: string; balance: number; total: number }[];
  onCancel: () => void;
  onDone: (picks: { invoiceId: string; docNo: string; amount: number; total: number }[]) => void;
}) {
  const sorted = [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    let left = open;
    return Object.fromEntries(
      sorted.map((i) => {
        const a = round2(Math.min(left, i.balance));
        left = round2(left - a);
        return [i.id, a];
      }),
    );
  });
  const total = round2(Object.values(amounts).reduce((n, a) => n + a, 0));

  const columns: TableColumn<(typeof sorted)[number]>[] = [
    { key: 'docNo', header: 'A/R invoice', cell: (i) => i.docNo },
    { key: 'dueDate', header: 'Due', cell: (i) => formatDate(i.dueDate) },
    { key: 'balance', header: 'Balance due', cell: (i) => formatAmount(i.balance) },
    {
      key: 'amount',
      header: `Apply (${code})`,
      cell: (i) => (
        <TextField
          aria-label={`Apply to ${i.docNo}`}
          type="number"
          min={0}
          className="w-36"
          value={String(amounts[i.id] ?? 0)}
          onChange={(e) =>
            setAmounts({ ...amounts, [i.id]: Math.min(i.balance, Number(e.currentTarget.value) || 0) })
          }
        />
      ),
    },
  ];

  return (
    <EditPanel
      icon="request_quote"
      title="Apply credit to invoices"
      onCancel={onCancel}
      onDone={() =>
        total > 0 && total <= open + 0.005
          ? onDone(sorted.filter((i) => amounts[i.id] > 0).map((i) => ({ invoiceId: i.id, docNo: i.docNo, amount: amounts[i.id], total: i.total })))
          : onCancel()
      }
    >
      <Section icon="savings" title={`${code} ${formatAmount(open)} of credit to apply`}>
        <Text variant="small" tone={total > open + 0.005 ? 'danger' : 'muted'}>
          Applying {code} {formatAmount(total)}{total > open + 0.005 ? ' — more than the credit left.' : '. Each invoice balance drops by what is applied.'}
        </Text>
      </Section>
      <DataTable
        icon="receipt_long"
        title="Open A/R invoices"
        rows={sorted}
        getRowId={(i) => i.id}
        columns={columns}
        unsortable={columns.map((c) => c.key)}
        noPagination
        empty={<Text variant="small" tone="muted">No open invoices in {code}.</Text>}
      />
    </EditPanel>
  );
}

// ── Total row ─────────────────────────────────────────────────────────────────

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

// ── Customer defaults ─────────────────────────────────────────────────────────

function customerDefaults(c: Partner | undefined, d: ArCmInput): Partial<ArCmInput> {
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
    controlAccount: '1120',
    journalRemark: `A/R Credit Memo – ${c.code}`,
    shipTo: ship ? formatAddress(ship, c.name) : '',
    billTo: bill ? formatAddress(bill, c.name) : '',
  };
}

function customerAddressOptions(c: Partner | undefined) {
  return (c?.addresses ?? []).map((a) => ({ value: formatAddress(a, c!.name), label: `${a.label || 'Address'} · ${a.city || a.countryCode}` }));
}
