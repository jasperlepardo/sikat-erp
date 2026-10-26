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
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { blankPurchaseBlanketAgreement, newPbaLine, type PurchaseBlanketAgreement } from '../../../../mocks/purchaseBlanketAgreements';
import { blankPurchaseOrder, newPoLine } from '../../../../mocks/purchaseOrders';
import { formatDate, todayISO } from '../../../../services/dates';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { listPartnersByRole } from '../../../../services/partners';
import { pbaSeries } from '../../../../services/allSeries';
import { pbaNumber, pbaTotals, openQty, getPurchaseBlanketAgreement, listPurchaseBlanketAgreements, savePurchaseBlanketAgreement, type PbaInput } from '../../../../services/purchaseBlanketAgreements';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { useDocTitle } from '../../../../services/useDocTitle';
import { VendorCard } from '../../shared/VendorCard';
import { AgreementCard } from './AgreementCard';
import { GeneralTab } from './general';
import { AgreementLinesCard } from '../../../../components/agreements/AgreementLinesCard';
import { DocumentsTab } from './documents';
import { AgreementSummaryCard } from '../../../../components/agreements/AgreementSummaryCard';
import type { PbaDraft, PbaMasters } from './types';
import { NotFound, PrevNext, neighbours } from '../../../../components/form/DetailNav';
import { PBA_LIST_PATH, PBA_STATUS_INTENT, PO_LIST_PATH } from '../../paths';

type TabId = 'general' | 'lines' | 'documents' | 'attachments';
const TABS: { value: TabId; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'lines', label: 'Lines' },
  { value: 'documents', label: 'Documents' },
  { value: 'attachments', label: 'Attachments' },
];

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
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [draft, setDraft] = useState<PbaDraft | null | undefined>(
    isNew ? { ...blankPurchaseBlanketAgreement(CURRENT_USER_ID), lines: [] } : undefined,
  );
  const [m, setM] = useState<PbaMasters>();
  const [tab, setTab] = useState<TabId>('general');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('vendor'),
      listItems(),
      loadInventoryMasters(),
      pbaSeries.list(),
    ]).then(([vendors, items, inv, series]) => {
      if (cancelled) return;
      setM({ vendors, items, inv, pbaSeries: series });
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
        ? 'New purchase blanket agreement'
        : draft.status === 'Draft'
          ? 'Draft purchase blanket agreement'
          : pbaNumber(draft),
  );

  if (draft === undefined || !m) {
    return <Text tone="muted" className="p-4">Loading…</Text>;
  }
  if (draft === null) return <NotFound icon="handshake" title="Agreement not found" backTo={PBA_LIST_PATH} backLabel="Back to agreements" />;

  const readOnly = draft.status === 'Closed' || draft.status === 'Terminated';
  const added = draft.status !== 'Draft';
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
      approved: !getPurchasingSettings().requirePoApproval,
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
          blanketAgreement: pbaNumber(pba),
          agreementId: pba.id,
          agreementLineId: l.id,
        }),
      ),
    };
    navigate(`${PO_LIST_PATH}/new`, { state: { copyFrom: po } });
  };

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Approved' && draft.lines.some((l) => openQty(l) > 0)
      ? [{ label: 'Copy to Purchase Order', icon: 'receipt_long', onSelect: copyToPo }]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const title = isNew
    ? 'New purchase blanket agreement'
    : draft.status === 'Draft'
      ? 'Draft purchase blanket agreement'
      : pbaNumber(draft as PurchaseBlanketAgreement);

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="handshake"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          breadcrumbs={[{ label: 'Agreements', href: PBA_LIST_PATH }, { label: title }]}
          onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
          onBack={() => navigate(PBA_LIST_PATH)}
          trailing={
            isNew ? undefined : <PrevNext path={PBA_LIST_PATH} prevId={prevId} nextId={nextId} />
          }
          status={isNew ? undefined : <Badge size="small" intent={PBA_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              {readOnly ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(PBA_LIST_PATH)}>Cancel</Button>}
              {menu.length ? <MoreMenu items={menu} /> : null}
              {!readOnly && (
                <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                  {saving ? 'Saving…' : added ? 'Update' : 'Add'}
                </Button>
              )}
            </>
          }
        />

        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => TABS.find((x) => x.value === t)?.label ?? t} />

          {readOnly ? (
            <Alert intent="default" variant="outline" title={`This agreement is ${draft.status.toLowerCase()}`}>
              {draft.status === 'Terminated' && draft.terminationDate
                ? `Terminated on ${formatDate(draft.terminationDate)}. `
                : ''}
              Only remarks and attachments can be changed.
            </Alert>
          ) : null}

          <fieldset disabled={readOnly} className="contents">
            <VendorCard
              vendors={m.vendors}
              vendorId={draft.vendorId}
              vendor={vendor}
              readOnly={readOnly}
              added={added}
              error={errors.vendorId}
              pickVendor={pickVendor}
              contact={{ contactId: draft.contactId, onChange: (id) => update({ contactId: id }) }}
              vendorRef={{ value: draft.vendorRef, onChange: (v) => update({ vendorRef: v }), hint: "The vendor's own reference for this agreement." }}
              currency={{ value: draft.currency, readOnly: true }}
              phone={draft.phone}
              email={draft.email}
            />
            <AgreementCard draft={draft} update={update} m={m} added={added} />
          </fieldset>

          {/* ── Tabs ───────────────────────────────────────────────────────── */}
          <div>
            <Tabs
              variant="outline"
              value={tab}
              onValueChange={(v) => setTab(v as TabId)}
              items={TABS}
            />
          </div>

          <fieldset disabled={readOnly} className="contents">
            {tab === 'general' && (
              <GeneralTab draft={draft} update={update} m={m} readOnly={readOnly} />
            )}
            {tab === 'lines' && (
              <AgreementLinesCard side="purchase" draft={draft} update={update} m={m} readOnly={readOnly} newLine={newPbaLine} />
            )}
            {tab === 'documents' && <DocumentsTab pbaId={draft.id} />}
          </fieldset>

          {tab === 'attachments' && (
            <AttachmentsCard
              attachments={draft.attachments}
              onChange={(attachments) => update({ attachments })}
              emptyHint="Signed agreement, vendor confirmation, or supporting documents."
              withDescription
            />
          )}

          {draft.lines.length > 0 && tab !== 'documents' && (
            <AgreementSummaryCard side="purchase" currency={draft.currency} totals={totals} settlementProbability={draft.settlementProbability} />
          )}
        </Panel.Body>
      </Panel>
    </Form>
  );
}
