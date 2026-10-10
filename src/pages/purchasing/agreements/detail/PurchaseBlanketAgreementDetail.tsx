import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  CardField,
  Form,
  Icon,
  IconButton,
  Panel,
  PanelHeader,
  panelHeaderIcons,
  Tabs,
  Text,
  type CardFieldOption,
} from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { Fields, FieldStack, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { contactName } from '../../../../mocks/partners';
import { blankPurchaseBlanketAgreement, newPbaLine, type PurchaseBlanketAgreement } from '../../../../mocks/purchaseBlanketAgreements';
import { blankPurchaseOrder, newPoLine } from '../../../../mocks/purchaseOrders';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { listPartnersByRole } from '../../../../services/partners';
import { pbaSeries } from '../../../../services/allSeries';
import { pbaNumber, pbaTotals, openQty, getPurchaseBlanketAgreement, listPurchaseBlanketAgreements, savePurchaseBlanketAgreement, type PbaInput } from '../../../../services/purchaseBlanketAgreements';
import { PO_LIST_PATH } from '../../orders/detail/PurchaseOrderDetail';
import { projectDef } from '../../../settings/masterDefs';
import { useDocTitle } from '../../../../services/useDocTitle';
import { GeneralTab } from './GeneralTab';
import { DetailsTab } from './DetailsTab';
import { DocumentsTab } from './DocumentsTab';
import { PBA_LIST_PATH, PBA_STATUS_INTENT } from '../PurchaseBlanketAgreementList';
import type { PbaDraft, PbaMasters } from './types';

type TabId = 'general' | 'details' | 'documents' | 'attachments';
const TABS: { value: TabId; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'details', label: 'Details' },
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
      need(l.itemId, 'details', `line:${l.id}:item`, `${n}: pick an item.`);
      need(l.plannedQty > 0, 'details', `line:${l.id}:plannedQty`, `${n}: planned quantity must be more than 0.`);
      need(l.unitPrice >= 0, 'details', `line:${l.id}:unitPrice`, `${n}: unit price can't be negative.`);
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
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="handshake" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="Agreement not found" />
        <Panel.Body>
          <Button onClick={() => navigate(PBA_LIST_PATH)}>Back to agreements</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const readOnly = draft.status === 'Closed' || draft.status === 'Terminated';
  const added = draft.status !== 'Draft';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));

  const at = draft.id ? siblings.indexOf(draft.docNum ? pbaNumber(draft as PurchaseBlanketAgreement) : draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;

  const totals = pbaTotals(draft);
  const vendor = m.vendors.find((v) => v.id === draft.vendorId);

  const update = (patch: Partial<PbaDraft>) => setDraft({ ...draft, ...patch });
  const f = bind(draft, update);

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    if (!v) {
      update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '', currency: 'PHP', phone: '', email: '' });
      return;
    }
    const phoneChannel = v.contactChannels.find((ch) => ch.type === 'Phone' || ch.type === 'Mobile');
    const emailChannel = v.contactChannels.find((ch) => ch.type === 'Email');
    update({
      vendorId: v.id,
      vendorCode: v.code,
      vendorName: v.name,
      contactId: v.defaultContactId,
      currency: v.currency === 'All currencies' ? 'PHP' : v.currency,
      phone: phoneChannel?.value ?? '',
      email: emailChannel?.value ?? '',
      paymentTermId: v.vendorPaymentTermId,
    });
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
          iconIntent="primary"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          title={title}
          trailing={
            isNew ? undefined : (
              <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
                <IconButton type="button" label="Previous" size="small" shape="pill" disabled={!prevId} onClick={() => navigate(`${PBA_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
                <IconButton type="button" label="Next" size="small" shape="pill" disabled={!nextId} onClick={() => navigate(`${PBA_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
              </ButtonGroup>
            )
          }
          status={isNew ? undefined : <Badge size="small" intent={PBA_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(PBA_LIST_PATH)}>
                {readOnly ? 'Back' : 'Cancel'}
              </Button>
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

          {/* ── Header fields ─────────────────────────────────────────────── */}
          <fieldset disabled={readOnly} className="contents">
            <Section icon="local_shipping" title="Vendor">
              <Fields cols={2}>
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
                        icon: <Icon size={16}>local_shipping</Icon>,
                        fields: [
                          { label: 'Code', value: v.code },
                          ...(v.tin ? [{ label: 'TIN', value: v.tin }] : []),
                        ],
                      }))}
                    value={draft.vendorId}
                    onValueChange={(id) => pickVendor(id || null)}
                    readOnly={!!(vendor && added)}
                  />
                  {errors.vendorId && <Text variant="small" tone="danger">{errors.vendorId}</Text>}
                </div>

                <CardField
                  label="Contact person"
                  options={(vendor?.contacts ?? [])
                    .filter((c) => c.active || c.id === draft.contactId)
                    .map((c) => ({
                      value: c.id,
                      label: contactName(c),
                      icon: <Icon size={16}>person</Icon>,
                      fields: [
                        ...(c.position ? [{ label: 'Position', value: c.position }] : []),
                        ...(c.mobile || c.tel1 ? [{ label: 'Phone', value: c.mobile || c.tel1 }] : []),
                        ...(c.email ? [{ label: 'Email', value: c.email }] : []),
                      ],
                    }))}
                  value={draft.contactId}
                  onValueChange={(contactId) => update({ contactId: contactId ?? '' })}
                  placeholder={vendor ? 'Select a contact person' : 'Pick a vendor first'}
                  readOnly={readOnly || !vendor}
                />

                {f.text('vendorRef', 'Vendor ref. no.', { hint: "The vendor's own reference for this agreement." })}
                <ReadOnly label="BP currency" value={draft.currency} hint="Set by the vendor." />
                <ReadOnly label="Telephone no." value={draft.phone || '—'} hint="From the vendor record." />
                <ReadOnly label="E-mail" value={draft.email || '—'} hint="From the vendor record." />
              </Fields>
            </Section>

            <Section icon="event_note" title="Agreement">
              <Fields cols={2}>
                <FieldStack>
                  {f.lookup(
                    'seriesId',
                    'No. (series)',
                    m.pbaSeries
                      .filter((s) => s.active || s.id === draft.seriesId)
                      .map((s) => ({ value: s.id, label: s.name })),
                    { required: true, readOnly: added },
                  )}
                </FieldStack>
                <ReadOnly label="Document no." value={draft.docNum ? pbaNumber(draft as PurchaseBlanketAgreement) : 'Assigned on Add'} />

                {f.choose(
                  'agreementMethod',
                  'Agreement method',
                  [
                    { value: 'Items', label: 'Items method' },
                    { value: 'Money', label: 'Money method' },
                  ],
                  { required: true, readOnly: added, hint: 'Items method tracks quantities per line; Money method tracks a total value.' },
                )}

                {f.date('startDate', 'Start date', { required: true })}
                {f.date('endDate', 'End date')}
                {f.master('projectId', 'Business partner project', projectDef, { clearable: true })}
                <ReadOnly
                  label="Termination date"
                  value={draft.terminationDate ? formatDate(draft.terminationDate) : '—'}
                  hint="Set automatically when the agreement is terminated."
                />
                {f.date('signingDate', 'Signing date', { required: true })}
                {f.text('description', 'Description', { hint: 'Free-text description of the agreement.' })}
              </Fields>
            </Section>
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
            {tab === 'details' && (
              <DetailsTab draft={draft} update={update} m={m} readOnly={readOnly} />
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

          {/* ── Totals footer ─────────────────────────────────────────────── */}
          {draft.lines.length > 0 && tab !== 'documents' && (
            <Section icon="functions" title="Summary">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <Text variant="small" tone="muted">Planned total</Text>
                  <Text weight="semibold" tone="heading">{draft.currency} {formatAmount(totals.plannedTotal)}</Text>
                </div>
                <div>
                  <Text variant="small" tone="muted">Ordered</Text>
                  <Text weight="semibold">{draft.currency} {formatAmount(totals.committedTotal)}</Text>
                </div>
                <div>
                  <Text variant="small" tone="muted">Received</Text>
                  <Text weight="semibold">{draft.currency} {formatAmount(totals.cumulativeTotal)}</Text>
                </div>
                <div>
                  <Text variant="small" tone="muted">Open</Text>
                  <Text weight="semibold" tone={totals.openTotal === 0 ? 'muted' : 'default'}>
                    {draft.currency} {formatAmount(totals.openTotal)}
                  </Text>
                </div>
              </div>
              {draft.settlementProbability > 0 && (
                <Text variant="small" tone="muted" className="mt-2">
                  Settlement probability: {draft.settlementProbability}%
                </Text>
              )}
            </Section>
          )}
        </Panel.Body>
      </Panel>
    </Form>
  );
}
