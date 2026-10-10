import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Checkbox,
  Form,
  FormField,
  IconButton,
  List,
  Panel,
  PanelHeader,
  panelHeaderIcons,
  Select,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { Fields, FieldStack, Flags, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import {
  BRANCHES,
  PR_STATUSES,
  blankPurchaseRequest,
  type PrStatus,
  type PurchaseRequest,
} from '../../../../mocks/purchaseRequests';
import { DEPARTMENTS } from '../../../../mocks/purchaseOrders';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { taxCodes, taxGroups } from '../../../../services/masterData';
import { salesEmployees } from '../../../../services/partnerMasters';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import {
  closePurchaseRequest,
  getPurchaseRequest,
  listPurchaseRequests,
  prNumber,
  prSeries,
  prTotals,
  savePurchaseRequest,
  seriesOf,
  type PrInput,
} from '../../../../services/purchaseRequests';
import { ContentsTab } from './ContentsTab';
import { buildContext, type PrDraft, type PrMasters } from './types';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { todayISO } from '../../../../services/dates';
import { useDocTitle } from '../../../../services/useDocTitle';

export const PR_LIST_PATH = '/purchasing/requests';

type TabId = 'contents';

export const STATUS_INTENT: Record<PrStatus, 'default' | 'primary' | 'success' | 'danger'> = {
  Open: 'primary',
  Closed: 'success',
};

const STATUS_HINT: Record<PrStatus, string> = {
  Open: 'Active request — items still needed.',
  Closed: 'All items fulfilled or request cancelled.',
};

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
    need(l.requiredQty > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
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
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const currentUser = salesEmployees.snapshot().find((e) => e.id === CURRENT_USER_ID);
  const blank = blankPurchaseRequest(CURRENT_USER_ID, currentUser?.name ?? '');

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      salesEmployees.list(),
      listItems(),
      loadInventoryMasters(),
      taxCodes.list(),
      taxGroups.list(),
    ]).then(([emps, items, inv, codes, groups]) => {
      setM({ employees: emps, items, inv, tax: { codes, groups, company: undefined as never, withholding: [], withholdingGroups: [] } });
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
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="inbox" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="Purchase request not found" />
        <Panel.Body>
          <Button onClick={() => navigate(PR_LIST_PATH)}>Back to requests</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const ctx = buildContext(draft, m);
  const at = draft.id ? siblings.indexOf(draft.docNum ? prNumber(draft as PurchaseRequest) : draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const series = seriesOf(draft.seriesId);
  const totals = prTotals(draft, ctx.rateOf);
  const saved = draft as PurchaseRequest;

  const update = (patch: Partial<PrDraft>) => setDraft((d) => d ? { ...d, ...patch } : d);
  const h = bind(draft, update);

  const pickRequester = (empId: string | null) => {
    if (!empId) return update({ requesterId: '', requesterName: '' });
    const emp = m.employees.find((e) => e.id === empId);
    if (!emp) return;
    update({ requesterId: emp.id, requesterName: emp.name });
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
        openQty: l.requiredQty,
        status: 'Open' as const,
      })),
    };
    navigate(`${PR_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const transitions: Partial<Record<PrStatus, () => void>> =
    draft.status === 'Open' ? { Closed: closeIt } : {};

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' ? [{ label: 'Close request', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    // Copy to PO placeholder — a future feature
    ...(draft.status === 'Open' && draft.lines.some((l) => l.status === 'Open')
      ? [{ label: 'Copy to purchase order', icon: 'receipt_long', onSelect: () => navigate('/purchasing/purchase-orders/new', { state: { fromPr: saved.id } }) }]
      : []),
  ];

  const title = isNew
    ? 'New purchase request'
    : draft.docNum
      ? prNumber(draft as PurchaseRequest)
      : 'Purchase request';

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="inbox"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          title={title}
          trailing={
            isNew ? undefined : (
              <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
                <IconButton
                  type="button"
                  label="Previous"
                  size="small"
                  shape="pill"
                  disabled={!prevId}
                  onClick={() => navigate(`${PR_LIST_PATH}/${prevId}`)}
                >
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
                <IconButton
                  type="button"
                  label="Next"
                  size="small"
                  shape="pill"
                  disabled={!nextId}
                  onClick={() => navigate(`${PR_LIST_PATH}/${nextId}`)}
                >
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
              </ButtonGroup>
            )
          }
          status={
            isNew ? undefined : (
              <Badge size="small" intent={STATUS_INTENT[draft.status]}>{draft.status}</Badge>
            )
          }
          actions={
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(PR_LIST_PATH)}>
                {ctx.readOnly ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : ctx.added ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />

        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={() => 'Contents'} />
          {ctx.readOnly ? (
            <Alert intent="default" variant="outline" title="This request is closed">
              Only remarks can change{draft.closeDate ? ` (closed ${draft.closeDate})` : ''}.
            </Alert>
          ) : null}

          <fieldset disabled={ctx.readOnly} className="contents">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {/* Requester section */}
              <Section icon="person" title="Requester">
                <FieldStack>
                  <FormField label="Requester" required error={errors.requesterId}>
                    {(p) => (
                      <Select
                        {...p}
                        options={[
                          { value: '', label: '— None —' },
                          ...m.employees
                            .filter((e) => e.active || e.id === draft.requesterId)
                            .map((e) => ({ value: e.id, label: e.name })),
                        ]}
                        value={draft.requesterId}
                        onValueChange={(id) => pickRequester(id || null)}
                      />
                    )}
                  </FormField>
                  {h.text('requesterName', 'Requester name', {
                    readOnly: true,
                    hint: 'Auto-filled from the requester selection.',
                  })}
                  <FormField label="Branch" required>
                    {(p) => (
                      <Select
                        {...p}
                        options={BRANCHES.map((b) => ({ value: b, label: b }))}
                        value={draft.branch}
                        onValueChange={(v) => v && update({ branch: v })}
                      />
                    )}
                  </FormField>
                  <FormField label="Department">
                    {(p) => (
                      <Select
                        {...p}
                        options={[{ value: '', label: '— None —' }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]}
                        value={draft.department}
                        onValueChange={(v) => update({ department: v ?? '' })}
                      />
                    )}
                  </FormField>
                  <Flags>
                    <Checkbox
                      checked={draft.notifyOnPo}
                      onChange={(e) => update({ notifyOnPo: e.currentTarget.checked })}
                    >
                      Send e-mail when PO or goods receipt is added
                    </Checkbox>
                  </Flags>
                  {draft.notifyOnPo ? (
                    h.text('notifyEmail', 'Email address', {
                      hint: "Notification email. Defaults to the requester's email.",
                    })
                  ) : null}
                </FieldStack>
              </Section>

              {/* Document section */}
              <Section icon="tag" title="Document">
                <Fields>
                  <FormField
                    label="No."
                    required
                    error={errors.docNum}
                    tooltip={
                      ctx.added
                        ? undefined
                        : series.manual
                          ? 'Manual series: type the number.'
                          : 'Assigned from the series when the request is added.'
                    }
                  >
                    {(p) => (
                      <div className="flex gap-1">
                        <Select
                          aria-label="Series"
                          className="w-40"
                          disabled={ctx.added}
                          options={prSeries.snapshot().filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))}
                          value={draft.seriesId}
                          onValueChange={(seriesId) => update({ seriesId, docNum: 0 })}
                        />
                        {series.manual && !ctx.added ? (
                          <TextField
                            {...p}
                            className="flex-1"
                            type="number"
                            placeholder="Request number"
                            value={draft.docNum ? String(draft.docNum) : ''}
                            onChange={(e) => update({ docNum: Number(e.currentTarget.value) })}
                          />
                        ) : (
                          <span className="flex-1 self-center text-sm">
                            {draft.docNum ? prNumber(draft as PurchaseRequest) : (
                              <span className="text-(--color-text-placeholder)">Next number</span>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </FormField>

                  <StatusField
                    statuses={PR_STATUSES}
                    intents={STATUS_INTENT}
                    value={draft.status}
                    moves={transitions}
                    hint={STATUS_HINT[draft.status]}
                    error={errors.status}
                  />

                  {h.date('postingDate', 'Posting date', {
                    required: true,
                    error: errors.postingDate,
                    hint: 'Defaults to today.',
                  })}
                  {h.date('documentDate', 'Document date', {
                    required: true,
                    error: errors.documentDate,
                    hint: 'The date for records. Defaults to today.',
                  })}
                  {h.date('requiredDate', 'Required date', {
                    hint: 'When the items or services are needed. Cascades to new lines.',
                  })}
                  {h.date('validUntil', 'Valid until', {
                    hint: 'Date the request lapses if unfulfilled.',
                  })}
                  <ReadOnly label="Close date" value={draft.closeDate || '—'} hint="Set when the request is closed." />
                </Fields>
              </Section>
            </div>

            <ContentsTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} />

            {/* Footer totals */}
            <Section icon="functions" title="Totals">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Fields cols={1}>
                  {h.master('ownerId', 'Owner', salesEmployeeDef, {
                    hint: 'Owns the document for access control.',
                  })}
                  {h.area('remarks', 'Remarks', {
                    rows: 3,
                    hint: 'Can be changed after the request is added.',
                  })}
                </Fields>
                <List.Group divider>
                  <TotalRow label="Total before discount" value={totals.beforeDiscount} />
                  <TotalRow label="Discount" value={-totals.discount} />
                  <TotalRow
                    label="Freight (estimate)"
                    input={
                      <TextField
                        aria-label="Freight estimate"
                        type="number"
                        min={0}
                        className="w-32"
                        prefix="PHP"
                        value={String(draft.freight)}
                        onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
                      />
                    }
                    value={totals.freight}
                  />
                  <TotalRow label="Tax (estimate)" value={totals.tax} />
                  <TotalRow label="Total payment due (estimate)" value={totals.total} strong />
                </List.Group>
              </div>
            </Section>
          </fieldset>
          {ctx.added && (
            <DocumentFlow kind="PR" id={(draft as PurchaseRequest).id} notes="RFQs raised from this request, and the purchase orders they became." />
          )}
        </Panel.Body>
      </Panel>
    </Form>
  );
}

function TotalRow({
  label,
  value,
  input,
  strong,
}: {
  label: string;
  value: number;
  input?: React.ReactNode;
  strong?: boolean;
}) {
  const wrap = (node: React.ReactNode) =>
    strong ? <Text as="span" weight="semibold" tone="heading">{node}</Text> : node;
  return (
    <List.Item
      title={
        <span className="flex items-center gap-2">
          <span className="whitespace-nowrap">{wrap(label)}</span>
          {input ? <span className="min-w-24 flex-none">{input}</span> : null}
        </span>
      }
      content={<span className="whitespace-nowrap tabular-nums">{wrap(`PHP ${formatAmount(value)}`)}</span>}
    />
  );
}
