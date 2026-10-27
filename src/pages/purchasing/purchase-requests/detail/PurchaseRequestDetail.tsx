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
} from '@jasperlepardo/sikat-design-system';
import { type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import {
  blankPurchaseRequest,
  type PrStatus,
  type PurchaseRequest,
} from '../../../../mocks/purchaseRequests';
import { blankPurchaseOrder, newPoLine } from '../../../../mocks/purchaseOrders';
import { blankRfq, newRfqLine } from '../../../../mocks/rfqs';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { taxCodes, taxGroups } from '../../../../services/masterData';
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
import { buildContext, type PrDraft, type PrMasters } from './types';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { todayISO } from '../../../../services/dates';
import { useDocTitle } from '../../../../services/useDocTitle';
import { neighbours, NotFound, PrevNext, useDocTab } from '../../../../components/form/DetailNav';
import { PO_LIST_PATH, PR_LIST_PATH, PR_STATUS_INTENT, RFQ_LIST_PATH } from '../../paths';

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
    need(l.quantity >= copiedQty(l), 'contents', `line:${l.id}:quantity`, `${n}: ${copiedQty(l)} already copied to an RFQ or PO; quantity can't go below that.`);
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

  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${PR_LIST_PATH}/${id}`, tabParam);
  const [saving, setSaving] = useState(false);
  const [requesterDetailsOpen, setRequesterDetailsOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      employees.list(),
      listItems(),
      loadInventoryMasters(),
      taxCodes.list(),
      taxGroups.list(),
      listPartnersByRole('vendor'),
    ]).then(([emps, items, inv, codes, groups, vendors]) => {
      setM({ employees: emps, items, inv, tax: { codes, groups, company: undefined as never, withholding: [], withholdingGroups: [] }, vendors });
    });
    if (isNew || !id) return;
    let cancelled = false;
    getPurchaseRequest(id).then((pr) => !cancelled && setDraft(pr ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const docTitle = draft?.docNum ? (isNew ? 'New request' : prNumber(draft as PurchaseRequest)) : undefined;
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
      approved: !getPurchasingSettings().requirePoApproval,
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

  // Copy to purchase quotation: the open lines become an RFQ to send vendors for pricing.
  // Same lineage as Copy to purchase order — the request's open quantities are drawn when the RFQ is added.
  const copyToRfq = () => {
    const today = todayISO();
    const open = draft.lines.filter((l) => l.status === 'Open' && (l.openQty ?? l.quantity) > 0 && l.itemId);
    const rfqDraft = {
      ...blankRfq(CURRENT_USER_ID),
      ownerId: draft.ownerId || CURRENT_USER_ID,
      postingDate: today,
      documentDate: today,
      requiredDate: draft.requiredDate,
      freight: draft.freight,
      basePrId: saved.id,
      lines: open.map((l) =>
        newRfqLine({
          itemId: l.itemId, itemNo: l.itemNo, description: l.description,
          requiredDate: l.requiredDate, quantity: l.openQty ?? l.quantity,
          uomCode: l.uomCode, uomName: l.uomName, itemsPerUnit: l.itemsPerUnit,
          priceListId: l.priceListId, unitPrice: l.unitPrice, discountPct: l.discountPct,
          taxCode: l.taxCode, requisitionSlipNo: l.requisitionSlipNo, lineVendorId: l.lineVendorId,
          countryOfOriginCode: l.countryOfOriginCode, warrantyTemplateId: l.warrantyTemplateId, glAccount: l.glAccount,
          baseId: saved.id, baseLineId: l.id, baseDocNo: prNumber(saved),
        }),
      ),
      remarks: `From purchase request ${prNumber(saved)}.${draft.remarks ? ` ${draft.remarks}` : ''}`,
    };
    navigate(`${RFQ_LIST_PATH}/new`, { state: { copyFrom: rfqDraft } });
  };

  const transitions: Partial<Record<PrStatus, () => void>> =
    draft.status === 'Open' ? { Closed: closeIt } : {};
  const sectionProps = { draft, update, errors, m, ctx };

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' ? [{ label: 'Close request', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Open' && draft.lines.some((l) => l.status === 'Open' && l.itemId)
      ? [
          { label: 'Copy to purchase quotation', icon: 'request_quote', onSelect: copyToRfq },
          { label: 'Copy to purchase order', icon: 'receipt_long', onSelect: copyToPo },
        ]
      : []),
  ];

  const title = isNew
    ? 'New purchase request'
    : draft.docNum
      ? prNumber(draft as PurchaseRequest)
      : 'Purchase request';

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="inbox"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          breadcrumbs={[{ label: 'Purchase Requests', href: PR_LIST_PATH }, { label: title }]}
          onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
          onBack={() => navigate(PR_LIST_PATH)}
          trailing={
            isNew ? undefined : <PrevNext path={PR_LIST_PATH} prevId={prevId} nextId={nextId} />
          }
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
            <>
              {ctx.readOnly ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(PR_LIST_PATH)}>Cancel</Button>}
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : ctx.added ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />

        {page === 'transactions' && ctx.added ? (
          <Panel.Body>
            <DocumentFlow kind="PR" id={(draft as PurchaseRequest).id} notes="RFQs raised from this request, and the purchase orders they became." />
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
                  hint={ctx.copied && !ctx.readOnly ? 'Locked: lines were already copied to an RFQ or PO.' : undefined}
                  pickRequester={pickRequester}
                  onOpenDetails={() => setRequesterDetailsOpen(true)}
                />
                <DocLines {...prDoc(sectionProps)} />
                <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach supporting documents, e.g. specs, approvals or quotes." />
              </div>
              <div className="flex flex-col gap-2 lg:col-span-4">
                <fieldset disabled={ctx.readOnly} className="contents">
                  <PrDocumentCard {...sectionProps} transitions={transitions} />
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
    </>
  );
}

