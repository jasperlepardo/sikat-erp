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
import { blankBlanketAgreement, newBaLine, type BlanketAgreement } from '../../../../mocks/blanketAgreements';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { listPartnersByRole } from '../../../../services/partners';
import { baSeries } from '../../../../services/allSeries';
import { baNumber, baTotals, getBlanketAgreement, listBlanketAgreements, saveBlanketAgreement, type BaInput } from '../../../../services/blanketAgreements';
import { projectDef } from '../../../settings/masterDefs';
import { useDocTitle } from '../../../../services/useDocTitle';
import { GeneralTab } from './GeneralTab';
import { DetailsTab } from './DetailsTab';
import { DocumentsTab } from './DocumentsTab';
import { BA_LIST_PATH, BA_STATUS_INTENT } from '../BlanketAgreementList';
import type { BaDraft, BaMasters } from './types';

type TabId = 'general' | 'details' | 'documents' | 'attachments' | 'recurring';
const TABS: { value: TabId; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'details', label: 'Details' },
  { value: 'documents', label: 'Documents' },
  { value: 'attachments', label: 'Attachments' },
  { value: 'recurring', label: 'Recurring Transactions' },
];


function validate(d: BaDraft): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  need(d.agreementMethod, 'header', 'agreementMethod', 'Select an agreement method.');
  need(d.startDate, 'header', 'startDate', 'Start date is required.');
  need(!d.endDate || d.endDate >= d.startDate, 'header', 'endDate', 'End date must be on or after the start date.');
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

export function BlanketAgreementDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <BaForm key={id === 'new' ? location.key : id} />;
}

function BaForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [draft, setDraft] = useState<BaDraft | null | undefined>(
    isNew ? { ...blankBlanketAgreement(CURRENT_USER_ID), lines: [] } : undefined,
  );
  const [m, setM] = useState<BaMasters>();
  const [tab, setTab] = useState<TabId>('general');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('customer'),
      listItems(),
      loadInventoryMasters(),
      baSeries.list(),
    ]).then(([customers, items, inv, series]) => {
      if (cancelled) return;
      setM({ customers, items, inv, baSeries: series });
    });
    if (!isNew && id) {
      getBlanketAgreement(id).then((ba) => !cancelled && setDraft(ba ?? null));
      listBlanketAgreements().then((all) => {
        if (cancelled) return;
        const sorted = [...all].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
        setSiblings(sorted.map((b) => (b.docNum ? baNumber(b) : b.id)));
      });
    }
    return () => { cancelled = true; };
  }, [id, isNew]);

  useDocTitle(
    draft == null || !draft.docNum
      ? undefined
      : isNew
        ? 'New blanket agreement'
        : draft.status === 'Draft'
          ? 'Draft blanket agreement'
          : baNumber(draft),
  );

  if (draft === undefined || !m) {
    return <Text tone="muted" className="p-4">Loading…</Text>;
  }
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="description" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="Agreement not found" />
        <Panel.Body>
          <Button onClick={() => navigate(BA_LIST_PATH)}>Back to agreements</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const readOnly = draft.status === 'Closed' || draft.status === 'Terminated';
  const added = draft.status !== 'Draft';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));

  const at = draft.id ? siblings.indexOf(draft.docNum ? baNumber(draft as BlanketAgreement) : draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;

  const totals = baTotals(draft);
  const customer = m.customers.find((c) => c.id === draft.customerId);

  const update = (patch: Partial<BaDraft>) => setDraft({ ...draft, ...patch });
  const f = bind(draft, update);

  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    if (!c) {
      update({ customerId: '', customerCode: '', customerName: '', contactId: '', currency: 'PHP', phone: '', email: '' });
      return;
    }
    const phoneChannel = c.contactChannels.find((ch) => ch.type === 'Phone' || ch.type === 'Mobile');
    const emailChannel = c.contactChannels.find((ch) => ch.type === 'Email');
    update({
      customerId: c.id,
      customerCode: c.code,
      customerName: c.name,
      contactId: c.defaultContactId,
      currency: c.currency === 'All currencies' ? 'PHP' : c.currency,
      phone: phoneChannel?.value ?? '',
      email: emailChannel?.value ?? '',
      paymentTermId: c.customerPaymentTermId,
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    const doc: BaDraft = { ...draft };
    const found = validate(doc);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const ba = await saveBlanketAgreement(doc as BaInput, { asDraft });
      navigate(BA_LIST_PATH, {
        state: {
          notice: asDraft
            ? `Draft saved — ${ba.customerName}.`
            : `Blanket agreement ${baNumber(ba)} ${isNew || draft.status === 'Draft' ? 'added' : 'updated'} — ${ba.customerName}.`,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: BaDraft = {
      ...structuredClone(draft),
      id: undefined,
      status: 'Draft',
      docNum: 0,
      startDate: today,
      signingDate: today,
      endDate: '',
      terminationDate: '',
      attachments: [],
      lines: draft.lines.map((l) => ({ ...l, id: newBaLine().id, cumulativeQty: 0, cumulativeAmountLC: 0, cumulativeAmountFC: 0, cumulativeCommittedQty: 0, cumulativeCommittedAmountLC: 0, cumulativeCommittedAmountFC: 0, rowStatus: 'Open' as const })),
    };
    navigate(`${BA_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(customer ? [{ label: `Open customer ${customer.code}`, icon: 'person', onSelect: () => navigate(`/sales/customers/${customer.id}`) }] : []),
  ];

  const title = isNew
    ? 'New blanket agreement'
    : draft.status === 'Draft'
      ? 'Draft blanket agreement'
      : baNumber(draft as BlanketAgreement);

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="description"
          iconIntent="primary"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          title={title}
          trailing={
            isNew ? undefined : (
              <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
                <IconButton type="button" label="Previous" size="small" shape="pill" disabled={!prevId} onClick={() => navigate(`${BA_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
                <IconButton type="button" label="Next" size="small" shape="pill" disabled={!nextId} onClick={() => navigate(`${BA_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
              </ButtonGroup>
            )
          }
          status={isNew ? undefined : <Badge size="small" intent={BA_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(BA_LIST_PATH)}>
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
            <Section icon="person" title="Customer">
              <Fields cols={2}>
                <div className="md:col-span-2">
                  <CardField
                    label="Customer"
                    required
                    placeholder="Search customers"
                    options={m.customers
                      .filter((c) => c.status !== 'Inactive' || c.id === draft.customerId)
                      .map((c): CardFieldOption => ({
                        value: c.id,
                        label: c.name,
                        icon: <Icon size={16}>person</Icon>,
                        fields: [
                          { label: 'Code', value: c.code },
                          ...(c.tin ? [{ label: 'TIN', value: c.tin }] : []),
                        ],
                      }))}
                    value={draft.customerId}
                    onValueChange={(id) => pickCustomer(id || null)}
                    readOnly={!!(customer && added)}
                  />
                  {errors.customerId && <Text variant="small" tone="danger">{errors.customerId}</Text>}
                </div>

                <CardField
                  label="Contact person"
                  options={(customer?.contacts ?? [])
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
                  placeholder={customer ? 'Select a contact person' : 'Pick a customer first'}
                  readOnly={readOnly || !customer}
                />

                {f.text('customerRef', 'Customer ref. no.', { hint: "The customer's own reference for this agreement." })}
                <ReadOnly label="BP currency" value={draft.currency} hint="Set by the customer." />
                <ReadOnly label="Telephone no." value={draft.phone || '—'} hint="From the customer record." />
                <ReadOnly label="E-mail" value={draft.email || '—'} hint="From the customer record." />
              </Fields>
            </Section>

            <Section icon="event_note" title="Agreement">
              <Fields cols={2}>
                <FieldStack>
                  {f.lookup(
                    'seriesId',
                    'No. (series)',
                    m.baSeries
                      .filter((s) => s.active || s.id === draft.seriesId)
                      .map((s) => ({ value: s.id, label: s.name })),
                    { required: true, readOnly: added },
                  )}
                </FieldStack>
                <ReadOnly label="Document no." value={draft.docNum ? baNumber(draft as BlanketAgreement) : 'Assigned on Add'} />

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
                {f.date('signingDate', 'Signing date')}
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
              <GeneralTab draft={draft} update={update} errors={errors} m={m} readOnly={readOnly} />
            )}
            {tab === 'details' && (
              <DetailsTab draft={draft} update={update} m={m} readOnly={readOnly} />
            )}
            {tab === 'documents' && <DocumentsTab />}
            {tab === 'recurring' && (
              <Section icon="repeat" title="Recurring Transactions">
                <Text tone="muted" variant="small">
                  Recurring transaction templates linked to this agreement will appear here.
                </Text>
              </Section>
            )}
          </fieldset>

          {tab === 'attachments' && (
            <AttachmentsCard
              attachments={draft.attachments}
              onChange={(attachments) => update({ attachments })}
              emptyHint="Signed agreement, customer's approval, or supporting documents."
              withDescription
            />
          )}

          {/* ── Totals footer ─────────────────────────────────────────────── */}
          {draft.lines.length > 0 && tab !== 'documents' && tab !== 'recurring' && (
            <Section icon="functions" title="Summary">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <Text variant="small" tone="muted">Planned total</Text>
                  <Text weight="semibold" tone="heading">{draft.currency} {formatAmount(totals.plannedTotal)}</Text>
                </div>
                <div>
                  <Text variant="small" tone="muted">Committed</Text>
                  <Text weight="semibold">{draft.currency} {formatAmount(totals.committedTotal)}</Text>
                </div>
                <div>
                  <Text variant="small" tone="muted">Fulfilled</Text>
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
