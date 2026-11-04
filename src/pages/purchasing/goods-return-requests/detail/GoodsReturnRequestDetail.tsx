import { createPortal } from 'react-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Form, Panel, Tabs } from '@jasperlepardo/sikat-design-system';
import { DocumentDetailSkeleton } from '../../../../components/form/skeletons/DocumentDetailSkeleton';
import { PageHeader } from '../../../../components/form/PageHeader';
import { DetailColumns } from '../../../../components/form/DetailColumns';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions } from '../../../../components/form/DetailActions';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { type Errors } from '../../../../components/form/fields';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { blankGoodsReturnRequest, type GoodsReturnRequest } from '../../../../mocks/goodsReturnRequests';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { currencies, exchangeRates, rateOn, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { companyTax } from '../../../../services/masterData';
import {
  closeGoodsReturnRequest,
  getGoodsReturnRequest,
  grrNumber,
  listGoodsReturnRequests,
  saveGoodsReturnRequest,
  type GrrInput,
} from '../../../../services/goodsReturnRequests';
import { todayISO, formatDate } from '../../../../services/dates';
import { useDocTitle } from '../../../../services/useDocTitle';
import { neighbours, NotFound, siblingKeys, useDocTab } from '../../../../components/form/DetailNav';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { VendorCard } from '../../shared/VendorCard';
import { VendorDetailsPanel } from '../../shared/VendorDetailsPanel';
import { CopyPanel } from '../../shared/CopyPanel';
import { GRR_LIST_PATH, GRR_NOUN, GRR_STATUS_INTENT, RETURN_LIST_PATH, RETURN_NOUN, RETURN_STATUS_INTENT } from '../../paths';
import { cap } from '../../../../components/form/noun';
import { LineRollup, type RollupDocRow } from '../../../../components/form/LineRollup';
import { useAsync } from '../../../../services/useAsync';
import { listGoodsReturns, returnNumber } from '../../../../services/goodsReturns';
import { grrDoc } from './grrDoc';
import { purchaseView } from '../../shared/purchaseView';
import { DocumentDates } from '../../../../components/form/DatesCard';
import { AssignmentCard } from '../../../../components/form/AssignmentCard';
import { goodsReturnRequestDates } from '../../../documentDateDefs';
import { GrrDocumentCard } from './GrrDocumentCard';
import { buildGrrContext, type GrrDraft, type GrrMasters } from './types';

type TabId = 'contents';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

function validate(d: GrrDraft): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  need(d.postingDate, 'header', 'postingDate', 'Request date is required.');
  need(d.lines.length, 'contents', 'lines', 'Add at least one line.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    need(l.itemId, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.returnReason, 'contents', `line:${l.id}:returnReason`, `${n}: pick a return reason.`);
  }
  return problems;
}

export function GoodsReturnRequestDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <GrrForm key={id === 'new' ? location.key : id} />;
}

function GrrForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [draft, setDraft] = useState<GrrDraft | null | undefined>(
    isNew ? { ...blankGoodsReturnRequest(todayISO(), CURRENT_USER_ID), lines: [] } : undefined,
  );
  const [m, setM] = useState<GrrMasters>();
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [creatingReturn, setCreatingReturn] = useState(false);
  const [vendorDetailsOpen, setVendorDetailsOpen] = useState(false);
  const [currencyView, setCurrencyView] = useState('');
  const [contentTab, setContentTab] = useState<'item' | 'returns'>('item');
  const goodsReturnsList = useAsync(listGoodsReturns, []);

  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${GRR_LIST_PATH}/${id}`, tabParam);

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
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates]) => {
      setM({ vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates });
    });
    if (isNew || !id) return;
    let cancelled = false;
    getGoodsReturnRequest(id).then((r) => !cancelled && setDraft(r ?? null));
    listGoodsReturnRequests().then((all) => !cancelled && setSiblings(siblingKeys(all, grrNumber)));
    return () => { cancelled = true; };
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? `New ${GRR_NOUN.one}` : grrNumber(draft as GoodsReturnRequest)) : undefined);

  if (draft === undefined || !m) return <DocumentDetailSkeleton />;
  if (draft === null) return <NotFound icon="assignment_return" title="Goods return request not found" backTo={GRR_LIST_PATH} backLabel="Back to return requests" />;

  const ctx = buildGrrContext(draft);
  const fx = draft.currency === 'PHP' ? 1 : (rateOn(m.rates, draft.currency, draft.postingDate)?.rate ?? 0);
  const view = purchaseView(draft.currency, fx, draft.postingDate, currencyView, setCurrencyView);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? grrNumber(draft as GoodsReturnRequest) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const saved = draft as GoodsReturnRequest;

  const update = (patch: Partial<GrrDraft>) => setDraft((d) => d ? { ...d, ...patch } : d);

  const pickVendor = (vendorId: string | null) => {
    const v = vendorId ? m.vendors.find((x) => x.id === vendorId) : undefined;
    if (!v) return update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '' });
    update({ vendorId: v.id, vendorCode: v.code, vendorName: v.name, contactId: v.defaultContactId });
  };

  const submit = async (e: FormEvent | null) => {
    e?.preventDefault();
    const found = validate(draft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const result = await saveGoodsReturnRequest(draft as GrrInput);
      navigate(GRR_LIST_PATH, { state: { notice: `Return request ${grrNumber(result)} saved — ${result.vendorName}.` } });
    } finally {
      setSaving(false);
    }
  };

  const closeIt = async () => {
    setSaving(true);
    try {
      const result = await closeGoodsReturnRequest(saved);
      navigate(GRR_LIST_PATH, { state: { notice: `Return request ${grrNumber(result)} closed.` } });
    } finally {
      setSaving(false);
    }
  };

  // Copy to Goods Return: carry the picked open lines as return lines.
  const createReturn = (picks: { lineId: string; qty: number }[]) => {
    const poDraft = {
      baseGrrId: saved.id,
      lines: picks.flatMap(({ lineId, qty }) => {
        const l = draft.lines.find((x) => x.id === lineId && x.status === 'Open' && x.itemId);
        return l ? [{
          id: `rl-${crypto.randomUUID().slice(0, 8)}`,
          itemId: l.itemId, itemNo: l.itemNo, name: l.description, description: l.description,
          quantity: qty, openQty: qty,
          uomCode: l.uomCode, uomName: l.uomName, itemsPerUnit: l.itemsPerUnit,
          unitPrice: l.unitPrice, discountPct: l.discountPct, taxCode: l.taxCode,
          warehouse: l.warehouse, freeText: l.freeText ?? '', requisitionSlipNo: l.requisitionSlipNo,
          returnReason: l.returnReason, countryOfOriginCode: l.countryOfOriginCode, warrantyTemplateId: l.warrantyTemplateId, glAccount: l.glAccount,
          baseType: '' as const, creditedQty: 0, binId: '', binCode: '', packages: 0,
          lineVendorId: '', priceListId: l.priceListId,
          unitCostLc: 0, grrLineId: l.id,
        }] : [];
      }),
    };
    navigate(`${RETURN_LIST_PATH}/new`, { state: { fromGrr: saved.id, prefill: poDraft } });
  };

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' && draft.lines.some((l) => l.status === 'Open' && l.itemId)
      ? [{ label: 'Create goods return', icon: 'assignment_return', onSelect: () => setCreatingReturn(true) }]
      : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
  ];

  const vendor = m.vendors.find((v) => v.id === draft.vendorId);

  const title = isNew ? `New ${GRR_NOUN.one}` : draft.docNum ? grrNumber(draft as GoodsReturnRequest) : `Draft ${GRR_NOUN.one}`;

  // Second content tab: each requested line's downstream goods returns (linked by grrLineId).
  const counts = (d: { status: string }) => d.status !== 'Draft' && d.status !== 'Cancelled';
  const rollupLines = draft.lines
    .filter((l) => l.itemId)
    .map((l) => ({ id: l.id, itemNo: l.itemNo, description: l.description, quantity: l.quantity, uomCode: l.uomCode }));
  const returnDocsFor = (lineId: string): RollupDocRow[] =>
    (goodsReturnsList ?? []).filter(counts).filter((r) => r.baseGrrId === draft.id).flatMap((r) =>
      r.lines
        .filter((rl) => rl.grrLineId === lineId)
        .map((rl): RollupDocRow => ({ id: rl.id, no: returnNumber(r), href: `#${RETURN_LIST_PATH}/${r.docNum ? returnNumber(r) : r.id}`, date: r.postingDate, status: r.status, intent: RETURN_STATUS_INTENT[r.status], quantity: rl.quantity, uomCode: rl.uomCode })));
  const showRollups = !isNew && ctx.added && !!draft.id;
  const contentTabs = (
    <Tabs
      variant="solid"
      className="w-fit max-w-full self-start"
      value={contentTab}
      onValueChange={(v) => setContentTab(v as 'item' | 'returns')}
      items={[
        { value: 'item', label: cap(GRR_NOUN.lineLabel!) },
        { value: 'returns', label: cap(RETURN_NOUN.many) },
      ]}
    />
  );

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => e.preventDefault()} noValidate>
        <Panel className="flex-1">
          <PageHeader
            variant="plain"
            icon="assignment_return"
            parent={{ noun: GRR_NOUN, to: GRR_LIST_PATH }}
            title={title}
            tabs={!ctx.added ? undefined : (
              <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p }))} />
            )}
            status={isNew ? undefined : <Badge size="small" intent={GRR_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <DetailActions
                noun={GRR_NOUN}
                listPath={GRR_LIST_PATH}
                mode={!ctx.added ? 'draft' : ctx.readOnly ? 'readonly' : 'open'}
                draft={draft}
                onRevert={setDraft}
                remarksOnly={ctx.readOnly}
                busy={saving}
                onSubmit={() => submit(null)}
                menu={menu}
                prevNext={isNew ? undefined : { path: GRR_LIST_PATH, prevId, nextId }}
              />
            }
          />

          {page === 'transactions' && ctx.added ? (
            <Panel.Body>
              <DocumentFlow kind="GRR" id={saved.id} notes="Goods returns created from this request." />
            </Panel.Body>
          ) : page !== 'details' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'GRR', id: saved.id ?? '' }} partnerId={draft.vendorId} />
            </Panel.Body>
          ) : (
            <DetailColumns
              header={
                <>
                  <ProblemsAlert problems={problems} tabLabel={() => 'Contents'} />
                  {ctx.readOnly ? (
                    <Alert intent="default" variant="outline" title="This request is closed">
                      {draft.closeDate ? `Closed ${formatDate(draft.closeDate)}.` : 'No further changes.'}
                    </Alert>
                  ) : null}
                </>
              }
              main={
                <>
                  <VendorCard
                    vendors={m.vendors}
                    vendorId={draft.vendorId}
                    vendor={vendor}
                    readOnly={ctx.readOnly}
                    locked={ctx.added}
                    error={errors.vendorId}
                    tooltip="The vendor the goods go back to."
                    pickVendor={pickVendor}
                    onOpenDetails={() => setVendorDetailsOpen(true)}
                  />
                  {showRollups ? contentTabs : null}
                  {showRollups && contentTab === 'returns' ? (
                    <LineRollup title={cap(RETURN_NOUN.many)} lines={rollupLines} loading={!goodsReturnsList} docsFor={(l) => returnDocsFor(l.id)} empty="No goods returns created from this request yet." />
                  ) : (
                    <DocLines {...grrDoc({ draft, update, errors, m, onCopyClick: () => setCopying(true), canCopy: Boolean(draft.vendorId) }, view)} />
                  )}
                  <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach photos of damage or supporting documents." />
                </>
              }
              aside={
                <>
                  <GrrDocumentCard draft={draft} update={update} errors={errors} ctx={ctx} m={m} />
                  <DocumentDates def={goodsReturnRequestDates} draft={draft} update={update} errors={errors} />
                  <AssignmentCard draft={draft} update={update} readOnly={ctx.readOnly} person={{ key: 'buyerId', label: 'Buyer', hint: 'Who placed the order.' }} ownerHint="Owns the document (data access)." remarksHint="Can be changed after the request is added." />
                </>
              }
            />
          )}
        </Panel>
      </Form>
      <VendorDetailsPanel
        draft={draft}
        update={update}
        vendor={vendor}
        readOnly={ctx.readOnly}
        open={vendorDetailsOpen}
        onClose={() => setVendorDetailsOpen(false)}
        vendorRefLabel="Vendor RMA no."
        vendorRefHint="The vendor's return authorization (RMA) no."
        addresses={[]}
      />
      {copying
        ? createPortal(
            <CopyPanel
              sources={[
                {
                  key: 'line' as const,
                  label: 'Add lines by item',
                  totalHeader: 'Qty',
                  qtyHeader: 'Return',
                  hint: 'Add items you need to return to this vendor.',
                  docs: [],
                },
              ]}
              taken={new Set()}
              onCancel={() => setCopying(false)}
              onCopy={() => setCopying(false)}
            />,
            document.body,
          )
        : null}
      {creatingReturn
        ? createPortal(
            <CopyPanel
              title="Create goods return"
              icon="assignment_return"
              partyCard={<VendorCard vendors={m.vendors} vendorId={saved.vendorId} vendor={vendor} readOnly={false} locked pickVendor={() => {}} />}
              sources={[{
                key: 'GRR' as const,
                label: 'Goods return requests',
                totalHeader: 'Requested',
                qtyHeader: 'Return',
                hint: 'Return the open requested lines; leave one unticked to skip it, or lower its quantity.',
                docs: [{
                  id: saved.id,
                  label: grrNumber(saved),
                  description: saved.postingDate,
                  lines: draft.lines
                    .filter((l) => l.status === 'Open' && l.openQty > 0 && l.itemId)
                    .map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.description, warehouse: l.warehouse ?? '', total: `${l.openQty} ${l.uomCode}`, open: l.openQty })),
                }],
              }]}
              taken={new Set()}
              onCancel={() => setCreatingReturn(false)}
              onCopy={(_type, _docId, picks) => {
                setCreatingReturn(false);
                createReturn(picks);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
