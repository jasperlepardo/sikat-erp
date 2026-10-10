import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  CardField,
  DatePicker,
  Form,
  FormField,
  Icon,
  IconButton,
  List,
  Panel,
  PanelHeader,
  panelHeaderIcons,
  Select,
  Tabs,
  Text,
  TextField,
  type CardFieldOption,
} from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind, type Errors } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { contactName, type Partner } from '../../../../mocks/partners';
import {
  blankRfq,
  newRfqLine,
  RFQ_STATUSES,
  type Rfq,
  type RfqStatus,
} from '../../../../mocks/rfqs';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { loadCurrentCompany } from '../../../../services/companies';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import {
  addRfq,
  cancelRfq,
  closeRfq,
  getRfq,
  listRfqs,
  rfqNumber,
  rfqSeries,
  rfqTotals,
  saveRfqDraft,
  seriesOf,
} from '../../../../services/rfqs';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { AccountingTab } from './AccountingTab';
import { ContentsTab } from './ContentsTab';
import { LogisticsTab } from './LogisticsTab';
import { VendorQuickCreate } from '../../orders/detail/VendorQuickCreate';
import { DocumentFlow } from '../../shared/DocumentFlow';
import {
  ALL_CURRENCIES,
  buildContext,
  defaultShipTo,
  formatAddress,
  proposedTaxCode,
  type RfqDraft,
  type RfqMasters,
} from './types';
import { blankPurchaseOrder, newPoLine } from '../../../../mocks/purchaseOrders';
import { formatDate, todayISO } from '../../../../services/dates';
import { TotalNote, TotalRow } from '../../orders/detail/PurchaseOrderDetail';
import { useDocTitle } from '../../../../services/useDocTitle';

export const RFQ_LIST_PATH = '/purchasing/quotations';

type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

export const STATUS_INTENT: Record<RfqStatus, 'default' | 'primary' | 'success' | 'danger'> = {
  Draft: 'default',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

const STATUS_HINT: Record<RfqStatus, string> = {
  Draft: 'Pick Open to send the RFQ.',
  Open: 'Awaiting vendor response. Close or cancel when done.',
  Closed: 'Closed for good.',
  Cancelled: 'Cancelled for good.',
};

function validate(d: RfqDraft, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;

  const series = seriesOf(d.seriesId);
  need(!series.manual || d.docNum > 0, 'header', 'docNum', `The ${series.name} series is manual — enter the RFQ number.`);
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(d.currency !== ALL_CURRENCIES, 'header', 'currency', 'Pick the document currency.');

  need(d.lines.length > 0, 'contents', 'lines', 'Add at least one line.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    need(l.itemId, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    need(l.requiredQty > 0, 'contents', `line:${l.id}:requiredQty`, `${n}: required quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
  }
  return problems;
}

export function RfqDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <RfqForm key={id === 'new' ? location.key : id} />;
}

function RfqForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: RfqDraft } | null)?.copyFrom;

  const blank = blankRfq(CURRENT_USER_ID);
  const [draft, setDraft] = useState<RfqDraft | null | undefined>(
    isNew ? (copyFrom ?? { ...blank, lines: [newRfqLine()] }) : undefined,
  );
  const [m, setM] = useState<RfqMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  useEffect(() => {
    if (!isNew)
      listRfqs().then((all) =>
        setSiblings(
          [...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((q) => (q.docNum ? rfqNumber(q) : q.id)),
        ),
      );
  }, [isNew]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [showVendorCreate, setShowVendorCreate] = useState(false);

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
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours]) => {
      const masters: RfqMasters = {
        vendors,
        items,
        inv,
        tax: { company, codes, groups, withholding, withholdingGroups: wGroups },
        currencies: curs,
        rates,
        company: ours,
      };
      setM(masters);
      if (isNew)
        setDraft((d) => {
          if (!d) return d;
          const companyAddress = formatAddress(masters.company.address, masters.company.name);
          return { ...d, shipTo: d.shipTo || defaultShipTo(d.lines, masters), billTo: companyAddress };
        });
    });
    if (isNew || !id) return;
    let cancelled = false;
    getRfq(id).then((q) => !cancelled && setDraft(q ?? null));
    return () => { cancelled = true; };
  }, [id, isNew]);

  useDocTitle(
    draft?.docNum
      ? isNew
        ? 'New purchase quotation'
        : draft.status === 'Draft'
          ? 'Draft purchase quotation'
          : rfqNumber(draft)
      : undefined,
  );

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading purchase quotation…</Text>;
  if (draft === null)
    return (
      <Panel className="flex-1">
        <PanelHeader icon="description" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="Purchase quotation not found" />
        <Panel.Body>
          <Button onClick={() => navigate(RFQ_LIST_PATH)}>Back to purchase quotations</Button>
        </Panel.Body>
      </Panel>
    );

  const ctx = buildContext(draft, m);
  const at = draft.id
    ? siblings.indexOf(draft.docNum ? rfqNumber(draft as Rfq) : draft.id)
    : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const { vendor } = ctx;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const series = seriesOf(draft.seriesId);
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = rfqTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);

  const update = (patch: Partial<RfqDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const h = bind(draft, update);

  const pickVendor = (vendorId: string | null, override?: Partner) => {
    const v = override ?? m.vendors.find((x) => x.id === vendorId);
    if (!v) return update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '' });
    const billAddr = v.addresses.find((a) => a.id === v.defaultBillToId) ?? v.addresses[0];
    update({
      vendorId: v.id,
      vendorCode: v.code,
      vendorName: v.name,
      contactId: v.defaultContactId,
      currency: v.currency === ALL_CURRENCIES ? 'PHP' : v.currency,
      paymentTermId: v.vendorPaymentTermId,
      paymentMethod: v.defaultPaymentMethod,
      shippingType: v.shippingType,
      journalRemark: `Purchase Quotations – ${v.code}`,
      payTo: billAddr ? formatAddress(billAddr, v.name) : '',
      lines: draft.lines.map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item ? { ...l, taxCode: proposedTaxCode(item, v, m, draft.postingDate) } : l;
      }),
    });
  };

  const handleVendorCreated = (vendor: Partner) => {
    setM((prev) => prev && { ...prev, vendors: [...prev.vendors, vendor] });
    setShowVendorCreate(false);
    pickVendor(vendor.id, vendor);
  };

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    const found = validate(draft, asDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const saved = asDraft ? await saveRfqDraft(draft) : await addRfq(draft);
      navigate(RFQ_LIST_PATH, {
        state: {
          notice: asDraft
            ? `Draft saved — ${saved.vendorName}.`
            : `Purchase quotation ${rfqNumber(saved)} saved — ${saved.vendorName}.`,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<Rfq>, notice: string) => {
    const q = await run();
    navigate(RFQ_LIST_PATH, { state: { notice: `Purchase quotation ${rfqNumber(q)} ${notice}.` } });
  };

  const copyToPo = () => {
    const today = todayISO();
    const poDraft = {
      ...blankPurchaseOrder(CURRENT_USER_ID),
      vendorId: draft.vendorId,
      vendorCode: draft.vendorCode,
      vendorName: draft.vendorName,
      contactId: draft.contactId,
      vendorRef: draft.vendorRef,
      currency: draft.currency,
      paymentTermId: draft.paymentTermId,
      paymentMethod: draft.paymentMethod,
      shippingType: draft.shippingType,
      shipTo: draft.shipTo,
      projectId: draft.projectId,
      journalRemark: draft.journalRemark.replace('Quotations', 'Orders'),
      postingDate: today,
      documentDate: today,
      lines: draft.lines
        .filter((l) => l.itemId)
        .map((l) =>
          newPoLine({
            itemId: l.itemId,
            itemNo: l.itemNo,
            name: l.description,
            description: l.description,
            quantity: l.quotedQty || l.requiredQty,
            uomCode: l.uomCode,
            uomName: l.uomName,
            itemsPerUnit: l.itemsPerUnit,
            priceListId: l.priceListId,
            unitPrice: l.unitPrice,
            discountPct: l.discountPct,
            taxCode: l.taxCode,
            blanketAgreement: l.blanketAgreement,
            requisitionSlipNo: l.requisitionSlipNo,
          }),
        ),
      remarks: `From RFQ ${rfqNumber(draft as Rfq)}.`,
    };
    navigate('/purchasing/purchase-orders/new', { state: { copyFrom: poDraft } });
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: RfqDraft = {
      ...structuredClone(draft),
      id: undefined,
      status: 'Draft',
      docNum: 0,
      vendorRef: '',
      postingDate: today,
      documentDate: today,
      validUntil: '',
      convertedToPoId: '',
      lines: draft.lines.map((l) => ({ ...l, id: `rl-${crypto.randomUUID().slice(0, 8)}`, quotedQty: 0, quotedDate: '' })),
    };
    navigate(`${RFQ_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as Rfq;
  const open = draft.status === 'Open';
  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(open
      ? [
          { label: 'Copy to purchase order', icon: 'shopping_cart', onSelect: copyToPo },
          { label: 'Close', icon: 'task_alt', onSelect: () => act(() => closeRfq(saved), 'closed') },
          { label: 'Cancel', icon: 'cancel', onSelect: () => act(() => cancelRfq(saved), 'cancelled') },
        ]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const transitions: Partial<Record<RfqStatus, () => void>> =
    draft.status === 'Draft'
      ? { Open: () => submit(null, false) }
      : open
        ? {
            Closed: () => act(() => closeRfq(saved), 'closed'),
            Cancelled: () => act(() => cancelRfq(saved), 'cancelled'),
          }
        : {};

  const title = isNew
    ? 'New purchase quotation'
    : draft.status === 'Draft'
      ? 'Draft purchase quotation'
      : rfqNumber(draft);
  const postingMoved = draft.postingDate && draft.postingDate !== todayISO() && !ctx.added;

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="description"
            iconIntent="default"
            iconShape="rounded"
            iconSize={32}
            iconVariant="outline"
            title={title}
            trailing={
              isNew ? undefined : (
                <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
                  <IconButton type="button" label="Previous" size="small" shape="pill" disabled={!prevId} onClick={() => navigate(`${RFQ_LIST_PATH}/${prevId}`)}>
                    {panelHeaderIcons.arrowUpward}
                  </IconButton>
                  <IconButton type="button" label="Next" size="small" shape="pill" disabled={!nextId} onClick={() => navigate(`${RFQ_LIST_PATH}/${nextId}`)}>
                    {panelHeaderIcons.arrowDownward}
                  </IconButton>
                </ButtonGroup>
              )
            }
            tabs={
              <Tabs
                variant="outline"
                value={page}
                onValueChange={(v) => setPage(v as PageId)}
                items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))}
              />
            }
            status={
              isNew ? undefined : (
                <div className="flex gap-1">
                  <Badge size="small" intent={STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                  {draft.convertedToPoId ? <Badge size="small" variant="outline">Converted</Badge> : null}
                  {draft.validUntil && draft.validUntil < todayISO() && draft.status === 'Open' ? (
                    <Badge size="small" intent="warning">Expired</Badge>
                  ) : null}
                </div>
              )
            }
            actions={
              <>
                <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(RFQ_LIST_PATH)}>
                  {ctx.readOnly ? 'Back' : 'Cancel'}
                </Button>
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                  {saving ? 'Saving…' : ctx.added ? 'Save' : 'Add'}
                </Button>
              </>
            }
          />

          {page !== 'details' ? (
            <Panel.Body>
              {page === 'transactions' ? (
                ctx.added ? (
                  <DocumentFlow kind="RFQ" id={(draft as Rfq).id} notes="The purchase request this quote came from, and the purchase order it became." />
                ) : (
                  <Text variant="small" tone="muted" className="p-4">Transactions will show here once the RFQ is added.</Text>
                )
              ) : (
                <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
              )}
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert
                problems={problems}
                tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' }[t])}
              />
              {ctx.readOnly ? (
                <Alert intent="default" variant="outline" title={`This quotation is ${draft.status.toLowerCase()}`}>
                  Only remarks can change{draft.convertedToPoId ? ` (converted to a purchase order)` : ''}.
                </Alert>
              ) : null}

              <fieldset disabled={ctx.readOnly} className="contents">
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <Section icon="storefront" title="Vendor">
                    <Fields>
                      <div className="md:col-span-2">
                        <CardField
                          label="Vendor"
                          required
                          placeholder="Search vendors"
                          options={m.vendors
                            .filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId)
                            .map((v): CardFieldOption => ({
                              value: v.id,
                              label: v.name,
                              icon: <Icon size={16}>storefront</Icon>,
                              fields: [
                                { label: 'Code', value: v.code },
                                ...(v.currency && !v.currency.startsWith('All') ? [{ label: 'Currency', value: v.currency }] : []),
                                ...(v.tin ? [{ label: 'TIN', value: v.tin }] : []),
                              ],
                            }))}
                          value={draft.vendorId}
                          onValueChange={(id) => pickVendor(id || null)}
                          readOnly={!!(vendor && ctx.added)}
                          footer={
                            <button
                              type="button"
                              className="w-full cursor-pointer rounded-xl px-4 py-2 text-left text-sm font-medium hover:bg-primary-subtle"
                              style={{ color: 'var(--color-text-primary)' }}
                              onClick={() => setShowVendorCreate(true)}
                            >
                              + Create new vendor
                            </button>
                          }
                        />
                        {errors.vendorId && <Text variant="small" tone="danger">{errors.vendorId}</Text>}
                      </div>
                      {h.lookup(
                        'contactId',
                        'Contact person',
                        [
                          { value: '', label: '— None —' },
                          ...(vendor?.contacts ?? [])
                            .filter((c) => c.active || c.id === draft.contactId)
                            .map((c) => ({ value: c.id, label: contactName(c) })),
                        ],
                        { hint: !vendor ? 'Pick a vendor first.' : "Defaults to the vendor's default contact.", disabled: !vendor },
                      )}
                      {h.text('vendorRef', 'Vendor ref. no.', {
                        hint: "The vendor's own reference or quote number.",
                      })}
                      <FormField
                        label="Currency"
                        required
                        error={errors.currency}
                        tooltip={vendor && !vendor.currency?.startsWith('All') ? "Defaults to the vendor's currency." : 'Pick the document currency.'}
                      >
                        {(p) => (
                          <Select
                            {...p}
                            disabled={!!(vendor && ctx.added)}
                            options={m.currencies
                              .filter((c) => c.active || c.code === draft.currency)
                              .map((c) => ({ value: c.code, label: c.code }))}
                            value={draft.currency}
                            onValueChange={(currency) => currency && update({ currency })}
                          />
                        )}
                      </FormField>
                    </Fields>
                  </Section>

                  <Section icon="tag" title="Document">
                    <Fields>
                      <FormField label="No." required error={errors.docNum} tooltip={ctx.added ? undefined : series.manual ? 'Manual series: type the number.' : 'Assigned from the series when the RFQ is added.'}>
                        {(p) => (
                          <div className="flex gap-1">
                            <Select
                              aria-label="Series"
                              className="w-40"
                              disabled={ctx.added}
                              options={rfqSeries.snapshot().filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))}
                              value={draft.seriesId}
                              onValueChange={(seriesId) => update({ seriesId, docNum: 0 })}
                            />
                            {series.manual && !ctx.added ? (
                              <TextField
                                {...p}
                                className="flex-1"
                                type="number"
                                placeholder="RFQ number"
                                value={draft.docNum ? String(draft.docNum) : ''}
                                onChange={(e) => update({ docNum: Number(e.currentTarget.value) })}
                              />
                            ) : (
                              <span className="flex-1 self-center text-sm">
                                {draft.docNum ? rfqNumber(draft) : <span className="text-(--color-text-placeholder)">Next number</span>}
                              </span>
                            )}
                          </div>
                        )}
                      </FormField>
                      <StatusField
                        statuses={RFQ_STATUSES}
                        intents={STATUS_INTENT}
                        value={draft.status}
                        moves={transitions}
                        hint={STATUS_HINT[draft.status]}
                        error={errors.status}
                      />
                      {h.date('postingDate', 'Posting date', {
                        required: true,
                        error: errors.postingDate,
                        disabled: ctx.added,
                        hint: postingMoved ? '⚠ Not today: this breaks the continuity of document numbers and dates.' : 'Defaults to today.',
                      })}
                      {h.date('validUntil', 'Valid until', {
                        hint: 'Expiry date for the quoted prices.',
                      })}
                      {h.date('documentDate', 'Document date', {
                        required: true,
                        error: errors.documentDate,
                        hint: 'The date for tax purposes. Defaults to today.',
                      })}
                      <FormField label="Required date" hint="When the items are needed. Cascades to new lines.">
                        {(p) => (
                          <DatePicker
                            {...p}
                            value={draft.requiredDate || null}
                            onValueChange={(v) => {
                              const date = v ?? '';
                              update({
                                requiredDate: date,
                                lines: draft.lines.map((l) =>
                                  !l.requiredDate || l.requiredDate === draft.requiredDate
                                    ? { ...l, requiredDate: date }
                                    : l,
                                ),
                              });
                            }}
                          />
                        )}
                      </FormField>
                    </Fields>
                  </Section>
                </div>

                <ContentsTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} onVendorSaved={(v) => setM((prev) => prev && { ...prev, vendors: prev.vendors.map((x) => (x.id === v.id ? v : x)) })} />
                <LogisticsTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} onVendorSaved={(v) => setM((prev) => prev && { ...prev, vendors: prev.vendors.map((x) => (x.id === v.id ? v : x)) })} />
                <AccountingTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} onVendorSaved={(v) => setM((prev) => prev && { ...prev, vendors: prev.vendors.map((x) => (x.id === v.id ? v : x)) })} />
              </fieldset>

              <Section icon="functions" title="Totals">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Fields cols={1}>
                    <fieldset disabled={ctx.readOnly} className="contents">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {h.master('buyerId', 'Buyer', salesEmployeeDef, { hint: 'Who placed the RFQ.' })}
                        {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document (data access).' })}
                      </div>
                    </fieldset>
                    {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the RFQ is added.' })}
                  </Fields>
                  <fieldset disabled={ctx.readOnly} className="contents">
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
                      {getPurchasingSettings().manageFreightInDocuments ? (
                        <TotalRow
                          label="Freight"
                          value={totals.freight}
                          code={draft.currency}
                          input={
                            <TextField
                              aria-label={`Freight (${draft.currency}, net)`}
                              type="number"
                              min={0}
                              className="w-32"
                              prefix={draft.currency}
                              value={String(draft.freight)}
                              onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
                            />
                          }
                        />
                      ) : null}
                      <TotalRow label="Tax" value={totals.tax} code={draft.currency} />
                      {totals.reverseCharge ? (
                        <TotalNote>
                          VAT of {draft.currency} {formatAmount(totals.reverseCharge)} won't be paid to the vendor: reverse-charge or import VAT remitted separately.
                        </TotalNote>
                      ) : null}
                      <TotalRow label="Total payment due" value={totals.total} code={draft.currency} strong />
                      {draft.currency !== 'PHP' && ctx.fx ? (
                        <Text variant="small" tone="muted">
                          ≈ PHP {formatAmount(totals.total * ctx.fx)} at {ctx.fx} ({formatDate(ctx.fxDate)} rate).
                        </Text>
                      ) : null}
                    </List.Group>
                  </fieldset>
                </div>
              </Section>
            </Panel.Body>
          )}
        </Panel>
      </Form>
      {showVendorCreate && (
        <VendorQuickCreate
          initialName=""
          onClose={() => setShowVendorCreate(false)}
          onCreated={handleVendorCreated}
        />
      )}
    </>
  );
}
