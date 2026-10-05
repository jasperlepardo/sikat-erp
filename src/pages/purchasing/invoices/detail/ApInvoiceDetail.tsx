import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { postDocumentEntry, reverseDocumentEntry } from '../../../../services/journalEntries';
import {
  Alert,
  Badge,
  Button,
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
import { Fields, Flags, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { AP_SERIES, blankApInvoice, newApLine, type ApInvoice, type ApLine, type ApStatus } from '../../../../mocks/apInvoices';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { CURRENT_USER } from '../../../../mocks/common';
import type { GoodsReceipt } from '../../../../mocks/goodsReceipts';
import type { Item } from '../../../../mocks/items';
import { contactName, type Partner } from '../../../../mocks/partners';
import { PURCHASING_SETTINGS, type PurchaseOrder } from '../../../../mocks/purchaseOrders';
import {
  ApPostError,
  addApInvoice,
  apJournal,
  apNumber,
  apSeriesOf,
  apTotals,
  cancelApInvoice,
  findDuplicateInvoice,
  getApInvoice,
  lineValueLc,
  listApInvoices,
  movesStock,
  netDue,
  receiptValueLc,
  returnableQty,
  saveApDraft,
  saveApRemarks,
} from '../../../../services/apInvoices';
import { transferBlock } from '../../../../services/binLocations';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { grOpenQty, listGoodsReceipts } from '../../../../services/goodsReceipts';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { dueDateFor, listPurchaseOrders, openQty, poWithholding } from '../../../../services/purchaseOrders';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { TotalNote, TotalRow } from '../../orders/detail/PurchaseOrderDetail';
import { proposedTaxCode } from '../../orders/detail/types';
import { GrLogistics } from '../../receipts/detail/GrSections';
import { buildGrContext, defaultPayTo, defaultShipTo, linesFromPo } from '../../receipts/detail/types';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { ApAccounting } from './ApAccounting';
import { ApContents } from './ApContents';
import { linesFromReceipt, orderNumbersOf, toApLine, type ApContext, type ApDraft, type ApMasters } from './types';

export const AP_LIST_PATH = '/purchasing/bills';

type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

export const AP_STATUS_INTENT: Record<ApStatus, 'default' | 'primary' | 'success' | 'danger'> = {
  Draft: 'default',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

/** How each kind of withholding tax reads in the footer. */
const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

const ALL_CURRENCIES = 'All currencies';

/** Required and conditional fields from the A/P invoice field map, checked on Add. Drafts only need a vendor. */
function validate(d: ApDraft, ctx: ApContext, m: ApMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;

  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(d.dueDate, 'header', 'dueDate', 'Due date is required — pick payment terms or enter it.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  need(d.currency !== ALL_CURRENCIES, 'header', 'currency', 'Pick the document currency.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate} — add it in Settings › Accounting & Tax › Exchange rates.`);
  need(d.controlAccount, 'accounting', 'controlAccount', 'Pick the control account.');

  const binOf = (warehouse: string, code: string) => m.inv.bins.find((b) => b.warehouse === warehouse && b.code === code);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a goods receipt or purchase order.');
  const billing = new Map<string, number>();
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.baseType || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
    if (movesStock(l, m.items)) {
      need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse the stock goes into.`);
      const wh = m.inv.warehouses.find((w) => w.code === l.warehouse);
      if (wh?.binEnabled) {
        need(l.bin, 'contents', `line:${l.id}:bin`, `${n}: pick the bin it's put away in, in ${l.warehouse}.`);
        const block = l.bin ? transferBlock(binOf(l.warehouse, l.bin), item, l.uomCode, 'in') : null;
        need(!block, 'contents', `line:${l.id}:bin`, `${n}: ${block}`);
      }
    }
    if (l.baseLineId) billing.set(l.baseLineId, (billing.get(l.baseLineId) ?? 0) + l.quantity);
  }
  // Over-billing: a receipt line can't be billed past what was received, a PO line past what's open.
  for (const [baseLineId, qty] of billing) {
    const l = d.lines.find((x) => x.baseLineId === baseLineId)!;
    let open = Infinity;
    if (l.baseType === 'GRPO') {
      const gr = m.receipts.find((r) => r.id === l.baseId);
      const gl = gr?.lines.find((x) => x.id === baseLineId);
      open = gr && gl ? grOpenQty(gl, gr) : 0;
    } else if (l.baseType === 'PO') {
      const pl = m.orders.find((p) => p.id === l.baseId)?.lines.find((x) => x.id === baseLineId);
      open = pl ? openQty(pl) : 0;
    }
    need(qty <= open, 'contents', `line:${l.id}:quantity`, `${l.itemNo}: billing ${qty} ${l.uomCode}, but ${l.baseType === 'GRPO' ? 'receipt' : 'PO'} ${l.baseDocNo} has only ${open} left.`);
  }
  return problems;
}

/** Keyed by record so moving between invoices (or duplicating into /new) starts a fresh form. */
export function ApInvoiceDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <ApInvoiceForm key={id === 'new' ? location.key : id} />;
}

function ApInvoiceForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const state = useLocation().state as { copyFrom?: ApDraft; fromReceipt?: string; fromPo?: string } | null;

  const [draft, setDraft] = useState<ApDraft | null | undefined>(isNew ? (state?.copyFrom ?? { ...blankApInvoice(todayISO(), CURRENT_USER), lines: [] }) : undefined);
  const [m, setM] = useState<ApMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [dupWarning, setDupWarning] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
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
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, orders, receipts]) => {
      const masters: ApMasters = {
        vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, orders, receipts, accounts: inv.accounts,
      };
      setM(masters);
      // Copy to › A/P Invoice from a receipt or PO: every open line at its open quantity.
      // Rebuilt from scratch each time, so running the effect twice doesn't copy the lines twice.
      const gr = state?.fromReceipt ? receipts.find((r) => r.id === state.fromReceipt) : undefined;
      const po = state?.fromPo ? orders.find((o) => o.id === state.fromPo) : undefined;
      if (isNew && (gr || po)) {
        const vendor = vendors.find((v) => v.id === (gr ?? po)!.vendorId);
        const lines = gr
          ? linesFromReceipt(gr, gr.lines.map((l) => ({ lineId: l.id, qty: grOpenQty(l, gr) })).filter((p) => p.qty > 0), items)
          : linesFromPo(po!, po!.lines.filter((l) => l.status === 'Open').map((l) => ({ lineId: l.id, qty: openQty(l) })), masters).map((l) => toApLine(l, { baseType: 'PO' }, items, po!.vendorId));
        setDraft((d) => d && withBase({ ...d, ...vendorDefaults(vendor, d), lines: [] }, gr ?? po!, lines, masters));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getApInvoice(id).then((inv) => !cancelled && setDraft(inv ?? null));
    listApInvoices().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((r) => r.id)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading A/P invoice…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="request_quote" title="A/P invoice not found" />
        <Panel.Body>
          <Button onClick={() => navigate(AP_LIST_PATH)}>Back to bills</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const ctx = buildGrContext(draft, m);
  const { vendor } = ctx;
  const added = draft.status !== 'Draft';
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = apTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholding = poWithholding(draft, vendor, m.items, m.tax, draft.postingDate);
  const due = netDue(totals.total, withholding, draft.downPayment);
  const balance = Math.round((due - draft.appliedAmount) * 100) / 100;
  const journal = ctx.fx ? apJournal(draft, ctx.fx, { items: m.items, groups: m.inv.groups, codes: m.tax.codes, rateOf: ctx.rateOf, withholding }) : [];
  // Price or exchange-rate differences against the receipts the lines bill.
  const differences = draft.lines
    .filter((l) => l.baseType === 'GRPO')
    .map((l) => ({ l, gr: m.receipts.find((r) => r.id === l.baseId), diff: ctx.fx ? Math.round((lineValueLc(l, draft, ctx.fx) - receiptValueLc(l)) * 100) / 100 : 0 }))
    .filter((x) => x.diff);

  // Ship To follows the lines, and the due date the terms, while each still holds its default.
  const update = (patch: Partial<ApDraft>) => {
    const next = { ...draft, ...patch };
    if (patch.lines && patch.shipTo === undefined && draft.shipTo === defaultShipTo(draft.lines, m)) next.shipTo = defaultShipTo(patch.lines, m);
    if ((patch.paymentTerms !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTerms))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTerms);
    }
    if (patch.lines) next.orderNumber = orderNumbersOf(next.lines, m);
    setDraft(next);
  };
  const h = bind(draft, update);

  /** Picking the vendor fills everything that defaults from it. Lines copied from another vendor's documents go. */
  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    if (!v) return update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '', payTo: '' });
    update({
      ...vendorDefaults(v, draft),
      lines: draft.lines.filter((l) => !l.baseType).map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item ? { ...l, taxCode: proposedTaxCode(item, v, m, draft.postingDate) } : l;
      }),
    });
  };

  const copyLines = (lines: ApLine[]) => {
    const first = lines[0];
    const base = first?.baseType === 'GRPO' ? m.receipts.find((r) => r.id === first.baseId) : m.orders.find((o) => o.id === first?.baseId);
    if (base) setDraft(withBase(draft, base, lines, m));
  };

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await saveApRemarks(draft as ApInvoice, { remarks: draft.remarks, paymentBlock: draft.paymentBlock, paymentOrderRun: draft.paymentOrderRun });
        navigate(AP_LIST_PATH, { state: { notice: `A/P invoice ${apNumber(saved)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const found = validate(draft, ctx, m, asDraft);
    setProblems(found);
    if (found.length) return;
    // The same vendor invoice number twice is usually the same bill entered twice: ask once.
    if (!asDraft && PURCHASING_SETTINGS.duplicateVendorRef !== 'Allow' && !dupWarning) {
      const dup = await findDuplicateInvoice(draft);
      if (dup) {
        const message = `A/P invoice ${apNumber(dup)} from ${draft.vendorName} already has Vendor Ref. No. ${draft.vendorRef}.`;
        if (PURCHASING_SETTINGS.duplicateVendorRef === 'Block') return setProblems([{ tab: 'header', key: 'vendorRef', message }]);
        return setDupWarning(message);
      }
    }
    setSaving(true);
    try {
      const saved = asDraft ? await saveApDraft(draft) : await addApInvoice(draft, ctx.fx);
      if (!asDraft) {
        await postDocumentEntry({
          origin: 'PU',
          originNo: saved.docNum,
          originId: saved.id,
          postingDate: saved.postingDate,
          dueDate: saved.dueDate,
          remarks: saved.journalRemark,
          partnerId: saved.vendorId,
          controlAccount: saved.controlAccount,
          lines: journal,
        });
      }
      navigate(AP_LIST_PATH, { state: { notice: asDraft ? `Draft saved — ${saved.vendorName}.` : `A/P invoice ${apNumber(saved)} added — ${saved.vendorName} is owed ${saved.currency} ${formatAmount(due)}.` } });
    } catch (err) {
      if (!(err instanceof ApPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<ApInvoice>, notice: string) => {
    try {
      const inv = await run();
      navigate(AP_LIST_PATH, { state: { notice: `A/P invoice ${apNumber(inv)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  /** A new draft with the same vendor and lines, unlinked from their base documents. */
  const duplicate = () => {
    const today = todayISO();
    const copy: ApDraft = {
      ...structuredClone(draft),
      id: undefined,
      status: 'Draft',
      docNum: 0,
      vendorRef: '',
      postingDate: today,
      documentDate: today,
      dueDate: dueDateFor(today, draft.paymentTerms),
      closeDate: '',
      orderNumber: '',
      fxRate: 1,
      appliedAmount: 0,
      lines: draft.lines.map((l) => ({ ...l, id: newApLine().id, baseType: '', baseId: '', baseLineId: '', baseDocNo: '', receiptCostLc: 0, unitCostLc: 0 })),
    };
    navigate(`${AP_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as ApInvoice;
  const bases = [...new Map(draft.lines.filter((l) => l.baseType).map((l) => [l.baseId, l])).values()];
  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Open' && balance > 0 && !draft.paymentBlock
      ? [{ label: 'Pay', icon: 'payments', onSelect: () => navigate('/purchasing/payments-made/new', { state: { vendorId: draft.vendorId, invoiceIds: [saved.id] } }) }]
      : []),
    ...(draft.status === 'Open' || draft.status === 'Closed'
      ? [
          ...(draft.lines.some((l) => returnableQty(l) > 0 && m.items.find((i) => i.id === l.itemId)?.inventoryItem)
            ? [{ label: 'Copy to goods return', icon: 'assignment_return', onSelect: () => navigate('/purchasing/returns-and-debits/returns/new', { state: { fromInvoice: saved.id } }) }]
            : []),
          { label: 'Copy to A/P credit memo', icon: 'receipt', onSelect: () => navigate('/purchasing/returns-and-debits/credit-memos/new', { state: { fromInvoice: saved.id } }) },
        ]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Open' && !draft.appliedAmount
      ? [{ label: 'Cancel A/P invoice', icon: 'cancel', onSelect: () => act(async () => { const inv = await cancelApInvoice(saved); await reverseDocumentEntry(saved.id); return inv; }, 'cancelled — the receipts and POs it billed are open again') }]
      : []),
    ...bases.map((l) => ({
      label: `Open ${l.baseType === 'GRPO' ? 'receipt' : 'PO'} ${l.baseDocNo}`,
      icon: l.baseType === 'GRPO' ? 'inventory' : 'receipt_long',
      onSelect: () => navigate(l.baseType === 'GRPO' ? `/purchasing/goods-receipts/${l.baseId}` : `/purchasing/purchase-orders/${l.baseId}`),
    })),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const allCurrencies = vendor?.currency === ALL_CURRENCIES;
  const title = isNew ? 'New A/P invoice' : added ? `A/P invoice ${apNumber(draft)}` : 'Draft A/P invoice';
  const series = apSeriesOf(draft.seriesId);
  const code = draft.currency;

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="request_quote"
          title={title}
          subcopy={draft.vendorName ? `${draft.vendorCode} · ${draft.vendorName}${draft.vendorRef ? ` · ${draft.vendorRef}` : ''}` : "Record a vendor's bill."}
          leading={
            isNew ? undefined : (
              <>
                <IconButton type="button" label="Next" intent="default" variant="solid" size="extra-large" disabled={!nextId} onClick={() => navigate(`${AP_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton type="button" label="Previous" intent="default" variant="solid" size="extra-large" disabled={!prevId} onClick={() => navigate(`${AP_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
              </>
            )
          }
          tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
          status={
            isNew ? undefined : (
              <div className="flex gap-1">
                <Badge intent={AP_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                {draft.paymentBlock ? <Badge intent="warning" variant="outline">Payment block</Badge> : null}
              </div>
            )
          }
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(AP_LIST_PATH)}>
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
            <DocumentFlow
              kind="APINV"
              id={draft.id}
              notes="Everything linked to this invoice, however far back or forward: the receipts and POs it billed and their own bases, and the payments and credit memos that follow (once built)."
            />
          </Panel.Body>
        ) : page !== 'details' ? (
          <Panel.Body>
            <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
            {dupWarning ? (
              <Alert intent="warning" variant="outline" title="Possible duplicate bill">
                {dupWarning} Press Add again if it's a different bill, or change the Vendor Ref. No.
              </Alert>
            ) : null}
            {added ? (
              <Alert intent="default" variant="outline" title={draft.status === 'Open' ? 'This A/P invoice is added' : `This A/P invoice is ${draft.status.toLowerCase()}`}>
                {draft.status === 'Open'
                  ? `The vendor is owed ${code} ${formatAmount(balance)}. Only remarks, the payment block and the payment run flag can change; to undo it, cancel the invoice.`
                  : `Only remarks can change${draft.closeDate ? ` (${draft.status.toLowerCase()} ${formatDate(draft.closeDate)})` : ''}.`}
              </Alert>
            ) : null}

            <fieldset disabled={added} className="contents">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <Section icon="storefront" title="Vendor">
                  <Fields>
                    <div className="md:col-span-2">
                      {vendor && (added || ctx.based) ? (
                        <ReadOnly label="Vendor" value={draft.vendorName} description={`${draft.vendorCode} · ${draft.currency}`} hint={!added ? 'Locked while lines copied from its documents are on the invoice.' : undefined} />
                      ) : (
                        <FormField label="Vendor" required error={errors.vendorId} tooltip="Only vendors are listed. Picking one fills the name, contact, currency, terms and control account.">
                          {(p) => (
                            <Combobox
                              {...p}
                              placeholder="Search vendors"
                              options={m.vendors
                                .filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId)
                                .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, description: v.currency, text: `${v.code} ${v.name}` }))}
                              value={draft.vendorId || null}
                              onValueChange={pickVendor}
                            />
                          )}
                        </FormField>
                      )}
                    </div>
                    {h.lookup(
                      'contactId',
                      'Contact person',
                      [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))],
                      { hint: !vendor ? 'Pick a vendor first.' : "Defaults to the vendor's default contact.", disabled: !vendor },
                    )}
                    {h.text('vendorRef', 'Vendor ref. no.', { error: errors.vendorRef, hint: "The vendor's invoice no. — checked against their other bills so it isn't entered twice." })}
                    <FormField
                      label="Currency"
                      required
                      error={errors.currency}
                      className="md:col-span-2"
                      tooltip={ctx.based ? 'Locked to the currency of the documents the lines came from.' : allCurrencies ? 'This vendor takes all currencies — pick the document currency.' : `Defaults to the vendor's currency (${vendor?.currency ?? '—'}).`}
                    >
                      {(p) => (
                        <Select {...p} disabled={added || ctx.based} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={draft.currency} onValueChange={(currency) => update({ currency })} />
                      )}
                    </FormField>
                  </Fields>
                </Section>

                <Section icon="tag" title="Document">
                  <Fields>
                    <FormField label="No." tooltip={added ? undefined : 'Assigned from the series when the invoice is added.'}>
                      {(p) => (
                        <div className="flex gap-1">
                          <Select aria-label="Series" className="w-40" disabled={added} options={AP_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                          <TextField {...p} className="flex-1" readOnly placeholder={`Next ${series.name} number`} value={draft.docNum ? String(draft.docNum) : ''} />
                        </div>
                      )}
                    </FormField>
                    <ReadOnly
                      label="Status"
                      value={<Badge intent={AP_STATUS_INTENT[isNew ? 'Draft' : draft.status]}>{isNew ? 'New' : draft.status}</Badge>}
                      hint="Open once added; Closed when paid in full; Cancelled when reversed."
                      error={errors.status}
                    />
                    {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'Sets the period, tax rates and the exchange rate the bill is booked at.' })}
                    {h.date('dueDate', 'Due date', { required: true, error: errors.dueDate, hint: `Posting date + the payment terms${draft.paymentTerms ? ` (${draft.paymentTerms})` : ''}. Change it to override.` })}
                    {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate, hint: 'The date on the vendor’s invoice — the date BIR uses for input VAT.' })}
                    <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} hint="Set when the invoice is paid in full or cancelled." />
                  </Fields>
                </Section>
              </div>

              <ApContents draft={draft} update={update} errors={errors} m={m} ctx={ctx} onCopy={copyLines} />

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <GrLogistics draft={draft} update={update} m={m} ctx={ctx} />
                <ApAccounting draft={draft} update={update} errors={errors} m={m} ctx={ctx} />
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Section icon="functions" title="Totals">
                <Fields cols={1}>
                  <fieldset disabled={added} className="contents">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {h.master('buyer', 'Buyer', salesEmployeeDef, { extra: [CURRENT_USER], hint: 'Who bought the goods.' })}
                      {h.master('owner', 'Owner', salesEmployeeDef, { extra: [CURRENT_USER], hint: 'Owns the document (data access).' })}
                    </div>
                  </fieldset>
                  <fieldset disabled={added} className="contents">
                    <List.Group divider>
                      <TotalRow label="Total before discount" value={totals.beforeDiscount} code={code} />
                      <TotalRow
                        label="Discount"
                        value={totals.discount ? -totals.discount : 0}
                        code={code}
                        input={<TextField aria-label="Document discount %" type="number" min={0} className="w-24" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />}
                      />
                      {PURCHASING_SETTINGS.manageFreightInDocuments ? (
                        <TotalRow
                          label="Freight"
                          value={totals.freight}
                          code={code}
                          input={
                            <div className="flex gap-1">
                              <TextField aria-label={`Freight (${code}, net)`} type="number" min={0} className="w-32" prefix={code} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />
                              <Combobox
                                aria-label="Freight tax code"
                                className="w-28"
                                options={m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: c.code }))}
                                value={draft.freightTaxCode}
                                onValueChange={(freightTaxCode) => update({ freightTaxCode: freightTaxCode ?? '' })}
                              />
                            </div>
                          }
                        />
                      ) : null}
                      {PURCHASING_SETTINGS.roundingMethod === 'By Currency' ? <TotalRow label={`Rounding (${docCurrency?.rounding ?? 'No rounding'})`} value={totals.rounding} code={code} /> : null}
                      <TotalRow label="Tax" value={totals.tax} code={code} />
                      {totals.reverseCharge ? <TotalNote>VAT of {code} {formatAmount(totals.reverseCharge)} isn't owed to the vendor (reverse charge or import VAT).</TotalNote> : null}
                      <TotalRow label="Total payment due" value={totals.total} code={code} strong />
                      {withholding.filter((w) => w.deducted).map((w) => (
                        <TotalRow key={w.atc} label={`${WITHHELD_LABEL[w.kind] ?? 'Tax'} withheld — ${w.atc} (${w.rate}%)`} value={-w.amount} code={code} />
                      ))}
                      <TotalRow label="Total down payment" value={-draft.downPayment} code={code} />
                      <TotalRow label="Net payment due" value={due} code={code} strong />
                      <TotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
                      <TotalRow label="Balance due" value={balance} code={code} strong />
                      {code !== 'PHP' ? <Text variant="small" tone="muted">≈ PHP {formatAmount(balance * ctx.fx)} at {ctx.fx ? `${ctx.fx} (${ctx.fxSource})` : '—'}.</Text> : null}
                    </List.Group>
                  </fieldset>
                  <Flags>
                    {h.check('paymentBlock', 'Payment block (keep out of payment runs)')}
                    {h.check('paymentOrderRun', 'Include in payment runs (Payment Order Ref.)')}
                  </Flags>
                  {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the invoice is added.' })}
                </Fields>
              </Section>

              <Section icon="account_balance" title="Journal entry">
                {journal.length ? (
                  <List.Group divider>
                    {journal.map((j) => (
                      <List.Item
                        key={j.account}
                        title={accountText(j.account, m.accounts)}
                        content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>}
                      />
                    ))}
                  </List.Group>
                ) : null}
                {differences.length ? (
                  <Alert intent="warning" variant="outline" title="Billed at a different price or rate than received">
                    {differences.map(({ l, gr, diff }) => (
                      <div key={l.id}>
                        {l.itemNo}: receipt {l.baseDocNo}
                        {gr && gr.currency !== 'PHP' ? ` at ${gr.fxRate}, billed at ${ctx.fx}` : ''} — PHP {formatAmount(Math.abs(diff))} {diff > 0 ? 'more' : 'less'}, posted to{' '}
                        {differenceTarget(m.items.find((i) => i.id === l.itemId))}.
                      </div>
                    ))}
                  </Alert>
                ) : null}
                <Text variant="small" tone="muted">
                  {journal.length
                    ? `In PHP${code === 'PHP' ? '' : ` at ${ctx.fx}`}. Receipt lines clear Goods Received Not Invoiced at the receipt's cost; other stocked lines receive the stock now. Realized exchange gains and losses come when the bill is paid.`
                    : 'Made when the invoice is added: Dr Goods Received Not Invoiced (or Inventory) and Input VAT / Cr the vendor and any withholding tax. Add lines to see it.'}
                </Text>
              </Section>
            </div>
          </Panel.Body>
        )}
      </Panel>
    </Form>
  );
}

/** Where a line's price or rate difference against its receipt is posted, in words. */
function differenceTarget(item: Item | undefined) {
  if (!item?.inventoryItem) return "the item's cost account (it isn't stocked)";
  return item.warehouses.reduce((n, w) => n + w.inStock, 0) > 0 ? 'inventory (the item cost re-averages)' : 'cost of sales (the stock is gone)';
}

/** What picking a vendor fills on the invoice. */
function vendorDefaults(v: Partner | undefined, d: ApDraft): Partial<ApDraft> {
  if (!v) return {};
  return {
    vendorId: v.id,
    vendorCode: v.code,
    vendorName: v.name,
    contactId: v.defaultContactId,
    currency: v.currency === ALL_CURRENCIES ? 'PHP' : v.currency,
    paymentTerms: v.vendorPaymentTerms,
    paymentMethod: v.defaultPaymentMethod,
    dueDate: dueDateFor(d.postingDate, v.vendorPaymentTerms),
    project: v.project,
    shippingType: v.shippingType,
    journalRemark: `A/P Invoices – ${v.code}`,
    payTo: defaultPayTo(v),
    controlAccount: v.payableAccount || '2010',
    paymentBlock: v.paymentBlock,
  };
}

/**
 * Add lines copied from a receipt or PO. The first base document also sets the header terms it
 * carried: currency, contact, payment terms, project, shipping type, document discount.
 */
function withBase(d: ApDraft, base: GoodsReceipt | PurchaseOrder, lines: ApLine[], m: ApMasters): ApDraft {
  const first = !d.lines.some((l) => l.baseType);
  const allLines = [...d.lines.filter((l) => l.itemId), ...lines];
  return {
    ...d,
    ...(first
      ? {
          currency: base.currency,
          contactId: base.contactId || d.contactId,
          paymentTerms: base.paymentTerms || d.paymentTerms,
          paymentMethod: base.paymentMethod || d.paymentMethod,
          dueDate: dueDateFor(d.postingDate, base.paymentTerms || d.paymentTerms),
          project: base.project || d.project,
          shippingType: base.shippingType || d.shippingType,
          discountPct: base.discountPct,
          buyer: base.buyer || d.buyer,
          freightTaxCode: base.freightTaxCode || d.freightTaxCode,
        }
      : {}),
    shipTo: !d.shipTo || d.shipTo === defaultShipTo(d.lines, m) ? defaultShipTo(allLines, m) : d.shipTo,
    orderNumber: orderNumbersOf(allLines, m),
    lines: allLines,
  };
}
