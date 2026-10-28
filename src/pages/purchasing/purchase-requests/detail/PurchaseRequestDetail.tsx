import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Form,
  Panel,
  Tabs,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../../components/form/PageHeader';
import { type Errors } from '../../../../components/form/fields';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions } from '../../../../components/form/DetailActions';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import {
  blankPurchaseRequest,
  type PrStatus,
  type PurchaseRequest,
} from '../../../../mocks/purchaseRequests';
import { blankPurchaseOrder, newPoLine } from '../../../../mocks/purchaseOrders';
import type { Rfq } from '../../../../mocks/rfqs';
import { addPurchaseOrders, listPurchaseOrders, type PoInput } from '../../../../services/purchaseOrders';
import { needsApproval } from '../../../../services/approval';
import { addRfqs, listRfqsForPr } from '../../../../services/rfqs';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { exchangeRates, taxCodes, taxGroups } from '../../../../services/masterData';
import { employeeName, employees } from '../../../../services/employees';
import { listPartnersByRole } from '../../../../services/partners';
import {
  closePurchaseRequest,
  getPurchaseRequest,
  listPurchaseRequests,
  copiedQty,
  prNumber,
  savePurchaseRequest,
  type PrInput,
} from '../../../../services/purchaseRequests';
import { RequesterCard } from '../../shared/RequesterCard';
import { RequesterDetailsPanel } from '../../shared/RequesterDetailsPanel';
import { PrDocumentCard } from './PrDocumentCard';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { prDoc } from './prDoc';
import { PrTotalsCard } from './PrTotalsCard';
import { PrVendorsCard } from './PrVendorsCard';
import { FanOutRfqPanel, type VendorSend } from './FanOutRfqPanel';
import { AwardPoPanel } from './AwardPoPanel';
import { ComparisonTab, type Award } from './comparison';
import { poDraftFromRfq } from '../../shared/poFromRfq';
import { openPrLines, rfqDraftFromPr } from '../../shared/rfqFromPr';
import type { PurchaseOrder } from '../../../../mocks/purchaseOrders';
import { buildContext, type PrDraft, type PrMasters } from './types';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { todayISO } from '../../../../services/dates';
import { useDocTitle } from '../../../../services/useDocTitle';
import { neighbours, NotFound, useDocTab } from '../../../../components/form/DetailNav';
import { PO_LIST_PATH, PO_NOUN, PR_LIST_PATH, PR_NOUN, PR_STATUS_INTENT, RFQ_NOUN } from '../../paths';

type TabId = 'contents';

/** Top-level views in the panel header. */
const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

function validate(d: PrDraft, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.requesterId, 'header', 'requesterId', 'Pick a requester.');
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  if (asDraft) return problems;

  need(d.lines.length, 'contents', 'lines', 'Add at least one line.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    need(l.itemId, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.quantity >= copiedQty(l), 'contents', `line:${l.id}:quantity`, `${n}: ${copiedQty(l)} already ordered on a purchase order; quantity can't go below that.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
  }
  return problems;
}

export function PurchaseRequestDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <PurchaseRequestForm key={id === 'new' ? location.key : id} />;
}

function PurchaseRequestForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  // New requests default to the employee the current user buys as.
  const currentUser = employees.snapshot().find((e) => e.active && e.salesEmployeeId === CURRENT_USER_ID);
  const blank = blankPurchaseRequest(todayISO(), currentUser, currentUser ? employeeName(currentUser) : '');

  const [draft, setDraft] = useState<PrDraft | null | undefined>(
    isNew ? { ...blank, lines: [] } : undefined,
  );
  const [m, setM] = useState<PrMasters>();
  const [siblings, setSiblings] = useState<string[]>([]);

  useEffect(() => {
    if (!isNew)
      listPurchaseRequests().then((all) =>
        setSiblings(
          [...all]
            .sort((a, b) => b.postingDate.localeCompare(a.postingDate))
            .map((r) => (r.docNum ? prNumber(r) : r.id)),
        ),
      );
  }, [isNew]);

  // The request's quotations (the Comparison view) and the purchase orders awarded from it (the Award panel).
  const [quotes, setQuotes] = useState<{ rfqs: Rfq[]; pos: PurchaseOrder[] }>({ rfqs: [], pos: [] });
  const savedId = draft?.id;
  const loadQuotes = (prId: string) =>
    Promise.all([listRfqsForPr(prId), listPurchaseOrders()]).then(([rfqs, pos]) => setQuotes({ rfqs, pos }));
  useEffect(() => {
    if (savedId) void loadQuotes(savedId);
  }, [savedId]);

  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  // The Contents card's view: the lines, or the vendors' quotes side by side (once anyone was asked).
  const [contentTab, setContentTab] = useState<'item' | 'comparison'>('item');
  const setPage = useDocTab<PageId>(`${PR_LIST_PATH}/${id}`, tabParam);
  const [saving, setSaving] = useState(false);
  const [requesterDetailsOpen, setRequesterDetailsOpen] = useState(false);
  const [panel, setPanel] = useState<'fan-out' | 'award' | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.all([
      employees.list(),
      listItems(),
      loadInventoryMasters(),
      taxCodes.list(),
      taxGroups.list(),
      listPartnersByRole('vendor'),
      exchangeRates.list(),
    ]).then(([emps, items, inv, codes, groups, vendors, rates]) => {
      setM({ employees: emps, items, inv, tax: { codes, groups, company: undefined as never, withholding: [], withholdingGroups: [] }, vendors, rates });
    });
    if (isNew || !id) return;
    let cancelled = false;
    getPurchaseRequest(id).then((pr) => !cancelled && setDraft(pr ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const docTitle = draft?.docNum ? (isNew ? `New ${PR_NOUN.one}` : prNumber(draft as PurchaseRequest)) : undefined;
  useDocTitle(docTitle);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading purchase request…</Text>;
  if (draft === null) return <NotFound icon="inbox" title="Purchase request not found" backTo={PR_LIST_PATH} backLabel="Back to requests" />;

  const ctx = buildContext(draft, m);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? prNumber(draft as PurchaseRequest) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const saved = draft as PurchaseRequest;

  const update = (patch: Partial<PrDraft>) => setDraft((d) => d ? { ...d, ...patch } : d);

  const requester = m.employees.find((e) => e.id === draft.requesterId);
  // Branch and department describe who asked, so they come from the requester and are stamped on
  // the request — a later move to another department doesn't rewrite it.
  const pickRequester = (requesterId: string | null) => {
    const emp = requesterId ? m.employees.find((e) => e.id === requesterId) : undefined;
    update({
      requesterId: requesterId ?? '',
      requesterName: emp ? employeeName(emp) : '',
      branchId: emp?.branchId ?? '',
      departmentId: emp?.departmentId ?? '',
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    const found = validate(draft, asDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const result = await savePurchaseRequest(draft as PrInput);
      navigate(PR_LIST_PATH, {
        state: {
          notice: `Purchase request ${prNumber(result)} saved — ${result.requesterName || 'no requester'}.`,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const closeIt = async () => {
    setSaving(true);
    try {
      const result = await closePurchaseRequest(saved);
      navigate(PR_LIST_PATH, {
        state: { notice: `Purchase request ${prNumber(result)} closed.` },
      });
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: PrDraft = {
      ...structuredClone(draft),
      id: undefined,
      docNum: 0,
      status: 'Open',
      postingDate: today,
      documentDate: today,
      closeDate: '',
      lines: draft.lines.map((l) => ({
        ...l,
        id: `ln-${crypto.randomUUID().slice(0, 8)}`,
        openQty: l.quantity,
        status: 'Open' as const,
      })),
    };
    navigate(`${PR_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  // Copy to purchase order: carry the open lines and header context into a new PO draft.
  // A request is pre-vendor, so the buyer picks the vendor on the PO (which derives currency,
  // payment terms and addresses); every line field — including each line's preferred vendor —
  // carries across. Only lines still open (not yet converted) are copied, at their open qty.
  const copyToPo = () => {
    const today = todayISO();
    const open = draft.lines.filter((l) => l.status === 'Open' && (l.openQty ?? l.quantity) > 0 && l.itemId);
    const poDraft = {
      ...blankPurchaseOrder(CURRENT_USER_ID),
      approved: !needsApproval('PO'),
      ownerId: draft.ownerId || CURRENT_USER_ID,
      postingDate: today,
      documentDate: today,
      requiredDate: draft.requiredDate,
      freight: draft.freight,
      // Lineage back to this request: header link + each line's source request line.
      basePrId: saved.id,
      lines: open.map((l) =>
        newPoLine({
          itemId: l.itemId, itemNo: l.itemNo, name: l.description, description: l.description,
          quantity: l.openQty ?? l.quantity, uomCode: l.uomCode, uomName: l.uomName,
          itemsPerUnit: l.itemsPerUnit, priceListId: l.priceListId, unitPrice: l.unitPrice,
          discountPct: l.discountPct, taxCode: l.taxCode, warehouse: l.warehouse,
          departmentId: l.departmentId, freeText: l.freeText, requisitionSlipNo: l.requisitionSlipNo,
          requiredDate: l.requiredDate, lineVendorId: l.lineVendorId, countryOfOriginCode: l.countryOfOriginCode, warrantyTemplateId: l.warrantyTemplateId, glAccount: l.glAccount,
          baseId: saved.id, baseLineId: l.id, baseDocNo: prNumber(saved),
        }),
      ),
      remarks: `From purchase request ${prNumber(saved)}.${draft.remarks ? ` ${draft.remarks}` : ''}`,
    };
    navigate(`${PO_LIST_PATH}/new`, { state: { copyFrom: poDraft } });
  };

  // Create purchase quotations: one numbered quotation per vendor, each with the lines routed to it.
  const sendRfqs = async (sends: VendorSend[]) => {
    setSaving(true);
    try {
      const today = todayISO();
      const approved = !needsApproval('RFQ');
      const opts = { ownerId: draft.ownerId || CURRENT_USER_ID, today, approved, rates: m.rates, warehouses: m.inv.warehouses };
      const created = await addRfqs(
        sends.flatMap((s) => {
          const vendor = m.vendors.find((v) => v.id === s.vendorId);
          return vendor ? [rfqDraftFromPr(saved, vendor, s.lines, opts)] : [];
        }),
      );
      await loadQuotes(saved.id);
      setPanel(null);
      setNotice(`${created.length === 1 ? `1 ${RFQ_NOUN.one}` : `${created.length} ${RFQ_NOUN.many}`} created — ${created.map((q) => q.vendorName).join(', ')}. Enter each vendor's quote on its ${RFQ_NOUN.one}, then compare them here.`);
      setContentTab('comparison');
    } finally {
      setSaving(false);
    }
  };

  // Award: one purchase order per vendor. A single PO opens for review; several are saved as drafts.
  const award = async (awards: Award[]) => {
    const opts = { buyerId: CURRENT_USER_ID, approved: !needsApproval('PO'), today: todayISO(), pr: saved };
    const byVendor = new Map<string, PoInput>();
    for (const a of awards) {
      const po = poDraftFromRfq(a.rfq, { ...opts, lineQtys: a.lineQtys });
      const same = byVendor.get(a.rfq.vendorId);
      if (same) byVendor.set(a.rfq.vendorId, { ...same, lines: [...same.lines, ...po.lines] });
      else byVendor.set(a.rfq.vendorId, po);
    }
    const drafts = [...byVendor.values()];
    if (drafts.length === 1) {
      navigate(`${PO_LIST_PATH}/new`, { state: { copyFrom: drafts[0] } });
      return;
    }
    setSaving(true);
    try {
      await addPurchaseOrders(drafts);
      navigate(PO_LIST_PATH, {
        state: { notice: `${drafts.length} draft purchase orders created from ${prNumber(saved)} — ${drafts.map((d) => d.vendorName).join(', ')}. Open each to confirm.` },
      });
    } finally {
      setSaving(false);
    }
  };

  const transitions: Partial<Record<PrStatus, () => void>> =
    draft.status === 'Open' ? { Closed: closeIt } : {};
  const sectionProps = { draft, update, errors, m, ctx };

  // The Item / Comparison switch sits at the top of the Contents card body, as on a PO (Item / Receipts).
  const showComparison = ctx.added && quotes.rfqs.length > 0;
  const contentTabs = (
    <Tabs
      variant="primary"
      // The card body is a flex column, which would stretch the bar full width.
      className="w-fit max-w-full self-start"
      value={contentTab}
      onValueChange={(v) => setContentTab(v as 'item' | 'comparison')}
      items={[
        { value: 'item', label: 'Item' },
        { value: 'comparison', label: 'Comparison' },
      ]}
    />
  );
  const withTabsOnTop = (lines: ReturnType<typeof prDoc>): ReturnType<typeof prDoc> => ({
    ...lines,
    description: undefined,
    header: (
      <>
        {contentTabs}
        <Text variant="small" tone="muted">{lines.description}</Text>
        {lines.header}
      </>
    ),
  });

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' && draft.lines.some((l) => l.status === 'Open' && l.itemId)
      ? [
          ...(!isNew ? [{ label: `Create ${RFQ_NOUN.many}…`, icon: 'request_quote', onSelect: () => setPanel('fan-out') }] : []),
          { label: 'Create purchase order', icon: 'receipt_long', onSelect: copyToPo },
          ...(quotes.rfqs.some((q) => q.lines.some((l) => l.quotedQty > 0))
            ? [{ label: `Create ${PO_NOUN.one} from a quote…`, icon: 'shopping_cart', onSelect: () => setPanel('award') }]
            : []),
        ]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
  ];

  const title = isNew
    ? `New ${PR_NOUN.one}`
    : draft.docNum
      ? prNumber(draft as PurchaseRequest)
      : `Draft ${PR_NOUN.one}`;

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PageHeader
          variant="plain"
          icon="inbox"
          parent={{ noun: PR_NOUN, to: PR_LIST_PATH }}
          title={title}
          tabs={
            // A request has no transactions or activity until it's added.
            !ctx.added ? undefined : (
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
              <Badge size="small" intent={PR_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
            )
          }
          actions={
            <DetailActions
              noun={PR_NOUN}
              listPath={PR_LIST_PATH}
              mode={!ctx.added ? 'draft' : ctx.readOnly ? 'readonly' : 'open'}
              remarksOnly={ctx.readOnly}
              busy={saving}
              onSubmit={() => submit(null)}
              menu={menu}
              prevNext={isNew ? undefined : { path: PR_LIST_PATH, prevId, nextId }}
            />
          }
        />

        {notice ? (
          <div className="px-2 pt-2">
            <Alert intent="success" variant="outline" title="Sent">
              {notice}
            </Alert>
          </div>
        ) : null}
        {page === 'transactions' && ctx.added ? (
          <Panel.Body>
            <DocumentFlow kind="PR" id={(draft as PurchaseRequest).id} notes="Purchase quotations raised from this request, and the purchase orders they became." />
          </Panel.Body>
        ) : page === 'activity' && ctx.added ? (
          <Panel.Body>
            <ActivityTab target={{ kind: 'PR', id: (draft as PurchaseRequest).id }} />
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={() => 'Contents'} />
            {ctx.readOnly ? (
              <Alert intent="default" variant="outline" title="This request is closed">
                Only remarks can change{draft.closeDate ? ` (closed ${draft.closeDate})` : ''}.
              </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
              <div className="flex flex-col gap-2 lg:col-span-8">
                <RequesterCard
                  employees={m.employees}
                  requesterId={draft.requesterId}
                  requester={requester}
                  readOnly={ctx.added}
                  locked={ctx.added}
                  error={errors.requesterId}
                  hint={ctx.copied && !ctx.readOnly ? 'Locked: lines were already ordered on a purchase order.' : undefined}
                  pickRequester={pickRequester}
                  onOpenDetails={() => setRequesterDetailsOpen(true)}
                />
                {showComparison && contentTab === 'comparison' ? (
                  <ComparisonTab pr={saved} m={m} rfqs={quotes.rfqs} pos={quotes.pos} tabs={contentTabs} />
                ) : (
                  <DocLines {...(showComparison ? withTabsOnTop(prDoc(sectionProps)) : prDoc(sectionProps))} />
                )}
                <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach supporting documents, e.g. specs, approvals or quotes." />
              </div>
              <div className="flex flex-col gap-2 lg:col-span-4">
                <fieldset disabled={ctx.readOnly} className="contents">
                  <PrDocumentCard {...sectionProps} transitions={transitions} />
                  <PrVendorsCard {...sectionProps} />
                  <PrTotalsCard {...sectionProps} />
                </fieldset>
              </div>
            </div>
          </Panel.Body>
        )}
      </Panel>
    </Form>
    <RequesterDetailsPanel
      draft={draft}
      update={update}
      requester={requester}
      readOnly={ctx.added}
      open={requesterDetailsOpen}
      onClose={() => setRequesterDetailsOpen(false)}
    />
    {panel === 'fan-out' && openPrLines(saved).length ? (
      <FanOutRfqPanel pr={saved} m={m} sending={saving} onCancel={() => setPanel(null)} onSend={sendRfqs} />
    ) : panel === 'award' ? (
      <AwardPoPanel pr={saved} rfqs={quotes.rfqs} pos={quotes.pos} onCancel={() => setPanel(null)} onAward={(a) => award([a])} />
    ) : null}
    </>
  );
}

