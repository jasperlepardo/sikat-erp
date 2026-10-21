import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Form,
  Panel,
  PanelHeader,
  Tabs,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { type Partner } from '../../../../mocks/partners';
import { blankRfq, type Rfq, type RfqStatus } from '../../../../mocks/rfqs';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { loadCurrentCompany } from '../../../../services/companies';
import { addRfq, cancelRfq, closeRfq, getRfq, listRfqs, recallRfq, rfqNumber, saveRfqDraft, seriesOf } from '../../../../services/rfqs';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { logRejection } from '../../../../services/approvalRules';
import { PoVendorQuickCreate } from '../../purchase-orders/detail/PoVendorQuickCreate';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { ReferencesTable } from '../../shared/ReferencesTable';
import {
  ALL_CURRENCIES,
  buildContext,
  defaultShipTo,
  formatAddress,
  proposedTaxCode,
  vendorAddressFields,
  type RfqDraft,
  type RfqMasters,
} from './types';
import { todayISO } from '../../../../services/dates';
import { blankPurchaseOrder, newPoLine } from '../../../../mocks/purchaseOrders';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { NotFound, PrevNext, neighbours } from '../../../../components/form/DetailNav';
import { VendorCard } from '../../shared/VendorCard';
import { VendorDetailsPanel } from '../../shared/VendorDetailsPanel';
import { RfqDocumentCard } from './RfqDocumentCard';
import { RfqAssignmentCard } from './RfqTotalsCard';
import { PurchDoc } from '../../shared/PurchDoc';
import { rfqDoc } from './rfqDoc';
import { RfqDeliveryCard } from './RfqDeliveryCard';
import { RfqJournalPaymentCard } from './RfqJournalPaymentCard';
import { RfqDatesCard } from './RfqDatesCard';
import { STATUS_INTENT } from './types';
export { STATUS_INTENT };

export const RFQ_LIST_PATH = '/purchasing/purchase-quotations';

type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

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
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: required quantity must be more than 0.`);
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
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const copyFrom = (location.state as { copyFrom?: RfqDraft } | null)?.copyFrom;

  const blank = blankRfq(CURRENT_USER_ID);
  const rfqApproved = !getPurchasingSettings().requireRfqApproval;
  const [draft, setDraft] = useState<RfqDraft | null | undefined>(
    isNew ? { ...(copyFrom ?? blank), approved: rfqApproved } : undefined,
  );
  const [m, setM] = useState<RfqMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = (v: PageId) => navigate(`${RFQ_LIST_PATH}/${id}/${v}`, { replace: true });
  useEffect(() => { if (!tabParam) navigate(`${RFQ_LIST_PATH}/${id}/details`, { replace: true, state: location.state }); }, []);
  const [siblings, setSiblings] = useState<string[]>([]);
  useEffect(() => {
    if (!isNew)
      listRfqs().then((all) =>
        setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((q) => (q.docNum ? rfqNumber(q) : q.id))),
      );
  }, [isNew]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [showVendorCreate, setShowVendorCreate] = useState(false);
  const [vendorDetailsOpen, setVendorDetailsOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

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
      const masters: RfqMasters = { vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours };
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
      ? isNew ? 'New purchase quotation' : draft.status === 'Draft' ? 'Draft purchase quotation' : rfqNumber(draft)
      : undefined,
  );

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading purchase quotation…</Text>;
  if (draft === null) return <NotFound icon="description" title="Purchase quotation not found" backTo={RFQ_LIST_PATH} backLabel="Back to purchase quotations" />;

  const ctx = buildContext(draft, m);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? rfqNumber(draft as Rfq) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));

  const update = (patch: Partial<RfqDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const pickVendor = (vendorId: string | null, override?: Partner) => {
    const v = override ?? m.vendors.find((x) => x.id === vendorId);
    if (!v) return update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '' });
    const billAddr = v.addresses.find((a) => a.id === v.defaultBillToId) ?? v.addresses[0];
    update({
      vendorId: v.id, vendorCode: v.code, vendorName: v.name, contactId: v.defaultContactId,
      currency: v.currency === ALL_CURRENCIES ? 'PHP' : v.currency,
      paymentTermId: v.vendorPaymentTermId, paymentMethod: v.defaultPaymentMethod,
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

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<RfqDraft> = {}) => {
    e?.preventDefault();
    const doc: RfqDraft = { ...draft, ...overrides };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const saved = effectiveDraft ? await saveRfqDraft(doc) : await addRfq(doc);
      navigate(RFQ_LIST_PATH, {
        state: {
          notice: effectiveDraft
            ? `Draft saved — ${saved.vendorName}.`
            : saved.status === 'Not Confirmed'
            ? `Purchase quotation ${rfqNumber(saved)} submitted for approval.`
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
      approved: !getPurchasingSettings().requirePoApproval,
      vendorId: draft.vendorId, vendorCode: draft.vendorCode, vendorName: draft.vendorName,
      contactId: draft.contactId, vendorRef: draft.vendorRef, currency: draft.currency,
      paymentTermId: draft.paymentTermId, paymentMethod: draft.paymentMethod,
      shippingType: draft.shippingType, shipTo: draft.shipTo, projectId: draft.projectId,
      journalRemark: draft.journalRemark.replace('Quotations', 'Orders'),
      postingDate: today, documentDate: today,
      lines: draft.lines.filter((l) => l.itemId).map((l) =>
        newPoLine({
          itemId: l.itemId, itemNo: l.itemNo, name: l.description, description: l.description,
          quantity: l.quotedQty || l.quantity, uomCode: l.uomCode, uomName: l.uomName,
          itemsPerUnit: l.itemsPerUnit, priceListId: l.priceListId, unitPrice: l.unitPrice,
          discountPct: l.discountPct, taxCode: l.taxCode,
          blanketAgreement: l.blanketAgreement, requisitionSlipNo: l.requisitionSlipNo,
        }),
      ),
      remarks: `From RFQ ${rfqNumber(draft as Rfq)}.`,
    };
    navigate('/purchasing/purchase-orders/new', { state: { copyFrom: poDraft } });
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: RfqDraft = {
      ...structuredClone(draft), id: undefined, status: 'Draft', docNum: 0, vendorRef: '',
      postingDate: today, documentDate: today, validUntil: '', convertedToPoId: '',
      lines: draft.lines.map((l) => ({ ...l, id: `rl-${crypto.randomUUID().slice(0, 8)}`, quotedQty: 0, quotedDate: '' })),
    };
    navigate(`${RFQ_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as Rfq;
  const open = draft.status === 'Open';
  const recallIt = () => act(() => recallRfq(saved), 'recalled to draft');
  const rejectIt = async () => {
    await logRejection('RFQ', saved.id, saved.vendorId, rejectionReason);
    await recallRfq(saved);
    navigate(RFQ_LIST_PATH, { state: { notice: `Purchase quotation ${rfqNumber(saved)} rejected and returned to draft.` } });
  };

  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Approve', icon: 'check_circle', onSelect: () => submit(null, false, { approved: true }) }, { label: 'Recall', icon: 'undo', onSelect: recallIt }, { label: 'Reject', icon: 'cancel', onSelect: () => setRejecting(true) }] : []),
    ...(open ? [
      { label: 'Copy to purchase order', icon: 'shopping_cart', onSelect: copyToPo },
      { label: 'Close', icon: 'task_alt', onSelect: () => act(() => closeRfq(saved), 'closed') },
      { label: 'Cancel', icon: 'cancel', onSelect: () => act(() => cancelRfq(saved), 'cancelled') },
    ] : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(ctx.vendor ? [{ label: `Open vendor ${ctx.vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${ctx.vendor!.id}`) }] : []),
  ];

  const transitions: Partial<Record<RfqStatus, () => void>> =
    draft.status === 'Draft'
      ? draft.approved ? { Open: () => submit(null, false) } : { 'Not Confirmed': () => submit(null, false) }
      : draft.status === 'Not Confirmed'
        ? { Open: () => submit(null, false, { approved: true }) }
        : open
          ? { Closed: () => act(() => closeRfq(saved), 'closed'), Cancelled: () => act(() => cancelRfq(saved), 'cancelled') }
          : {};

  const title = isNew ? 'New purchase quotation' : draft.status === 'Draft' ? 'Draft purchase quotation' : rfqNumber(draft);
  const sectionProps = { draft, update, errors, m, ctx };

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
            breadcrumbs={[{ label: 'Purchase Quotations', href: RFQ_LIST_PATH }, { label: title }]}
            onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
            onBack={() => navigate(RFQ_LIST_PATH)}
            trailing={isNew ? undefined : <PrevNext path={RFQ_LIST_PATH} prevId={prevId} nextId={nextId} />}
            tabs={
              isNew ? undefined : (
                <Tabs
                  variant="outline"
                  value={page}
                  onValueChange={(v) => setPage(v as PageId)}
                  items={PAGES.map((p) => ({ ...p }))}
                />
              )
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
                {ctx.readOnly ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(RFQ_LIST_PATH)}>Cancel</Button>}
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
                <ActivityTab target={{ kind: 'RFQ', id: draft.id ?? '' }} partnerId={draft.vendorId} />
              )}
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' }[t])} />
              {rejecting ? (
                <Alert intent="danger" variant="outline" title="Reject purchase quotation">
                  <div className="flex flex-col gap-2">
                    <TextField aria-label="Rejection reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.currentTarget.value)} placeholder="Explain why…" />
                    <div className="flex gap-2">
                      <Button type="button" intent="danger" variant="solid" size="small" onClick={rejectIt}>Confirm reject</Button>
                      <Button type="button" intent="white" variant="solid" size="small" onClick={() => { setRejecting(false); setRejectionReason(''); }}>Cancel</Button>
                    </div>
                  </div>
                </Alert>
              ) : null}
              {ctx.readOnly ? (
                <Alert intent="default" variant="outline" title={`This quotation is ${draft.status.toLowerCase()}`}>
                  Only remarks can change{draft.convertedToPoId ? ` (converted to a purchase order)` : ''}.
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
                <div className="flex flex-col gap-2 lg:col-span-8">
                  <VendorCard vendors={m.vendors} vendorId={draft.vendorId} vendor={ctx.vendor} readOnly={ctx.readOnly} added={ctx.added} error={errors.vendorId} pickVendor={pickVendor} onNewVendor={() => setShowVendorCreate(true)} onOpenDetails={() => setVendorDetailsOpen(true)} />
                  <PurchDoc {...rfqDoc(sectionProps)} />
                  <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={ctx.readOnly} description="Other documents this RFQ refers to — purchase requests, sales orders, contract references." />
                  <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the vendor's quotation or price list." />
                </div>
                <div className="flex flex-col gap-2 lg:col-span-4">
                  <RfqDocumentCard {...sectionProps} transitions={transitions} />
                      <RfqDeliveryCard {...sectionProps} />
                  <RfqJournalPaymentCard {...sectionProps} />
                  <RfqDatesCard {...sectionProps} />
                  <RfqAssignmentCard {...sectionProps} />
                </div>
              </div>
            </Panel.Body>
          )}
        </Panel>
      </Form>
      <VendorDetailsPanel
        draft={draft}
        update={update}
        vendor={ctx.vendor}
        currencies={m.currencies}
        readOnly={ctx.readOnly}
        open={vendorDetailsOpen}
        onClose={() => setVendorDetailsOpen(false)}
        onVendorSaved={(v) => setM((prev) => prev && { ...prev, vendors: prev.vendors.map((x) => (x.id === v.id ? v : x)) })}
        vendorRefHint="The vendor's own reference or quote number."
        currency={{
          disabled: !!(ctx.vendor && ctx.added),
          tooltip: ctx.vendor && ctx.vendor.currency !== ALL_CURRENCIES ? "Defaults to the vendor's currency." : 'Pick the document currency.',
          error: errors.currency,
        }}
        addresses={ctx.vendor ? vendorAddressFields(m, ctx.vendor) : []}
      />
      {showVendorCreate && (
        <PoVendorQuickCreate initialName="" onClose={() => setShowVendorCreate(false)} onCreated={handleVendorCreated} />
      )}
    </>
  );
}
