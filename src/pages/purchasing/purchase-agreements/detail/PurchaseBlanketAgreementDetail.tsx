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
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { type Errors } from '../../../../components/form/fields';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions } from '../../../../components/form/DetailActions';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { blankPurchaseBlanketAgreement, newPbaLine, type PurchaseBlanketAgreement } from '../../../../mocks/purchaseBlanketAgreements';
import { blankPurchaseOrder, newPoLine } from '../../../../mocks/purchaseOrders';
import { formatDate, todayISO } from '../../../../services/dates';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { listPartnersByRole } from '../../../../services/partners';
import { pbaSeries } from '../../../../services/allSeries';
import { pbaNumber, pbaTotals, openQty, getPurchaseBlanketAgreement, listPurchaseBlanketAgreements, savePurchaseBlanketAgreement, type PbaInput } from '../../../../services/purchaseBlanketAgreements';
import { needsApproval } from '../../../../services/approval';
import { currencies as currencyCollection } from '../../../../services/masterData';
import { useDocTitle } from '../../../../services/useDocTitle';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { VendorCard } from '../../shared/VendorCard';
import { VendorDetailsPanel } from '../../shared/VendorDetailsPanel';
import { AgreementCard } from './AgreementCard';
import { GeneralTab } from './general';
import { AgreementLinesCard } from '../../../../components/agreements/AgreementLinesCard';
import { AgreementSummaryCard } from '../../../../components/agreements/AgreementSummaryCard';
import type { PbaDraft, PbaMasters } from './types';
import { NotFound, neighbours, useDocTab } from '../../../../components/form/DetailNav';
import { PBA_LIST_PATH, PBA_NOUN, PBA_STATUS_INTENT, PO_LIST_PATH } from '../../paths';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

type TabId = 'general' | 'lines';
const TAB_LABEL: Record<string, string> = { general: 'General', lines: 'Lines', header: 'Agreement' };

function validate(d: PbaDraft): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  need(d.agreementMethod, 'header', 'agreementMethod', 'Select an agreement method.');
  need(d.startDate, 'header', 'startDate', 'Start date is required.');
  need(!d.endDate || d.endDate >= d.startDate, 'header', 'endDate', 'End date must be on or after the start date.');
  need(d.signingDate, 'header', 'signingDate', 'Signing date is required.');
  need(d.agreementType, 'general', 'agreementType', 'Select an agreement type.');
  if (d.agreementMethod === 'Items') {
    for (const [i, l] of d.lines.entries()) {
      const n = `Line ${i + 1}`;
      need(l.itemId, 'lines', `line:${l.id}:item`, `${n}: pick an item.`);
      need(l.plannedQty > 0, 'lines', `line:${l.id}:plannedQty`, `${n}: planned quantity must be more than 0.`);
      need(l.unitPrice >= 0, 'lines', `line:${l.id}:unitPrice`, `${n}: unit price can't be negative.`);
    }
  }
  return problems;
}

export function PurchaseBlanketAgreementDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <PbaForm key={id === 'new' ? location.key : id} />;
}

function PbaForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const copyFrom = (location.state as { copyFrom?: PbaDraft } | null)?.copyFrom;

  const [draft, setDraft] = useState<PbaDraft | null | undefined>(
    isNew ? { ...(copyFrom ?? { ...blankPurchaseBlanketAgreement(CURRENT_USER_ID), lines: [] }) } : undefined,
  );
  const [m, setM] = useState<PbaMasters>();
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${PBA_LIST_PATH}/${id}`, tabParam);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [vendorDetailsOpen, setVendorDetailsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('vendor'),
      listItems(),
      loadInventoryMasters(),
      pbaSeries.list(),
      currencyCollection.list(),
    ]).then(([vendors, items, inv, series, currencies]) => {
      if (cancelled) return;
      setM({ vendors, items, inv, pbaSeries: series, currencies });
    });
    if (!isNew && id) {
      getPurchaseBlanketAgreement(id).then((pba) => !cancelled && setDraft(pba ?? null));
      listPurchaseBlanketAgreements().then((all) => {
        if (cancelled) return;
        const sorted = [...all].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
        setSiblings(sorted.map((b) => (b.docNum ? pbaNumber(b) : b.id)));
      });
    }
    return () => { cancelled = true; };
  }, [id, isNew]);

  useDocTitle(
    draft == null || !draft.docNum
      ? undefined
      : isNew
        ? `New ${PBA_NOUN.one}`
        : draft.status === 'Draft'
          ? `Draft ${PBA_NOUN.one}`
          : pbaNumber(draft),
  );

  if (draft === undefined || !m) {
    return <Text tone="muted" className="p-4">Loading…</Text>;
  }
  if (draft === null) return <NotFound icon="handshake" title="Agreement not found" backTo={PBA_LIST_PATH} backLabel="Back to agreements" />;

  const added = draft.status !== 'Draft';
  // Once added (Approved onward), the commercial body locks — only status, remarks and
  // attachments can change. Terminal statuses also lock the status itself (no outgoing moves).
  const readOnly = added;
  const terminal = draft.status === 'Closed' || draft.status === 'Terminated';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));

  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? pbaNumber(draft as PurchaseBlanketAgreement) : draft.id));

  const totals = pbaTotals(draft);
  const vendor = m.vendors.find((v) => v.id === draft.vendorId);

  const update = (patch: Partial<PbaDraft>) => setDraft({ ...draft, ...patch });

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    if (!v) { update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '', currency: 'PHP', phone: '', email: '' }); return; }
    const phoneChannel = v.contactChannels.find((ch) => ch.type === 'Phone' || ch.type === 'Mobile');
    const emailChannel = v.contactChannels.find((ch) => ch.type === 'Email');
    update({ vendorId: v.id, vendorCode: v.code, vendorName: v.name, contactId: v.defaultContactId, currency: v.currency === 'All currencies' ? 'PHP' : v.currency, phone: phoneChannel?.value ?? '', email: emailChannel?.value ?? '', paymentTermId: v.vendorPaymentTermId });
  };

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    const found = validate(draft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const pba = await savePurchaseBlanketAgreement(draft as PbaInput, { asDraft });
      navigate(PBA_LIST_PATH, {
        state: {
          notice: asDraft
            ? `Draft saved — ${pba.vendorName}.`
            : `Purchase blanket agreement ${pbaNumber(pba)} ${isNew || draft.status === 'Draft' ? 'added' : 'updated'} — ${pba.vendorName}.`,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: PbaDraft = {
      ...structuredClone(draft),
      id: undefined,
      status: 'Draft',
      docNum: 0,
      startDate: today,
      signingDate: today,
      endDate: '',
      terminationDate: '',
      attachments: [],
      lines: draft.lines.map((l) => ({ ...l, id: newPbaLine().id, cumulativeQty: 0, cumulativeAmountLC: 0, cumulativeAmountFC: 0, cumulativeCommittedQty: 0, cumulativeCommittedAmountLC: 0, cumulativeCommittedAmountFC: 0, rowStatus: 'Open' as const })),
    };
    navigate(`${PBA_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const copyToPo = () => {
    const pba = draft as PurchaseBlanketAgreement;
    const openLines = draft.lines.filter((l) => openQty(l) > 0);
    const po = {
      ...blankPurchaseOrder(CURRENT_USER_ID),
      approved: !needsApproval('PO'),
      vendorId: draft.vendorId,
      vendorCode: draft.vendorCode,
      vendorName: draft.vendorName,
      contactId: draft.contactId,
      currency: draft.currency,
      paymentTermId: draft.paymentTermId,
      paymentMethod: draft.paymentMethod,
      shippingType: draft.shippingType,
      projectId: draft.projectId,
      lines: openLines.map((l) =>
        newPoLine({
          itemId: l.itemId,
          itemNo: l.itemNo,
          name: l.description,
          description: '',
          quantity: openQty(l),
          uomCode: l.uomCode,
          uomName: l.uomName,
          itemsPerUnit: l.itemsPerUnit,
          unitPrice: l.unitPrice,
          // Agreement lines don't carry a country of origin: start from the item's.
          countryOfOriginCode: m?.items.find((i) => i.id === l.itemId)?.countryOfOriginCode ?? '',
          warrantyTemplateId: m?.items.find((i) => i.id === l.itemId)?.warrantyTemplate ?? '',
          agreementId: pba.id,
          agreementLineId: l.id,
        }),
      ),
    };
    navigate(`${PO_LIST_PATH}/new`, { state: { copyFrom: po } });
  };

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Approved' && draft.lines.some((l) => openQty(l) > 0)
      ? [{ label: 'Create purchase order', icon: 'receipt_long', onSelect: copyToPo }]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
  ];

  const title = isNew
    ? `New ${PBA_NOUN.one}`
    : draft.status === 'Draft'
      ? `Draft ${PBA_NOUN.one}`
      : pbaNumber(draft as PurchaseBlanketAgreement);

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PageHeader
          variant="plain"
          icon="handshake"
          parent={{ noun: PBA_NOUN, to: PBA_LIST_PATH }}
          title={title}
          tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
          status={isNew ? undefined : <Badge size="small" intent={PBA_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <DetailActions
              noun={PBA_NOUN}
              listPath={PBA_LIST_PATH}
              mode={!added ? 'draft' : terminal ? 'readonly' : 'open'}
              remarksOnly={terminal}
              busy={saving}
              onDraft={() => submit(null, true)}
              onSubmit={() => submit(null)}
              menu={menu}
              prevNext={isNew ? undefined : { path: PBA_LIST_PATH, prevId, nextId }}
            />
          }
        />

        {page === 'transactions' ? (
          <Panel.Body>
            {added && draft.id ? (
              <DocumentFlow
                kind="PBA"
                id={draft.id}
                notes="Purchase orders and their downstream documents drawn from this agreement."
              />
            ) : (
              <Text variant="small" tone="muted" className="p-4">Transactions will show here once the agreement is added.</Text>
            )}
          </Panel.Body>
        ) : page === 'activity' ? (
          <Panel.Body>
            <ActivityTab target={{ kind: 'PBA', id: draft.id ?? '' }} partnerId={draft.vendorId} />
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId] ?? t} />

            {readOnly ? (
              <Alert intent="default" variant="outline" title={`This agreement is ${draft.status.toLowerCase()}`}>
                {draft.status === 'Terminated' && draft.terminationDate
                  ? `Terminated on ${formatDate(draft.terminationDate)}. `
                  : ''}
                {`Only ${terminal ? '' : 'its status, '}remarks and attachments can be changed.`}
              </Alert>
            ) : null}

            {draft.lines.length > 0 && (
              <AgreementSummaryCard side="purchase" currency={draft.currency} totals={totals} settlementProbability={draft.settlementProbability} />
            )}
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
              <div className="flex flex-col gap-2 lg:col-span-8">
                <VendorCard
                  vendors={m.vendors}
                  vendorId={draft.vendorId}
                  vendor={vendor}
                  readOnly={readOnly}
                  added={added}
                  error={errors.vendorId}
                  pickVendor={pickVendor}
                  onOpenDetails={() => setVendorDetailsOpen(true)}
                />
                <AgreementLinesCard side="purchase" draft={draft} update={update} m={m} readOnly={readOnly} newLine={newPbaLine} />
                {/* Attachments stay editable at every status. */}
                <AttachmentsCard
                  attachments={draft.attachments}
                  onChange={(attachments) => update({ attachments })}
                  emptyHint="Signed agreement, vendor confirmation, or supporting documents."
                  withDescription
                />
              </div>

              <aside className="flex flex-col gap-2 lg:col-span-4">
                <AgreementCard draft={draft} update={update} m={m} added={added} readOnly={readOnly} />
                <GeneralTab draft={draft} update={update} m={m} readOnly={readOnly} terminal={terminal} />
              </aside>
            </div>
          </Panel.Body>
        )}
      </Panel>
    </Form>
    <VendorDetailsPanel
      draft={draft}
      update={update}
      vendor={vendor}
      currencies={m.currencies}
      readOnly={readOnly}
      open={vendorDetailsOpen}
      onClose={() => setVendorDetailsOpen(false)}
      vendorRefHint="The vendor's own reference for this agreement."
      currency={{ disabled: true, tooltip: "Set by the vendor's currency." }}
      addresses={[]}
    />
    </>
  );
}
