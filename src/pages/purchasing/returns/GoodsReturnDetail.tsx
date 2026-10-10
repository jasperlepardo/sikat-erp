import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
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
} from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { StatusField } from '../../../components/form/StatusField';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../mocks/address';
import type { ApInvoice } from '../../../mocks/apInvoices';
import { accountText } from '../../../mocks/chartOfAccounts';
import { CURRENT_USER_ID } from '../../../mocks/common';
import type { GoodsReceipt } from '../../../mocks/goodsReceipts';
import { RETURN_SERIES, RETURN_STATUSES, blankGoodsReturn, needsCredit, newReturnLine, type GoodsReturn, type ReturnLine, type ReturnStatus } from '../../../mocks/goodsReturns';
import { PAYMENT_METHODS } from '../../../mocks/masters';
import { contactName, type Partner } from '../../../mocks/partners';
import { INDICATORS } from '../../../mocks/purchaseOrders';
import { apNumber, listApInvoices, returnableQty } from '../../../services/apInvoices';
import { transferBlock } from '../../../services/binLocations';
import { loadCurrentCompany } from '../../../services/companies';
import { formatDate, todayISO } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { grNumber, grOpenQty, listGoodsReceipts } from '../../../services/goodsReceipts';
import {
  ReturnPostError,
  addGoodsReturn,
  cancelGoodsReturn,
  getGoodsReturn,
  listGoodsReturns,
  returnJournal,
  returnNumber,
  returnOpenQty,
  returnTotals,
  saveReturnDraft,
  saveReturnRemarks,
} from '../../../services/goodsReturns';
import { loadInventoryMasters } from '../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../services/items';
import { postDocumentEntry, reverseDocumentEntry } from '../../../services/journalEntries';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../services/masterData';
import { listPartnersByRole } from '../../../services/partners';
import { dueDateFor, listPurchaseOrders } from '../../../services/purchaseOrders';
import { paymentTermDef, projectDef, salesEmployeeDef } from '../../settings/masterDefs';
import { ReferencesTable } from '../orders/detail/AccountingTab';
import { TotalNote, TotalRow } from '../orders/detail/PurchaseOrderDetail';
import { buildGrContext } from '../receipts/detail/types';
import { CopyPanel } from '../shared/CopyPanel';
import { DocumentFlow } from '../shared/DocumentFlow';
import { ReturnLines } from './ReturnLines';
import { MEMO_LIST_PATH, RETURN_LIST_PATH, returnFromInvoice, returnFromReceipt, type RetContext, type RetMasters } from './types';
import { useDocTitle } from '../../../services/useDocTitle';

type Draft = Omit<GoodsReturn, 'id'> & { id?: string };
type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

export const RETURN_STATUS_INTENT: Record<ReturnStatus, 'default' | 'primary' | 'success' | 'danger'> = {
  Draft: 'default',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

const ALL_CURRENCIES = 'All currencies';
const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

/** Loads everything the return and credit memo forms read. */
export async function loadRetMasters(): Promise<RetMasters> {
  const [vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, orders, receipts, invoices, returns] = await Promise.all([
    listPartnersByRole('vendor'),
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
    listPurchaseOrders(),
    listGoodsReceipts(),
    listApInvoices(),
    listGoodsReturns(),
  ]);
  return { vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, orders, receipts, invoices, returns, accounts: inv.accounts };
}

/** The vendor's addresses as pick options, keyed by their formatted text. */
export const vendorAddressOptions = (v: Partner | undefined) =>
  (v?.addresses ?? []).map((a) => ({ value: formatAddress(a, v!.name), label: `${a.label || 'Address'} · ${a.city || a.countryCode}` }));

function validate(d: Draft, ctx: RetContext, m: RetMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.shipTo, 'logistics', 'shipTo', "Ship to is required — the vendor's return address.");
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a goods receipt or A/P invoice.');
  const byBase = new Map<string, number>();
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.baseType || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    if (item.inventoryItem) {
      need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse the goods leave from.`);
      const wh = m.inv.warehouses.find((w) => w.code === l.warehouse);
      if (wh?.binEnabled && l.binId) {
        const block = transferBlock(m.inv.bins.find((b) => b.warehouse === l.warehouse && b.id === l.binId), item, l.uomCode, 'out');
        need(!block, 'contents', `line:${l.id}:bin`, `${n}: ${block}`);
      }
      const have = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
      need(have >= l.quantity * l.itemsPerUnit, 'contents', `line:${l.id}:quantity`, `${n}: ${l.warehouse} has ${have} ${item.inventoryUom} of ${item.itemNo}.`);
    }
    if (l.baseLineId) byBase.set(l.baseLineId, (byBase.get(l.baseLineId) ?? 0) + l.quantity);
  }
  for (const [baseLineId, qty] of byBase) {
    const l = d.lines.find((x) => x.baseLineId === baseLineId)!;
    let open = 0;
    if (l.baseType === 'GRPO') {
      const gr = m.receipts.find((r) => r.id === l.baseId);
      const gl = gr?.lines.find((x) => x.id === baseLineId);
      open = gr && gl ? grOpenQty(gl, gr) : 0;
    } else {
      const il = m.invoices.find((i) => i.id === l.baseId)?.lines.find((x) => x.id === baseLineId);
      open = il ? returnableQty(il) : 0;
    }
    need(qty <= open, 'contents', `line:${l.id}:quantity`, `${l.itemNo}: returning ${qty} ${l.uomCode}, but ${l.baseDocNo} has only ${open} left to return.`);
  }
  return problems;
}

export function GoodsReturnDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <GoodsReturnForm key={id === 'new' ? location.key : id} />;
}

function GoodsReturnForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const state = useLocation().state as { fromReceipt?: string; fromInvoice?: string } | null;

  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? blankGoodsReturn(todayISO(), CURRENT_USER_ID) : undefined);
  const [m, setM] = useState<RetMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    loadRetMasters().then((masters) => {
      setM(masters);
      // Copy to › Goods Return from a receipt or invoice: every line with quantity left to return.
      const gr = state?.fromReceipt ? masters.receipts.find((r) => r.id === state.fromReceipt) : undefined;
      const inv = state?.fromInvoice ? masters.invoices.find((i) => i.id === state.fromInvoice) : undefined;
      if (isNew && (gr || inv)) {
        const vendor = masters.vendors.find((v) => v.id === (gr ?? inv)!.vendorId);
        const lines = gr
          ? returnFromReceipt(gr, gr.lines.map((l) => ({ lineId: l.id, qty: grOpenQty(l, gr) })).filter((p) => p.qty > 0), masters.items)
          : returnFromInvoice(inv!, inv!.lines.map((l) => ({ lineId: l.id, qty: returnableQty(l) })).filter((p) => p.qty > 0 && masters.items.find((i) => i.id === inv!.lines.find((x) => x.id === p.lineId)?.itemId)?.inventoryItem));
        setDraft((d) => d && withBase({ ...d, ...vendorDefaults(vendor, d), lines: [] }, gr ?? inv!, lines));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getGoodsReturn(id).then((r) => !cancelled && setDraft(r ?? null));
    listGoodsReturns().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((r) => r.docNum ? returnNumber(r) : r.id)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New goods return' : returnNumber(draft)) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading goods return…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="assignment_return" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="Goods return not found" />
        <Panel.Body>
          <Button onClick={() => navigate(RETURN_LIST_PATH)}>Back to returns</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const ctx = buildGrContext(draft, m);
  const { vendor } = ctx;
  const added = draft.status !== 'Draft';
  const at = draft.id ? siblings.indexOf(draft.docNum ? returnNumber(draft as GoodsReturn) : draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totals = returnTotals(draft, ctx.rateOf, ctx.isReverseCharge);
  // Lines entered by hand go out at the item's cost; the preview shows that.
  const costed = { ...draft, lines: draft.lines.map((l) => (l.unitCostLc ? l : { ...l, unitCostLc: m.items.find((i) => i.id === l.itemId)?.itemCost ?? 0 })) };
  const journal = returnJournal(costed, m.items, m.inv.groups);
  const code = draft.currency;

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

  const receipts = draft.vendorId ? m.receipts.filter((gr) => gr.vendorId === draft.vendorId && gr.status === 'Open' && gr.lines.some((l) => grOpenQty(l, gr) > 0)) : [];
  const invoices = draft.vendorId ? m.invoices.filter((inv) => inv.vendorId === draft.vendorId && inv.status !== 'Draft' && inv.status !== 'Cancelled' && inv.lines.some((l) => returnableQty(l) > 0)) : [];
  const sameCurrency = <T extends { currency: string }>(docs: T[]) => (ctx.based ? docs.filter((d) => d.currency === code) : docs);

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await saveReturnRemarks(draft as GoodsReturn, { remarks: draft.remarks, attachments: draft.attachments });
        navigate(RETURN_LIST_PATH, { state: { notice: `Goods return ${returnNumber(saved)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const found = validate(draft, ctx, m, asDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      if (asDraft) {
        const saved = await saveReturnDraft(draft);
        navigate(RETURN_LIST_PATH, { state: { notice: `Draft saved — ${saved.vendorName}.` } });
        return;
      }
      const saved = await addGoodsReturn(draft);
      await postDocumentEntry({ origin: 'RD', originNo: saved.docNum, originId: saved.id, postingDate: saved.postingDate, remarks: saved.journalRemark, lines: returnJournal(saved, m.items, m.inv.groups) });
      navigate(RETURN_LIST_PATH, {
        state: {
          notice: `Goods return ${returnNumber(saved)} added — the stock is out${saved.status === 'Open' ? ', and the vendor owes a credit memo for it' : ''}.`,
        },
      });
    } catch (err) {
      if (!(err instanceof ReturnPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as GoodsReturn;
  const bases = [...new Map(draft.lines.filter((l) => l.baseType).map((l) => [l.baseId, l])).values()];
  const creditable = draft.status === 'Open' && draft.lines.some((l) => returnOpenQty(l, draft) > 0);
  const cancelIt = async () => {
    try {
      const r = await cancelGoodsReturn(saved);
      await reverseDocumentEntry(saved.id);
      navigate(RETURN_LIST_PATH, { state: { notice: `Goods return ${returnNumber(r)} cancelled — the stock is back in.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };
  // What picking each status in the Status dropdown does; the others can't be reached from here.
  const statusMoves: Partial<Record<ReturnStatus, () => void>> = draft.status === 'Draft' ? { Open: () => submit(null) } : draft.status === 'Open' || draft.status === 'Closed' ? { Cancelled: cancelIt } : {};

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(creditable ? [{ label: 'Copy to A/P credit memo', icon: 'receipt', onSelect: () => navigate(`${MEMO_LIST_PATH}/new`, { state: { fromReturn: saved.id } }) }] : []),
    ...(draft.status === 'Open' || draft.status === 'Closed'
      ? [
          {
            label: 'Cancel goods return',
            icon: 'cancel',
            onSelect: cancelIt,
          },
        ]
      : []),
    ...bases.map((l) => ({
      label: `Open ${l.baseType === 'GRPO' ? 'receipt' : 'A/P invoice'} ${l.baseDocNo}`,
      icon: l.baseType === 'GRPO' ? 'inventory' : 'request_quote',
      onSelect: () => navigate(l.baseType === 'GRPO' ? `/purchasing/goods-receipts/${l.baseId}` : `/purchasing/bills/${l.baseId}`),
    })),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const title = isNew ? 'New goods return' : added ? returnNumber(draft) : 'Draft goods return';
  const addressOptions = vendorAddressOptions(vendor);
  const withCurrent = (opts: { value: string; label: string }[], v: string) => (!v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v.split('\n')[0] }, ...opts]);

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="assignment_return"
            iconIntent="default"
            iconShape="rounded"
            iconSize={32} iconVariant="outline"
            title={title}
            trailing={
              isNew ? undefined : (
                <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
                  <IconButton type="button" label="Previous" size="small"
                  shape="pill" disabled={!prevId} onClick={() => navigate(`${RETURN_LIST_PATH}/${prevId}`)}>
                    {panelHeaderIcons.arrowUpward}
                  </IconButton>
                  <IconButton type="button" label="Next" size="small"
                  shape="pill" disabled={!nextId} onClick={() => navigate(`${RETURN_LIST_PATH}/${nextId}`)}>
                    {panelHeaderIcons.arrowDownward}
                  </IconButton>
                </ButtonGroup>
              )
            }
            tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
            status={isNew ? undefined : <Badge size="small" intent={RETURN_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <>
                <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(RETURN_LIST_PATH)}>
                  {added ? 'Back' : 'Cancel'}
                </Button>
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                  {saving ? 'Saving…' : added ? 'Save' : 'Add'}
                </Button>
              </>
            }
          />
          {page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <DocumentFlow kind="GRET" id={draft.id} notes="Everything linked to this return: the receipts and invoices it sent goods back from (and their own bases), and the credit memos that credited it." />
            </Panel.Body>
          ) : page !== 'details' ? (
            <Panel.Body>
              <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
              {added ? (
                <Alert intent="default" variant="outline" title={draft.status === 'Open' ? 'Waiting for the vendor’s credit' : `This goods return is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Open'
                    ? 'The stock is out. These goods were already billed, so the vendor owes a credit: copy the return to an A/P credit memo. Only remarks and attachments can change.'
                    : 'Only remarks and attachments can change.'}
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
                          <FormField label="Vendor" required error={errors.vendorId} tooltip="The vendor the goods go back to.">
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
                      {h.text('vendorRef', 'Vendor ref. no.', { hint: "The vendor's return authorization (RMA) no." })}
                      <FormField label="Currency" required error={errors.currency} className="md:col-span-2" tooltip={ctx.based ? 'Locked to the currency of the documents the lines came from.' : `Defaults to the vendor's currency.`}>
                        {(p) => <Select {...p} disabled={added || ctx.based} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={code} onValueChange={(currency) => update({ currency })} />}
                      </FormField>
                    </Fields>
                  </Section>
                  <Section icon="tag" title="Document">
                    <Fields>
                      <FormField label="No.">
                        {() => (
                          <div className="flex gap-1">
                            <Select aria-label="Series" className="w-40" disabled={added} options={RETURN_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                            <span className="flex-1 self-center text-sm">{draft.docNum ? returnNumber(draft) : <span className="text-(--color-text-placeholder)">Next number</span>}</span>
                          </div>
                        )}
                      </FormField>
                      <StatusField statuses={RETURN_STATUSES} intents={RETURN_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Open while billed goods wait for a credit memo; Closed once credited (or straight away for unbilled goods)." error={errors.status} />
                      {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When the stock leaves.' })}
                      {h.date('dueDate', 'Due date', { hint: 'When the vendor’s credit is due, from the payment terms.' })}
                      {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
                      <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
                    </Fields>
                  </Section>
                </div>

                <ReturnLines<ReturnLine>
                  lines={draft.lines}
                  onChange={(lines) => update({ lines })}
                  errors={errors}
                  m={m}
                  ctx={ctx}
                  currency={code}
                  postingDate={draft.postingDate}
                  vendorId={draft.vendorId}
                  title="Contents"
                  description={`What goes back, in the line's unit. Stock leaves at the cost it came in at; prices are in ${code} for the vendor's credit.`}
                  empty={draft.vendorId ? 'Copy from a goods receipt (goods not yet billed) or an A/P invoice (goods already billed), or add lines.' : 'Pick a vendor first.'}
                  newLine={() => newReturnLine()}
                  sendsStock={(l) => Boolean(m.items.find((i) => i.id === l.itemId)?.inventoryItem)}
                  openHint={(l) => {
                    if (l.baseType === 'GRPO') {
                      const gr = m.receipts.find((r) => r.id === l.baseId);
                      const gl = gr?.lines.find((x) => x.id === l.baseLineId);
                      return gr && gl ? `${grOpenQty(gl, gr)} of ${gl.quantity} left on the receipt` : undefined;
                    }
                    if (l.baseType === 'APINV') {
                      const il = m.invoices.find((i) => i.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId);
                      return il ? `${returnableQty(il)} of ${il.quantity} billed left to return` : undefined;
                    }
                    return needsCredit(l) && added ? `${l.creditedQty} credited` : undefined;
                  }}
                  onCopy={() => setCopying(true)}
                  canCopy={sameCurrency(receipts).length + sameCurrency(invoices).length > 0}
                />

                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <Section icon="local_shipping" title="Logistics">
                    <Fields>
                      {h.lookup('shipTo', 'Ship to', withCurrent(addressOptions, draft.shipTo), { required: true, error: errors.shipTo, hint: "The vendor's return address.", disabled: !vendor })}
                      {h.lookup('payTo', 'Pay to', withCurrent(addressOptions, draft.payTo), { disabled: !vendor })}
                      {h.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...m.inv.shipping.filter((s) => s.active || s.id === draft.shippingType).map((s) => ({ value: s.id, label: s.name }))])}
                    </Fields>
                  </Section>
                  <Section icon="account_balance" title="Accounting">
                    <Fields>
                      {h.text('journalRemark', 'Journal remark', { hint: 'Defaults to “Goods Returns – vendor code”.' })}
                      {h.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the vendor or the base document.' })}
                      {h.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
                      {h.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
                      {h.master('projectId', 'BP project', projectDef, { clearable: true })}
                      {h.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...asOptions(INDICATORS)])}
                      <ReadOnly label="Federal tax ID" value={vendor?.tin || '—'} hint="The vendor's TIN." />
                      <ReadOnly label="Order number" value={draft.orderNumber || '—'} hint="The PO behind the lines." />
                      <FormField label="Consolidating BP" tooltip="Settle this return's credit through another partner.">
                        {(p) => (
                          <Combobox {...p} placeholder="— None —" options={m.vendors.filter((v) => v.id !== draft.vendorId).map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))} value={draft.consolidatingBpId || null} onValueChange={(consolidatingBpId) => update({ consolidatingBpId: consolidatingBpId ?? '' })} />
                        )}
                      </FormField>
                    </Fields>
                  </Section>
                </div>
                <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={added} description="Other documents this return refers to, e.g. the vendor's RMA or the original receipt." />
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
                        <TotalRow label="Tax" value={totals.tax} code={code} />
                        {totals.reverseCharge ? <TotalNote>VAT of {code} {formatAmount(totals.reverseCharge)} wasn't paid to the vendor (reverse charge or import VAT).</TotalNote> : null}
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
                    In PHP, at the cost the goods came in at. Goods Received Not Invoiced is cleared by the vendor's A/P credit memo (for billed goods) or by billing less (for goods not yet billed). Total credit is what the vendor owes back, VAT included.
                  </Text>
                </Section>
              </div>
              <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the RMA, photos of the damage, or the courier waybill." />
            </Panel.Body>
          )}
        </Panel>
      </Form>
      {copying
        ? createPortal(
            <CopyPanel
              sources={[
                {
                  key: 'GRPO' as const,
                  label: 'Goods receipts',
                  totalHeader: 'Received',
                  qtyHeader: 'Return',
                  hint: 'Goods not yet billed: returning them lowers what the vendor can bill. Nothing to credit.',
                  docs: sameCurrency(receipts).map((gr: GoodsReceipt) => ({
                    id: gr.id,
                    label: `Receipt ${grNumber(gr)}`,
                    description: `Received ${formatDate(gr.postingDate)} · ${gr.currency}`,
                    lines: gr.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: grOpenQty(l, gr) })),
                  })),
                },
                {
                  key: 'APINV' as const,
                  label: 'A/P invoices',
                  totalHeader: 'Billed',
                  qtyHeader: 'Return',
                  hint: 'Goods already billed: the return waits for the vendor’s credit memo.',
                  docs: sameCurrency(invoices).map((inv: ApInvoice) => ({
                    id: inv.id,
                    label: `A/P invoice ${apNumber(inv)}`,
                    description: `Billed ${formatDate(inv.postingDate)} · ${inv.currency}${inv.vendorRef ? ` · ${inv.vendorRef}` : ''}`,
                    lines: inv.lines.filter((l) => m.items.find((i) => i.id === l.itemId)?.inventoryItem).map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: returnableQty(l) })),
                  })),
                },
              ]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(type, docId, picks) => {
                if (type === 'GRPO') {
                  const gr = receipts.find((r) => r.id === docId)!;
                  setDraft(withBase(draft, gr, returnFromReceipt(gr, picks, m.items)));
                } else {
                  const inv = invoices.find((i) => i.id === docId)!;
                  setDraft(withBase(draft, inv, returnFromInvoice(inv, picks)));
                }
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
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
    journalRemark: `Goods Returns – ${v.code}`,
    shipTo: ship ? formatAddress(ship, v.name) : '',
    payTo: bill ? formatAddress(bill, v.name) : '',
  };
}

/** Add copied lines; the first base document sets the header terms it carried. */
function withBase(d: Draft, base: GoodsReceipt | ApInvoice, lines: ReturnLine[]): Draft {
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
        }
      : {}),
    orderNumber: [...new Set([...d.orderNumber.split(', ').filter(Boolean), base.orderNumber].filter(Boolean))].join(', '),
    lines: allLines,
  };
}
