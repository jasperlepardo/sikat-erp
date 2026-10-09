import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
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
import { AccountField } from '../../../components/form/AccountField';
import { DataTable } from '../../../components/form/DataTable';
import { Fields, Flags, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../mocks/address';
import { MEMO_SERIES, blankCreditMemo, newMemoLine, type ApCreditMemo, type MemoLine } from '../../../mocks/apCreditMemos';
import type { ApInvoice } from '../../../mocks/apInvoices';
import { accountText } from '../../../mocks/chartOfAccounts';
import { CURRENT_USER_ID } from '../../../mocks/common';
import type { GoodsReturn } from '../../../mocks/goodsReturns';
import { PAYMENT_METHODS } from '../../../mocks/masters';
import { contactName, type Partner } from '../../../mocks/partners';
import { INDICATORS } from '../../../mocks/purchaseOrders';
import {
  MemoPostError,
  addCreditMemo,
  applyCredit,
  baseInvoiceIds,
  cancelCreditMemo,
  getCreditMemo,
  listCreditMemos,
  memoJournal,
  memoNumber,
  memoTotals,
  netCredit,
  saveMemoDraft,
  saveMemoRemarks,
  sendsStock,
  type InvoiceBalances,
} from '../../../services/apCreditMemos';
import { apNumber, returnableQty } from '../../../services/apInvoices';
import { formatDate, todayISO } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { creditableReturns, returnNumber, returnOpenQty } from '../../../services/goodsReturns';
import { isValidToday } from '../../../services/items';
import { postDocumentEntry, reverseDocumentEntry } from '../../../services/journalEntries';
import { dueDateFor, poWithholding } from '../../../services/purchaseOrders';
import { paymentTermDef, projectDef, salesEmployeeDef } from '../../settings/masterDefs';
import { ReferencesTable } from '../orders/detail/AccountingTab';
import { TotalNote, TotalRow } from '../orders/detail/PurchaseOrderDetail';
import { invoiceBalance } from '../payments/detail/types';
import { buildGrContext } from '../receipts/detail/types';
import { EditPanel } from '../../partners/detail/EditPanel';
import { CopyPanel } from '../shared/CopyPanel';
import { DocumentFlow } from '../shared/DocumentFlow';
import { loadRetMasters, vendorAddressOptions } from './GoodsReturnDetail';
import { ReturnLines } from './ReturnLines';
import { MEMO_LIST_PATH, MEMO_STATUS_INTENT, memoFromInvoice, memoFromReturn, type RetMasters } from './types';

type Draft = Omit<ApCreditMemo, 'id'> & { id?: string };
type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

const WITHHELD_LABEL: Record<string, string> = { 'Expanded (EWT)': 'EWT', 'Final (FWT)': 'Final tax', 'Withholding VAT': 'VAT', 'Percentage tax': 'Percentage tax' };
const ALL_CURRENCIES = 'All currencies';
const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Invoices open to credit or return against: added, not cancelled. */
const creditableInvoices = (m: RetMasters, vendorId: string) => m.invoices.filter((i) => i.vendorId === vendorId && (i.status === 'Open' || i.status === 'Closed'));

function validate(d: Draft, fx: number, m: RetMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.controlAccount, 'accounting', 'controlAccount', 'Pick the control account.');
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from an A/P invoice or goods return.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.baseType || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    if (sendsStock(l, m.items)) {
      need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse the goods leave from.`);
      const have = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
      need(have >= l.quantity * l.itemsPerUnit, 'contents', `line:${l.id}:quantity`, `${n}: ${l.warehouse} has ${have} ${item.inventoryUom} of ${item.itemNo}.`);
    }
    if (l.baseType === 'APINV') {
      const il = m.invoices.find((x) => x.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId);
      const open = il ? (l.returnGoods ? returnableQty(il) : il.quantity) : 0;
      need(l.quantity <= open, 'contents', `line:${l.id}:quantity`, `${n}: ${l.returnGoods ? 'returning' : 'crediting'} ${l.quantity}, but invoice ${l.baseDocNo} has ${open} ${l.returnGoods ? 'left to return' : 'billed'}.`);
    }
    if (l.baseType === 'GRET') {
      const r = m.returns.find((x) => x.id === l.baseId);
      const rl = r?.lines.find((x) => x.id === l.baseLineId);
      const open = r && rl ? returnOpenQty(rl, r) : 0;
      need(l.quantity <= open, 'contents', `line:${l.id}:quantity`, `${n}: crediting ${l.quantity}, but return ${l.baseDocNo} has ${open} left to credit.`);
    }
  }
  return problems;
}

export function CreditMemoDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <CreditMemoForm key={id === 'new' ? location.key : id} />;
}

function CreditMemoForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const state = useLocation().state as { fromInvoice?: string; fromReturn?: string } | null;

  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? blankCreditMemo(todayISO(), CURRENT_USER_ID) : undefined);
  const [m, setM] = useState<RetMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadRetMasters().then((masters) => {
      setM(masters);
      // Copy to › A/P Credit Memo from an invoice or a goods return.
      const inv = state?.fromInvoice ? masters.invoices.find((i) => i.id === state.fromInvoice) : undefined;
      const ret = state?.fromReturn ? masters.returns.find((r) => r.id === state.fromReturn) : undefined;
      if (isNew && (inv || ret)) {
        const vendor = masters.vendors.find((v) => v.id === (inv ?? ret)!.vendorId);
        const lines = inv
          ? memoFromInvoice(inv, inv.lines.map((l) => ({ lineId: l.id, qty: l.quantity })), masters.items)
          : memoFromReturn(ret!, ret!.lines.map((l) => ({ lineId: l.id, qty: returnOpenQty(l, ret!) })).filter((p) => p.qty > 0), masters.items);
        setDraft((d) => d && withBase({ ...d, ...vendorDefaults(vendor, d), lines: [] }, inv ?? ret!, lines));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getCreditMemo(id).then((c) => !cancelled && setDraft(c ?? null));
    listCreditMemos().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((c) => c.id)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading A/P credit memo…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="receipt" title="A/P credit memo not found" />
        <Panel.Body>
          <Button onClick={() => navigate(MEMO_LIST_PATH)}>Back to credit memos</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const base = buildGrContext(draft, m);
  const added = draft.status !== 'Draft';
  // A memo from invoices (directly or through a return) is credited at the invoice's rate.
  const baseInvoice = m.invoices.find((i) => baseInvoiceIds(draft).includes(i.id));
  const fx = draft.currency === 'PHP' ? 1 : added ? draft.fxRate : baseInvoice ? baseInvoice.fxRate : base.fx;
  const ctx = { ...base, fx, fxSource: baseInvoice && !added ? `invoice ${apNumber(baseInvoice)}'s rate` : base.fxSource };
  const { vendor } = ctx;
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totals = memoTotals(draft, ctx.rateOf, ctx.isReverseCharge);
  const withholding = poWithholding(draft, vendor, m.items, m.tax, draft.postingDate);
  const credit = netCredit(totals.total, withholding, draft.downPayment);
  const openBalance = round2(credit - draft.appliedAmount);
  const journal = fx ? memoJournal(draft, fx, { items: m.items, groups: m.inv.groups, codes: m.tax.codes, rateOf: ctx.rateOf, withholding }) : [];
  const code = draft.currency;
  const balanceOf = (inv: ApInvoice) => invoiceBalance(inv, m);

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTermId))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTermId);
    }
    setDraft(next);
  };
  const h = bind(draft, update);

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    update(v ? { ...vendorDefaults(v, draft), lines: draft.lines.filter((l) => !l.baseType) } : { vendorId: '', vendorCode: '', vendorName: '', contactId: '', shipTo: '', payTo: '' });
  };

  const sameCurrency = <T extends { currency: string }>(docs: T[]) => (ctx.based ? docs.filter((d) => d.currency === code) : docs);
  const invoices = draft.vendorId ? sameCurrency(creditableInvoices(m, draft.vendorId)) : [];
  const returns = draft.vendorId ? sameCurrency(creditableReturns(m.returns, draft.vendorId)) : [];

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await saveMemoRemarks(draft as ApCreditMemo, { remarks: draft.remarks, paymentBlock: draft.paymentBlock, paymentOrderRun: draft.paymentOrderRun });
        navigate(MEMO_LIST_PATH, { state: { notice: `A/P credit memo ${memoNumber(saved)} saved.` } });
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
        const saved = await saveMemoDraft(draft);
        navigate(MEMO_LIST_PATH, { state: { notice: `Draft saved — ${saved.vendorName}.` } });
        return;
      }
      const balances: InvoiceBalances = new Map(
        baseInvoiceIds(draft).flatMap((invoiceId) => {
          const inv = m.invoices.find((i) => i.id === invoiceId);
          if (!inv || inv.status !== 'Open') return [];
          const b = balanceOf(inv);
          return [[invoiceId, { docNo: apNumber(inv), balance: b.balanceDue, total: b.total }]];
        }),
      );
      const saved = await addCreditMemo(draft, fx, credit, balances);
      await postDocumentEntry({ origin: 'PC', originNo: saved.docNum, originId: saved.id, postingDate: saved.postingDate, dueDate: saved.dueDate, remarks: saved.journalRemark, partnerId: saved.vendorId, controlAccount: saved.controlAccount, lines: journal });
      const applied = saved.applications.map((a) => `${a.docNo} (${code} ${formatAmount(a.amount)})`).join(', ');
      navigate(MEMO_LIST_PATH, {
        state: {
          notice: `A/P credit memo ${memoNumber(saved)} added — ${code} ${formatAmount(credit)} credit${applied ? `, applied to ${applied}` : ''}${saved.status === 'Open' ? `; ${code} ${formatAmount(credit - saved.appliedAmount)} left to apply` : ''}.`,
        },
      });
    } catch (err) {
      if (!(err instanceof MemoPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as ApCreditMemo;
  const bases = [...new Map(draft.lines.filter((l) => l.baseType).map((l) => [l.baseId, l])).values()];
  const openInvoices = draft.vendorId ? m.invoices.filter((i) => i.vendorId === draft.vendorId && i.status === 'Open' && i.currency === code).map((inv) => ({ inv, ...balanceOf(inv) })).filter((x) => x.balanceDue > 0) : [];
  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Open' && openBalance > 0 && openInvoices.length ? [{ label: 'Apply credit to an invoice', icon: 'request_quote', onSelect: () => setApplying(true) }] : []),
    ...(draft.status === 'Open' || draft.status === 'Closed'
      ? [
          {
            label: 'Cancel credit memo',
            icon: 'cancel',
            onSelect: async () => {
              try {
                const totalsByInvoice = new Map(saved.applications.map((a) => [a.invoiceId, balanceOf(m.invoices.find((i) => i.id === a.invoiceId)!).total]));
                const c = await cancelCreditMemo(saved, totalsByInvoice);
                await reverseDocumentEntry(saved.id);
                navigate(MEMO_LIST_PATH, { state: { notice: `A/P credit memo ${memoNumber(c)} cancelled — the credit is off the invoices it was applied to.` } });
              } catch (err) {
                setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
              }
            },
          },
        ]
      : []),
    ...bases.map((l) => ({
      label: `Open ${l.baseType === 'GRET' ? 'goods return' : 'A/P invoice'} ${l.baseDocNo}`,
      icon: l.baseType === 'GRET' ? 'assignment_return' : 'request_quote',
      onSelect: () => navigate(l.baseType === 'GRET' ? `/purchasing/returns-and-debits/returns/${l.baseId}` : `/purchasing/bills/${l.baseId}`),
    })),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const title = isNew ? 'New A/P credit memo' : added ? memoNumber(draft) : 'Draft A/P credit memo';
  const addressOptions = vendorAddressOptions(vendor);
  const withCurrent = (opts: { value: string; label: string }[], v: string) => (!v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v.split('\n')[0] }, ...opts]);

  const returnGoodsColumn: TableColumn<MemoLine> = {
    key: 'returnGoods',
    header: 'Return goods',
    cell: (l) => {
      const item = m.items.find((i) => i.id === l.itemId);
      if (!item) return null;
      if (l.baseType === 'GRET') return <Text variant="small" tone="muted">Returned on {l.baseDocNo}</Text>;
      if (!item.inventoryItem) return <Text variant="small" tone="muted">Not stocked</Text>;
      return (
        <Checkbox
          aria-label={`Return the goods on ${l.itemNo}`}
          checked={l.returnGoods}
          disabled={added}
          onChange={(e) => update({ lines: draft.lines.map((x) => (x.id === l.id ? { ...x, returnGoods: e.currentTarget.checked } : x)) })}
        >
          {l.returnGoods ? 'Send back' : 'Price only'}
        </Checkbox>
      );
    },
  };

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="receipt"
            title={title}
            subcopy={draft.vendorName ? `${draft.vendorCode} · ${draft.vendorName}${draft.vendorRef ? ` · ${draft.vendorRef}` : ''}` : "Record a vendor's credit note."}
            leading={
              isNew ? undefined : (
                <>
                  <IconButton type="button" label="Next" intent="default" variant="solid" size="extra-large" disabled={!nextId} onClick={() => navigate(`${MEMO_LIST_PATH}/${nextId}`)}>
                    {panelHeaderIcons.arrowDownward}
                  </IconButton>
                  <IconButton type="button" label="Previous" intent="default" variant="solid" size="extra-large" disabled={!prevId} onClick={() => navigate(`${MEMO_LIST_PATH}/${prevId}`)}>
                    {panelHeaderIcons.arrowUpward}
                  </IconButton>
                </>
              )
            }
            tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
            status={isNew ? undefined : <Badge size="small" intent={MEMO_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <>
                <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(MEMO_LIST_PATH)}>
                  {added ? 'Back' : 'Cancel'}
                </Button>
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                  {saving ? 'Saving…' : added ? 'Save' : 'Add'}
                </Button>
              </>
            }
          />
          {page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <DocumentFlow kind="APCM" id={draft.id} notes="Everything linked to this credit memo: the invoices and goods returns it credits, and back through them to receipts and purchase orders." />
            </Panel.Body>
          ) : page !== 'details' ? (
            <Panel.Body>
              <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
              {added ? (
                <Alert intent="default" variant="outline" title={draft.status === 'Open' ? `${code} ${formatAmount(openBalance)} of credit left to apply` : `This credit memo is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Open'
                    ? 'Apply it to another open invoice of this vendor with You can also › Apply credit to an invoice. Only remarks, the payment block and the payment run flag can change.'
                    : 'Only remarks can change.'}
                </Alert>
              ) : null}

              <fieldset disabled={added} className="contents">
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <Section icon="storefront" title="Vendor">
                    <Fields>
                      <div className="md:col-span-2">
                        {vendor && (added || ctx.based) ? (
                          <ReadOnly label="Vendor" value={draft.vendorName} description={`${draft.vendorCode} · ${code}`} />
                        ) : (
                          <FormField label="Vendor" required error={errors.vendorId}>
                            {(p) => (
                              <Combobox
                                {...p}
                                placeholder="Search vendors"
                                options={m.vendors.filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId).map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, description: v.currency, text: `${v.code} ${v.name}` }))}
                                value={draft.vendorId || null}
                                onValueChange={pickVendor}
                              />
                            )}
                          </FormField>
                        )}
                      </div>
                      {h.lookup('contactId', 'Contact person', [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))], { disabled: !vendor })}
                      {h.text('vendorRef', 'Vendor ref. no.', { hint: "The vendor's credit note no." })}
                      <FormField label="Currency" required error={errors.currency} className="md:col-span-2" tooltip={ctx.based ? `Locked to the base documents' currency; credited at ${baseInvoice ? `invoice ${apNumber(baseInvoice)}'s rate (${baseInvoice.fxRate})` : 'the posting date rate'}.` : undefined}>
                        {(p) => <Select {...p} disabled={added || ctx.based} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={code} onValueChange={(currency) => update({ currency })} />}
                      </FormField>
                    </Fields>
                  </Section>
                  <Section icon="tag" title="Document">
                    <Fields>
                      <FormField label="No.">
                        {(p) => (
                          <div className="flex gap-1">
                            <Select aria-label="Series" className="w-40" disabled={added} options={MEMO_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                            <TextField {...p} className="flex-1" readOnly placeholder="Next number" value={draft.docNum ? String(draft.docNum) : ''} />
                          </div>
                        )}
                      </FormField>
                      <ReadOnly label="Status" value={<Badge intent={MEMO_STATUS_INTENT[isNew ? 'Draft' : draft.status]}>{isNew ? 'New' : draft.status}</Badge>} hint="Open while credit is left to apply; Closed once all of it is applied." error={errors.status} />
                      {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
                      {h.date('dueDate', 'Due date', { hint: 'When the credit is due, from the payment terms.' })}
                      {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate, hint: "The date on the vendor's credit note." })}
                      <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
                    </Fields>
                  </Section>
                </div>

                <ReturnLines<MemoLine>
                  lines={draft.lines}
                  onChange={(lines) => update({ lines })}
                  errors={errors}
                  m={m}
                  ctx={ctx}
                  currency={code}
                  postingDate={draft.postingDate}
                  vendorId={draft.vendorId}
                  title="Contents"
                  description={`What the vendor credits, in ${code}. Lines from an invoice send the goods back or adjust the price only; lines from a goods return just credit it.`}
                  empty={draft.vendorId ? 'Copy from an A/P invoice or a goods return, or add lines.' : 'Pick a vendor first.'}
                  newLine={() => newMemoLine()}
                  sendsStock={(l) => sendsStock(l, m.items)}
                  openHint={(l) => {
                    if (l.baseType === 'APINV') {
                      const il = m.invoices.find((i) => i.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId);
                      return il ? `${il.quantity} billed · ${returnableQty(il)} left to return` : undefined;
                    }
                    if (l.baseType === 'GRET') {
                      const r = m.returns.find((x) => x.id === l.baseId);
                      const rl = r?.lines.find((x) => x.id === l.baseLineId);
                      return r && rl ? `${returnOpenQty(rl, r)} of ${rl.quantity} left to credit on the return` : undefined;
                    }
                    return undefined;
                  }}
                  onCopy={() => setCopying(true)}
                  canCopy={invoices.length + returns.length > 0}
                  extraColumns={[returnGoodsColumn]}
                />

                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <Section icon="local_shipping" title="Logistics">
                    <Fields>
                      {h.lookup('shipTo', 'Ship to', withCurrent(addressOptions, draft.shipTo), { hint: "The vendor's return address, for goods sent back.", disabled: !vendor })}
                      {h.lookup('payTo', 'Pay to', withCurrent(addressOptions, draft.payTo), { disabled: !vendor })}
                      {h.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...m.inv.shipping.filter((s) => s.active || s.id === draft.shippingType).map((s) => ({ value: s.id, label: s.name }))])}
                    </Fields>
                  </Section>
                  <Section icon="account_balance" title="Accounting">
                    <Fields>
                      {h.text('journalRemark', 'Journal remark', { hint: 'Defaults to “A/P Credit Memo – vendor code”.' })}
                      <AccountField label="Control account" role="payable" value={draft.controlAccount} onChange={(controlAccount) => update({ controlAccount })} accounts={m.accounts} required error={errors.controlAccount} disabled={added} hint="The vendor's payable account by default." />
                      {h.master('paymentTermId', 'Payment terms', paymentTermDef)}
                      {h.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
                      <ReadOnly label="Installments" value={String(draft.installments)} />
                      {h.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
                      {h.master('projectId', 'BP project', projectDef, { clearable: true })}
                      {h.choose('indicator', 'Indicator', asOptions(INDICATORS))}
                      <ReadOnly label="Federal tax ID" value={vendor?.tin || '—'} hint="The vendor's TIN." />
                      <ReadOnly label="Order number" value={draft.orderNumber || '—'} />
                      <FormField label="Consolidating BP">
                        {(p) => (
                          <Combobox {...p} placeholder="— None —" options={m.vendors.filter((v) => v.id !== draft.vendorId).map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))} value={draft.consolidatingBpId || null} onValueChange={(consolidatingBpId) => update({ consolidatingBpId: consolidatingBpId ?? '' })} />
                        )}
                      </FormField>
                    </Fields>
                    <Flags>{h.check('maxCashDiscount', 'Max. cash discount')}</Flags>
                  </Section>
                </div>
                <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={added} description="Other documents this credit memo refers to, e.g. the vendor's credit note." />
              </fieldset>

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <Section icon="functions" title="Totals">
                  <Fields cols={1}>
                    <fieldset disabled={added} className="contents">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {h.master('buyerId', 'Buyer', salesEmployeeDef)}
                        {h.master('ownerId', 'Owner', salesEmployeeDef)}
                      </div>
                      <List.Group divider>
                        <TotalRow label="Total before discount" value={totals.beforeDiscount} code={code} />
                        <TotalRow label="Discount" value={totals.discount ? -totals.discount : 0} code={code} input={<TextField aria-label="Document discount %" type="number" min={0} className="w-24" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />} />
                        <TotalRow label="Total down payment" value={-draft.downPayment} code={code} />
                        <TotalRow label="Tax" value={totals.tax} code={code} />
                        {totals.reverseCharge ? <TotalNote>VAT of {code} {formatAmount(totals.reverseCharge)} wasn't paid to the vendor (reverse charge or import VAT).</TotalNote> : null}
                        <TotalRow label="Total credit" value={totals.total} code={code} strong />
                        {withholding.filter((w) => w.deducted).map((w) => (
                          <TotalRow key={w.atc} label={`${WITHHELD_LABEL[w.kind] ?? 'Tax'} reversed — ${w.atc} (${w.rate}%)`} value={-w.amount} code={code} />
                        ))}
                        <TotalRow label="Net credit" value={credit} code={code} strong />
                        <TotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
                        <TotalRow label="Open balance" value={openBalance} code={code} strong />
                      </List.Group>
                    </fieldset>
                    {draft.applications.length ? (
                      <Text variant="small" tone="muted">
                        Applied to {draft.applications.map((a) => `A/P invoice ${a.docNo} (${code} ${formatAmount(a.amount)}, ${formatDate(a.date)})`).join('; ')}.
                      </Text>
                    ) : null}
                    <Flags>
                      {h.check('paymentBlock', 'Payment block')}
                      {h.check('paymentOrderRun', 'Include in payment runs (Payment Order Run)')}
                    </Flags>
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
                    In PHP{code === 'PHP' ? '' : ` at ${fx}`}. Dr the vendor (what they owe back) and the withholding reversed / Cr Inventory for goods sent back (or price adjustments on stock), Goods Received Not Invoiced for lines from a goods return, and input VAT.
                  </Text>
                </Section>
              </div>
            </Panel.Body>
          )}
        </Panel>
      </Form>
      {copying
        ? createPortal(
            <CopyPanel
              sources={[
                {
                  key: 'APINV' as const,
                  label: 'A/P invoices',
                  totalHeader: 'Billed',
                  qtyHeader: 'Credit',
                  hint: 'Credit billed lines: tick Return goods on a line to send the goods back, or leave it as a price adjustment.',
                  docs: invoices.map((inv: ApInvoice) => ({
                    id: inv.id,
                    label: `A/P invoice ${apNumber(inv)}`,
                    description: `Billed ${formatDate(inv.postingDate)} · ${inv.currency}${inv.vendorRef ? ` · ${inv.vendorRef}` : ''} · ${inv.status}`,
                    lines: inv.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: l.quantity })),
                  })),
                },
                {
                  key: 'GRET' as const,
                  label: 'Goods returns',
                  totalHeader: 'Returned',
                  qtyHeader: 'Credit',
                  hint: 'Credit goods already sent back on a return. No stock moves — the return took it out.',
                  docs: returns.map((r: GoodsReturn) => ({
                    id: r.id,
                    label: `Return ${returnNumber(r)}`,
                    description: `Returned ${formatDate(r.postingDate)} · ${r.currency}${r.vendorRef ? ` · RMA ${r.vendorRef}` : ''}`,
                    lines: r.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: returnOpenQty(l, r) })),
                  })),
                },
              ]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(type, docId, picks) => {
                if (type === 'APINV') {
                  const inv = invoices.find((i) => i.id === docId)!;
                  setDraft(withBase(draft, inv, memoFromInvoice(inv, picks, m.items)));
                } else {
                  const r = returns.find((x) => x.id === docId)!;
                  setDraft(withBase(draft, r, memoFromReturn(r, picks, m.items)));
                }
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
      {applying
        ? createPortal(
            <ApplyCreditPanel
              code={code}
              open={openBalance}
              invoices={openInvoices.map((x) => ({ id: x.inv.id, docNo: apNumber(x.inv), dueDate: x.inv.dueDate, balance: x.balanceDue, total: x.total }))}
              onCancel={() => setApplying(false)}
              onDone={async (picks) => {
                const c = await applyCredit(saved, credit, picks);
                setApplying(false);
                navigate(MEMO_LIST_PATH, { state: { notice: `Applied ${code} ${formatAmount(picks.reduce((n, p) => n + p.amount, 0))} of credit memo ${memoNumber(c)}.` } });
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/** Copy To › A/P Invoice: put credit left on the memo against the vendor's open invoices, oldest due first. */
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
  // Proposed: fill the oldest invoices first until the credit runs out.
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    let left = open;
    return Object.fromEntries(sorted.map((i) => {
      const a = round2(Math.min(left, i.balance));
      left = round2(left - a);
      return [i.id, a];
    }));
  });
  const total = round2(Object.values(amounts).reduce((n, a) => n + a, 0));
  const columns: TableColumn<(typeof sorted)[number]>[] = [
    { key: 'docNo', header: 'A/P invoice', cell: (i) => i.docNo },
    { key: 'dueDate', header: 'Due', cell: (i) => formatDate(i.dueDate) },
    { key: 'balance', header: 'Balance due', cell: (i) => formatAmount(i.balance) },
    {
      key: 'amount',
      header: `Apply (${code})`,
      cell: (i) => (
        <TextField aria-label={`Apply to ${i.docNo}`} type="number" min={0} className="w-36" value={String(amounts[i.id] ?? 0)} onChange={(e) => setAmounts({ ...amounts, [i.id]: Math.min(i.balance, Number(e.currentTarget.value) || 0) })} />
      ),
    },
  ];
  return (
    <EditPanel icon="request_quote" title="Apply credit to invoices" onCancel={onCancel} onDone={() => (total > 0 && total <= open + 0.005 ? onDone(sorted.filter((i) => amounts[i.id] > 0).map((i) => ({ invoiceId: i.id, docNo: i.docNo, amount: amounts[i.id], total: i.total }))) : onCancel())}>
      <Section icon="savings" title={`${code} ${formatAmount(open)} of credit to apply`}>
        <Text variant="small" tone={total > open + 0.005 ? 'danger' : 'muted'}>
          Applying {code} {formatAmount(total)}{total > open + 0.005 ? ' — more than the credit left.' : '. Each invoice’s balance due drops by what’s applied.'}
        </Text>
      </Section>
      <DataTable icon="receipt_long" title="Open A/P invoices" rows={sorted} getRowId={(i) => i.id} columns={columns} unsortable={columns.map((c) => c.key)} noPagination empty={<Text variant="small" tone="muted">No open invoices in {code}.</Text>} />
    </EditPanel>
  );
}

function vendorDefaults(v: Partner | undefined, d: Draft): Partial<Draft> {
  if (!v) return {};
  const ship = v.addresses.find((a) => a.id === v.defaultShipToId) ?? v.addresses[0];
  const bill = v.addresses.find((a) => a.id === v.defaultBillToId) ?? v.addresses[0];
  return {
    vendorId: v.id,
    vendorCode: v.code,
    vendorName: v.name,
    contactId: v.defaultContactId,
    currency: v.currency === ALL_CURRENCIES ? 'PHP' : v.currency,
    paymentTermId: v.vendorPaymentTermId,
    paymentMethod: v.defaultPaymentMethod,
    dueDate: dueDateFor(d.postingDate, v.vendorPaymentTermId),
    projectId: v.projectId,
    shippingType: v.shippingType,
    journalRemark: `A/P Credit Memo – ${v.code}`,
    shipTo: ship ? formatAddress(ship, v.name) : '',
    payTo: bill ? formatAddress(bill, v.name) : '',
    controlAccount: v.payableAccount || '2010',
    paymentBlock: v.paymentBlock,
  };
}

function withBase(d: Draft, base: ApInvoice | GoodsReturn, lines: MemoLine[]): Draft {
  const first = !d.lines.some((l) => l.baseType);
  const allLines = [...d.lines.filter((l) => l.itemId), ...lines];
  return {
    ...d,
    ...(first
      ? {
          currency: base.currency,
          contactId: base.contactId || d.contactId,
          paymentTermId: base.paymentTermId || d.paymentTermId,
          paymentMethod: base.paymentMethod || d.paymentMethod,
          dueDate: dueDateFor(d.postingDate, base.paymentTermId || d.paymentTermId),
          projectId: base.projectId || d.projectId,
          discountPct: base.discountPct,
          buyerId: base.buyerId || d.buyerId,
          controlAccount: 'controlAccount' in base && base.controlAccount ? base.controlAccount : d.controlAccount,
        }
      : {}),
    orderNumber: [...new Set([...d.orderNumber.split(', ').filter(Boolean), base.orderNumber].filter(Boolean))].join(', '),
    lines: allLines,
  };
}
