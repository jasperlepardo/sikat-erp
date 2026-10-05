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
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { CURRENT_USER } from '../../../../mocks/common';
import { GR_SERIES, blankGoodsReceipt, newGrLine, type GoodsReceipt, type GrLine, type GrStatus } from '../../../../mocks/goodsReceipts';
import { contactName, type Partner } from '../../../../mocks/partners';
import { PURCHASING_SETTINGS, type PurchaseOrder } from '../../../../mocks/purchaseOrders';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import {
  GrPostError,
  addGoodsReceipt,
  grOpenQty,
  cancelGoodsReceipt,
  closeGoodsReceipt,
  getGoodsReceipt,
  grJournal,
  grNumber,
  grSeriesOf,
  grTotals,
  listGoodsReceipts,
  saveGrDraft,
  saveGrRemarks,
} from '../../../../services/goodsReceipts';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { dueDateFor, listPurchaseOrders, openQty, poNumber } from '../../../../services/purchaseOrders';
import { transferBlock } from '../../../../services/binLocations';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { TotalNote, TotalRow } from '../../orders/detail/PurchaseOrderDetail';
import { proposedTaxCode } from '../../orders/detail/types';
import { GrContents } from './GrContents';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { GrAccounting, GrLogistics } from './GrSections';
import { buildGrContext, defaultPayTo, defaultShipTo, linesFromPo, type GrContext, type GrDraft, type GrMasters } from './types';

export const GR_LIST_PATH = '/purchasing/goods-receipts';

type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

export const GR_STATUS_INTENT: Record<GrStatus, 'default' | 'primary' | 'success' | 'danger'> = {
  Draft: 'default',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

const ALL_CURRENCIES = 'All currencies';
const journalRemarkFor = (vendorCode: string) => `Goods Receipt PO – ${vendorCode}`;

/** Required and conditional fields from the GRPO field map, checked on Add. Drafts only need a vendor. */
function validate(d: GrDraft, ctx: GrContext, m: GrMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;

  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  need(d.currency !== ALL_CURRENCIES, 'header', 'currency', 'Pick the document currency.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate} — add it in Settings › Accounting & Tax › Exchange rates.`);
  need(d.shipTo, 'logistics', 'shipTo', 'Ship to is required.');

  const binOf = (warehouse: string, code: string) => m.inv.bins.find((b) => b.warehouse === warehouse && b.code === code);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a purchase order.');
  const receiving = new Map<string, number>();
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.baseId || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(Number.isInteger(l.quantity * l.itemsPerUnit) || item.manageBy !== 'Serial Numbers', 'contents', `line:${l.id}:quantity`, `${n}: serial-managed items come in whole units.`);
    need(!item.inventoryItem || l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse it went into.`);
    const wh = m.inv.warehouses.find((w) => w.code === l.warehouse);
    if (item.inventoryItem && wh?.binEnabled) {
      need(l.bin, 'contents', `line:${l.id}:bin`, `${n}: pick the bin it's put away in, in ${l.warehouse}.`);
      need(!l.bin || binOf(l.warehouse, l.bin), 'contents', `line:${l.id}:bin`, `${n}: bin ${l.bin} no longer exists — pick its new code.`);
      const block = l.bin ? transferBlock(binOf(l.warehouse, l.bin), item, l.uomCode, 'in') : null;
      need(!block, 'contents', `line:${l.id}:bin`, `${n}: ${block}`);
    }
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
    if (l.baseLineId) receiving.set(l.baseLineId, (receiving.get(l.baseLineId) ?? 0) + l.quantity);
  }
  // Over-receipt: a PO line can't take more than it has open.
  for (const [baseLineId, qty] of receiving) {
    const l = d.lines.find((x) => x.baseLineId === baseLineId)!;
    const pl = m.orders.find((p) => p.id === l.baseId)?.lines.find((x) => x.id === baseLineId);
    need(!pl || qty <= openQty(pl), 'contents', `line:${l.id}:quantity`, `${l.itemNo}: receiving ${qty} ${l.uomCode}, but PO ${l.baseDocNo} has only ${pl ? openQty(pl) : 0} open.`);
  }
  return problems;
}

/** Keyed by record so moving between receipts (or duplicating into /new) starts a fresh form. */
export function GoodsReceiptDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <GoodsReceiptForm key={id === 'new' ? location.key : id} />;
}

function GoodsReceiptForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const state = useLocation().state as { copyFrom?: GrDraft; fromPo?: string } | null;

  const [draft, setDraft] = useState<GrDraft | null | undefined>(
    isNew ? (state?.copyFrom ?? { ...blankGoodsReceipt(todayISO(), CURRENT_USER), lines: [] }) : undefined,
  );
  const [m, setM] = useState<GrMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
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
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, orders]) => {
      const masters: GrMasters = {
        vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, orders,
      };
      setM(masters);
      // Copy to › Goods Receipt PO from a purchase order: every open line, at its open quantity.
      const po = state?.fromPo ? orders.find((o) => o.id === state.fromPo) : undefined;
      if (isNew && po) {
        const vendor = vendors.find((v) => v.id === po.vendorId);
        // Rebuilt from the PO each time, so running the effect twice doesn't copy the lines twice.
        setDraft((d) => d && withPo({ ...d, ...vendorDefaults(vendor, d), lines: [], orderNumber: '' }, po, linesFromPo(po, po.lines.filter((l) => l.status === 'Open').map((l) => ({ lineId: l.id, qty: openQty(l) })), masters), masters));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getGoodsReceipt(id).then((gr) => !cancelled && setDraft(gr ?? null));
    listGoodsReceipts().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((r) => r.id)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading goods receipt…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="inventory" title="Goods receipt not found" />
        <Panel.Body>
          <Button onClick={() => navigate(GR_LIST_PATH)}>Back to goods receipts</Button>
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
  const totals = grTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const journal = ctx.fx ? grJournal(draft, ctx.fx, m.items, m.inv.groups) : [];

  // Ship To follows the lines, and the due date the terms, while each still holds its default.
  const update = (patch: Partial<GrDraft>) => {
    const next = { ...draft, ...patch };
    if (patch.lines && patch.shipTo === undefined && draft.shipTo === defaultShipTo(draft.lines, m)) next.shipTo = defaultShipTo(patch.lines, m);
    if ((patch.paymentTerms !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTerms))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTerms);
    }
    setDraft(next);
  };
  const h = bind(draft, update);

  /** Picking the vendor fills everything that defaults from it. Lines copied from another vendor's PO go. */
  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    if (!v) return update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '', payTo: '' });
    const kept = draft.lines.filter((l) => !l.baseId);
    update({
      ...vendorDefaults(v, draft),
      lines: kept.map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item ? { ...l, taxCode: proposedTaxCode(item, v, m, draft.postingDate) } : l;
      }),
      orderNumber: '',
    });
  };

  const copyLines = (po: PurchaseOrder, lines: GrLine[]) => setDraft(withPo(draft, po, lines, m));

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await saveGrRemarks(draft as GoodsReceipt, { remarks: draft.remarks, journalRemark: draft.journalRemark });
        navigate(GR_LIST_PATH, { state: { notice: `Goods receipt ${grNumber(saved)} saved.` } });
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
      const saved = asDraft ? await saveGrDraft(draft) : await addGoodsReceipt(draft, ctx.fx);
      if (!asDraft) {
        await postDocumentEntry({ origin: 'PD', originNo: saved.docNum, originId: saved.id, postingDate: saved.postingDate, remarks: saved.journalRemark, lines: journal });
      }
      navigate(GR_LIST_PATH, {
        state: { notice: asDraft ? `Draft saved — ${saved.vendorName}.` : `Goods receipt ${grNumber(saved)} added — stock is in and the PO lines are updated.` },
      });
    } catch (err) {
      if (!(err instanceof GrPostError)) throw err;
      setProblems([{ tab: 'contents', key: `line:${err.lineIds[0]}:quantity`, message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<GoodsReceipt>, notice: string) => {
    try {
      const gr = await run();
      navigate(GR_LIST_PATH, { state: { notice: `Goods receipt ${grNumber(gr)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  /** A new draft with the same vendor and lines, unlinked from the POs (they may be fully received now). */
  const duplicate = () => {
    const today = todayISO();
    const copy: GrDraft = {
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
      lines: draft.lines.map((l) => ({ ...l, id: newGrLine().id, baseId: '', baseLineId: '', baseDocNo: '', unitCostLc: 0, invoicedQty: 0 })),
    };
    navigate(`${GR_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as GoodsReceipt;
  const basePos = [...new Set(draft.lines.map((l) => l.baseId).filter(Boolean))];
  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Open' && draft.lines.some((l) => grOpenQty(l, draft) > 0)
      ? [
          { label: 'Copy to A/P invoice', icon: 'request_quote', onSelect: () => navigate('/purchasing/bills/new', { state: { fromReceipt: saved.id } }) },
          { label: 'Copy to goods return', icon: 'assignment_return', onSelect: () => navigate('/purchasing/returns-and-debits/returns/new', { state: { fromReceipt: saved.id } }) },
        ]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: () => act(() => closeGoodsReceipt(saved), 'closed') }] : []),
    ...(draft.status === 'Open'
      ? [{ label: 'Cancel goods receipt', icon: 'cancel', onSelect: () => act(async () => { const gr = await cancelGoodsReceipt(saved); await reverseDocumentEntry(saved.id); return gr; }, 'cancelled — the stock is back out and the PO lines are open again') }]
      : []),
    ...basePos.map((poId) => ({ label: `Open PO ${draft.lines.find((l) => l.baseId === poId)?.baseDocNo}`, icon: 'receipt_long', onSelect: () => navigate(`/purchasing/purchase-orders/${poId}`) })),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const allCurrencies = vendor?.currency === ALL_CURRENCIES;
  const title = isNew ? 'New goods receipt' : added ? `Goods receipt ${grNumber(draft)}` : 'Draft goods receipt';
  const series = grSeriesOf(draft.seriesId);

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="inventory"
          title={title}
          subcopy={draft.vendorName ? `${draft.vendorCode} · ${draft.vendorName}` : 'Record goods or services received from a vendor.'}
          leading={
            isNew ? undefined : (
              <>
                <IconButton type="button" label="Next" intent="default" variant="solid" size="extra-large" disabled={!nextId} onClick={() => navigate(`${GR_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton type="button" label="Previous" intent="default" variant="solid" size="extra-large" disabled={!prevId} onClick={() => navigate(`${GR_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
              </>
            )
          }
          tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
          status={isNew ? undefined : <Badge intent={GR_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(GR_LIST_PATH)}>
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
              kind="GRPO"
              id={draft.id}
              notes="Everything linked to this receipt, however far back or forward: the PO it came from and that PO's own bases, and the A/P invoices and goods returns copied from it (once built)."
            />
          </Panel.Body>
        ) : page !== 'details' ? (
          <Panel.Body>
            <Text variant="small" tone="muted" className="p-4">
              Activity will show here.
            </Text>
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
            {added ? (
              <Alert intent="default" variant="outline" title={draft.status === 'Open' ? 'This goods receipt is added' : `This goods receipt is ${draft.status.toLowerCase()}`}>
                {draft.status === 'Open'
                  ? 'The stock is in and the PO lines count it as received. Only remarks can change; to undo it, cancel the receipt.'
                  : `Only remarks can change${draft.closeDate ? ` (${draft.status.toLowerCase()} ${formatDate(draft.closeDate)})` : ''}.`}
              </Alert>
            ) : null}

            <fieldset disabled={added} className="contents">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <Section icon="storefront" title="Vendor">
                  <Fields>
                    <div className="md:col-span-2">
                      {vendor && (added || ctx.based) ? (
                        <ReadOnly
                          label="Vendor"
                          value={draft.vendorName}
                          description={`${draft.vendorCode} · ${draft.currency}`}
                          hint={!added ? 'Locked while lines from its POs are on the receipt.' : undefined}
                        />
                      ) : (
                        <FormField label="Vendor" required error={errors.vendorId} tooltip="Only vendors are listed. Picking one fills the name, contact, currency and terms.">
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
                    {h.text('vendorRef', 'Vendor ref. no.', { hint: "The vendor's delivery receipt or waybill no." })}
                    <FormField
                      label="Currency"
                      required
                      error={errors.currency}
                      className="md:col-span-2"
                      tooltip={ctx.based ? 'Locked to the currency of the PO the lines came from.' : allCurrencies ? 'This vendor takes all currencies — pick the document currency.' : `Defaults to the vendor's currency (${vendor?.currency ?? '—'}).`}
                    >
                      {(p) => (
                        <Select
                          {...p}
                          disabled={added || ctx.based}
                          options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                          value={draft.currency}
                          onValueChange={(currency) => update({ currency })}
                        />
                      )}
                    </FormField>
                  </Fields>
                </Section>

                <Section icon="tag" title="Document">
                  <Fields>
                    <FormField label="No." tooltip={added ? undefined : 'Assigned from the series when the receipt is added.'}>
                      {(p) => (
                        <div className="flex gap-1">
                          <Select
                            aria-label="Series"
                            className="w-40"
                            disabled={added}
                            options={GR_SERIES.map((s) => ({ value: s.id, label: s.name }))}
                            value={draft.seriesId}
                            onValueChange={(seriesId) => update({ seriesId })}
                          />
                          <TextField {...p} className="flex-1" readOnly placeholder={`Next ${series.name} number`} value={draft.docNum ? String(draft.docNum) : ''} />
                        </div>
                      )}
                    </FormField>
                    <ReadOnly
                      label="Status"
                      value={<Badge intent={GR_STATUS_INTENT[isNew ? 'Draft' : draft.status]}>{isNew ? 'New' : draft.status}</Badge>}
                      hint="Open once added; Closed when invoiced (or closed by hand); Cancelled when reversed."
                      error={errors.status}
                    />
                    {h.date('postingDate', 'Posting date', {
                      required: true,
                      error: errors.postingDate,
                      hint: 'When the stock is recorded. Sets the exchange rate, tax rates and period.',
                    })}
                    {h.date('dueDate', 'Due date', {
                      error: errors.dueDate,
                      hint: `Posting date + the payment terms${draft.paymentTerms ? ` (${draft.paymentTerms})` : ''}. The A/P invoice takes it.`,
                    })}
                    {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate, hint: 'The date on the vendor’s delivery receipt. Defaults to today.' })}
                    <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} hint="Set when the receipt is closed or cancelled." />
                  </Fields>
                </Section>
              </div>

              <GrContents draft={draft} update={update} errors={errors} m={m} ctx={ctx} onCopy={copyLines} />

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <GrLogistics draft={draft} update={update} m={m} ctx={ctx} />
                <GrAccounting draft={draft} update={update} errors={errors} m={m} ctx={ctx} />
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
                      <TotalRow label="Total before discount" value={totals.beforeDiscount} code={draft.currency} />
                      <TotalRow
                        label="Discount"
                        value={totals.discount ? -totals.discount : 0}
                        code={draft.currency}
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
                      {PURCHASING_SETTINGS.manageFreightInDocuments ? (
                        <TotalRow
                          label="Freight"
                          value={totals.freight}
                          code={draft.currency}
                          input={
                            <div className="flex gap-1">
                              <TextField
                                aria-label={`Freight (${draft.currency}, net)`}
                                type="number"
                                min={0}
                                className="w-32"
                                prefix={draft.currency}
                                value={String(draft.freight)}
                                onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
                              />
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
                      {PURCHASING_SETTINGS.roundingMethod === 'By Currency' ? (
                        <TotalRow label={`Rounding (${docCurrency?.rounding ?? 'No rounding'})`} value={totals.rounding} code={draft.currency} />
                      ) : null}
                      <TotalRow label="Tax" value={totals.tax} code={draft.currency} />
                      {totals.reverseCharge ? (
                        <TotalNote>
                          VAT of {draft.currency} {formatAmount(totals.reverseCharge)} isn't paid to the vendor (reverse charge or import VAT).
                        </TotalNote>
                      ) : null}
                      <TotalRow label="Total payment due" value={totals.total} code={draft.currency} strong />
                      {draft.currency !== 'PHP' ? (
                        <Text variant="small" tone="muted">
                          ≈ PHP {formatAmount(totals.total * ctx.fx)} at {ctx.fx ? `${ctx.fx} (${ctx.fxSource})` : '—'}.
                        </Text>
                      ) : null}
                    </List.Group>
                  </fieldset>
                  {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the receipt is added.' })}
                </Fields>
              </Section>

              <Section icon="account_balance" title="Journal entry">
                {journal.length ? (
                  <List.Group divider>
                    {journal.map((j) => (
                      <List.Item
                        key={j.account}
                        title={accountText(j.account, m.inv.accounts)}
                        content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>}
                      />
                    ))}
                  </List.Group>
                ) : null}
                <Text variant="small" tone="muted">
                  {journal.length
                    ? `In PHP${draft.currency === 'PHP' ? '' : ` at ${ctx.fx}`}. Stock goes in at net cost after discounts; VAT isn't posted until the vendor's A/P invoice, which clears Goods Received Not Invoiced.`
                    : 'Made when the receipt is added: Dr Inventory (or the cost account for non-stock items) / Cr Goods Received Not Invoiced. Add lines to see it.'}
                </Text>
              </Section>
            </div>
          </Panel.Body>
        )}
      </Panel>
    </Form>
  );
}

/** What picking a vendor fills on the receipt. */
function vendorDefaults(v: Partner | undefined, d: GrDraft): Partial<GrDraft> {
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
    journalRemark: journalRemarkFor(v.code),
    payTo: defaultPayTo(v),
  };
}

/**
 * Add lines copied from a PO. The first PO also sets the header terms it was ordered on:
 * currency, contact, payment terms, project, shipping type, document discount.
 */
function withPo(d: GrDraft, po: PurchaseOrder, lines: GrLine[], m: GrMasters): GrDraft {
  const first = !d.lines.some((l) => l.baseId);
  const kept = d.lines.filter((l) => l.itemId);
  const allLines = [...kept, ...lines];
  const orderNumbers = [...new Set([...d.orderNumber.split(', ').filter(Boolean), poNumber(po)])];
  return {
    ...d,
    ...(first
      ? {
          currency: po.currency,
          contactId: po.contactId || d.contactId,
          paymentTerms: po.paymentTerms || d.paymentTerms,
          paymentMethod: po.paymentMethod || d.paymentMethod,
          dueDate: dueDateFor(d.postingDate, po.paymentTerms || d.paymentTerms),
          project: po.project || d.project,
          shippingType: po.shippingType || d.shippingType,
          discountPct: po.discountPct,
          buyer: po.buyer || d.buyer,
        }
      : {}),
    shipTo: !d.shipTo || d.shipTo === defaultShipTo(d.lines, m) ? defaultShipTo(allLines, m) : d.shipTo,
    orderNumber: orderNumbers.join(', '),
    lines: allLines,
  };
}
