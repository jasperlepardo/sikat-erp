import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Combobox, Form, FormField, Panel, PanelHeader, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { NotFound, PrevNext, neighbours } from '../../../../components/form/DetailNav';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import {
  TRANSFER_REQUEST_SERIES,
  TRANSFER_REQUEST_STATUSES,
  blankTransferRequest,
  newTransferRequestLine,
  type InventoryTransferRequest,
  type TransferRequestStatus,
} from '../../../../mocks/inventoryTransferRequests';
import { DEFAULT_JOURNAL_REMARK, blankTransfer } from '../../../../mocks/inventoryTransfers';
import { formatDate, todayISO } from '../../../../services/dates';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { binsOf, receivingBin } from '../../../../services/binLocations';
import {
  closeTransferRequest,
  getTransferRequest,
  listTransferRequests,
  openQty,
  requestOpenQty,
  requestedQty,
  saveTransferRequest,
  transferRequestNumber,
} from '../../../../services/inventoryTransferRequests';
import { useDocTitle } from '../../../../services/useDocTitle';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { TRANSFER_LIST_PATH } from '../../transfers/InventoryTransferDetail';
import { lineFromItem, warehouseOptions, type TransferDraft } from '../../transfers/TransferLines';
import { ItrLinesCard } from './ItrLinesCard';
import { transferredQty, type ItrDraft, type ItrMasters } from './types';

export const TRANSFER_REQUEST_LIST_PATH = '/inventory/transfer-requests';

export const TRANSFER_REQUEST_STATUS_INTENT: Record<TransferRequestStatus, 'primary' | 'success'> = {
  Open: 'primary',
  Closed: 'success',
};

const STATUS_HINT: Record<TransferRequestStatus, string> = {
  Open: 'Waiting to be transferred. Closes when every line has been sent.',
  Closed: 'Fully transferred or no longer needed. Nothing moved by closing it.',
};

type TabId = 'contents';

function validate(d: ItrDraft, m: ItrMasters): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.fromWarehouse, 'header', 'fromWarehouse', 'Pick the From warehouse.');
  need(d.toWarehouse, 'header', 'toWarehouse', 'Pick the To warehouse.');
  need(!d.toWarehouse || d.toWarehouse !== d.fromWarehouse, 'header', 'toWarehouse', 'From and To warehouse are the same — a transfer needs two warehouses.');
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.dueDate, 'header', 'dueDate', 'Due date is required — when the stock is needed.');
  need(!d.dueDate || !d.postingDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(d.lines.length, 'contents', 'lines', 'Add at least one line.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(item.inventoryItem, 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't an inventory item.`);
    need(isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.quantity >= transferredQty(l), 'contents', `line:${l.id}:quantity`, `${n}: ${transferredQty(l)} already transferred; quantity can't go below that.`);
    need((l.toWarehouse || d.toWarehouse) !== d.fromWarehouse, 'contents', `line:${l.id}:toWarehouse`, `${n}: To warehouse is the same as From.`);
  }
  return problems;
}

/** Keyed by record so moving between requests (or duplicating into /new) starts a fresh form. */
export function TransferRequestDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <TransferRequestForm key={id === 'new' ? location.key : id} />;
}

function TransferRequestForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: ItrDraft } | null)?.copyFrom;

  const [draft, setDraft] = useState<ItrDraft | null | undefined>(isNew ? (copyFrom ?? blankTransferRequest(todayISO(), CURRENT_USER_ID)) : undefined);
  const [m, setM] = useState<ItrMasters>();
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([listItems(), loadInventoryMasters()]).then(([items, inv]) => setM({ items, warehouses: inv.warehouses, bins: inv.bins }));
    if (isNew || !id) return;
    let cancelled = false;
    getTransferRequest(id).then((r) => !cancelled && setDraft(r ?? null));
    listTransferRequests().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((r) => r.id)));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? transferRequestNumber(draft) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading transfer request…</Text>;
  if (draft === null) return <NotFound icon="move_up" title="Transfer request not found" backTo={TRANSFER_REQUEST_LIST_PATH} backLabel="Back to transfer requests" />;

  const added = draft.docNum > 0;
  const closed = draft.status === 'Closed';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const { prevId, nextId } = neighbours(siblings, draft.id);
  // Once anything has been transferred, the warehouses are what the transfers moved between.
  const started = draft.lines.some((l) => transferredQty(l) > 0);

  const update = (patch: Partial<ItrDraft>) => setDraft({ ...draft, ...patch });
  const h = bind(draft, update);
  const autoRemark = (from: string, to: string) => (from && to ? `${DEFAULT_JOURNAL_REMARK} ${from} to ${to}` : '');

  const pickFrom = (fromWarehouse: string) =>
    update({
      fromWarehouse,
      toWarehouse: draft.toWarehouse === fromWarehouse ? '' : draft.toWarehouse,
      journalRemark: !draft.journalRemark || draft.journalRemark === autoRemark(draft.fromWarehouse, draft.toWarehouse) ? autoRemark(fromWarehouse, draft.toWarehouse) : draft.journalRemark,
    });
  /** Lines that followed the header follow it again. */
  const pickTo = (toWarehouse: string) =>
    update({
      toWarehouse,
      journalRemark: !draft.journalRemark || draft.journalRemark === autoRemark(draft.fromWarehouse, draft.toWarehouse) ? autoRemark(draft.fromWarehouse, toWarehouse) : draft.journalRemark,
      lines: draft.lines.map((l) => (!l.toWarehouse || l.toWarehouse === draft.toWarehouse ? { ...l, toWarehouse } : l)),
    });

  const submit = async (e: FormEvent | null) => {
    e?.preventDefault();
    const doc = { ...draft, lines: draft.lines.filter((l) => l.itemId || draft.lines.length === 1) };
    const found = validate(doc, m);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const r = await saveTransferRequest(doc);
      navigate(TRANSFER_REQUEST_LIST_PATH, {
        state: { notice: `Transfer request ${transferRequestNumber(r)} ${added ? 'saved' : 'added'} — ${requestOpenQty(r)} unit${requestOpenQty(r) === 1 ? '' : 's'} open. No stock has moved.` },
      });
    } finally {
      setSaving(false);
    }
  };

  const closeIt = async () => {
    setSaving(true);
    try {
      const r = await closeTransferRequest(draft as InventoryTransferRequest);
      navigate(TRANSFER_REQUEST_LIST_PATH, { state: { notice: `Transfer request ${transferRequestNumber(r)} closed.` } });
    } finally {
      setSaving(false);
    }
  };

  /** Copy To → Inventory Transfer: every open quantity, as a new transfer that names this request. */
  const copyToTransfer = () => {
    const today = todayISO();
    const to = m.warehouses.find((w) => w.code === draft.toWarehouse);
    const toBinId = to?.binEnabled ? (receivingBin(m.bins, to.code) ?? binsOf(m.bins, to.code)[0])?.id ?? '' : '';
    const base: TransferDraft = {
      ...blankTransfer(today, draft.salesEmployeeId || CURRENT_USER_ID),
      fromWarehouse: draft.fromWarehouse,
      toWarehouse: draft.toWarehouse,
      toBinId,
      journalRemark: draft.journalRemark || autoRemark(draft.fromWarehouse, draft.toWarehouse) || DEFAULT_JOURNAL_REMARK,
      remarks: `Copied from transfer request ${transferRequestNumber(draft)}.`,
      baseRequestId: draft.id!,
    };
    const lines = draft.lines.flatMap((l) => {
      const item = m.items.find((i) => i.id === l.itemId);
      return item && openQty(l) > 0 ? [lineFromItem(item, base, m, { quantity: openQty(l), toWarehouse: l.toWarehouse || draft.toWarehouse, baseLineId: l.id })] : [];
    });
    navigate(`${TRANSFER_LIST_PATH}/new`, { state: { copyFrom: { ...base, lines } } });
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: ItrDraft = {
      ...structuredClone(draft),
      id: undefined,
      docNum: 0,
      status: 'Open',
      postingDate: today,
      documentDate: today,
      dueDate: '',
      closeDate: '',
      lines: draft.lines.map((l) => ({ ...l, id: newTransferRequestLine().id, openQty: l.quantity })),
    };
    navigate(`${TRANSFER_REQUEST_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const canCopy = added && !closed && requestOpenQty(draft) > 0;
  const moves: Partial<Record<TransferRequestStatus, () => void>> = added && !closed ? { Closed: closeIt } : {};
  const menu: MoreMenuItem[] = [
    ...(canCopy ? [{ label: 'Copy to inventory transfer', icon: 'move_down', onSelect: copyToTransfer }] : []),
    ...(added && !closed ? [{ label: 'Close request', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(added ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
  ];
  const title = isNew ? 'New transfer request' : transferRequestNumber(draft);

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="move_up"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          breadcrumbs={[{ label: 'Transfer Requests', href: TRANSFER_REQUEST_LIST_PATH }, { label: title }]}
          onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
          onBack={() => navigate(TRANSFER_REQUEST_LIST_PATH)}
          trailing={isNew ? undefined : <PrevNext path={TRANSFER_REQUEST_LIST_PATH} prevId={prevId} nextId={nextId} />}
          status={isNew ? undefined : <Badge size="small" intent={TRANSFER_REQUEST_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(TRANSFER_REQUEST_LIST_PATH)}>
                Cancel
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              {closed ? null : (
                <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                  {saving ? 'Saving…' : added ? 'Save' : 'Add'}
                </Button>
              )}
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={() => undefined} />
          {closed ? (
            <Alert intent="default" variant="outline" title="This request is closed">
              {draft.closeDate ? `Closed ${formatDate(draft.closeDate)}. ` : ''}A closed request can't be reopened — add a new one if more stock is needed.
            </Alert>
          ) : null}

          <fieldset disabled={closed} className="contents">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Section icon="warehouse" title="Warehouses">
                <Fields>
                  <FormField label="From warehouse" required error={errors.fromWarehouse} tooltip={started ? 'Locked: stock was already transferred against this request.' : 'Where the stock is now.'}>
                    {(p) => (
                      <Combobox
                        {...p}
                        placeholder="Search warehouses"
                        disabled={closed || started}
                        options={warehouseOptions(m.warehouses, draft.fromWarehouse)}
                        value={draft.fromWarehouse || null}
                        onValueChange={(v) => pickFrom(v ?? '')}
                      />
                    )}
                  </FormField>
                  <FormField label="To warehouse" required error={errors.toWarehouse} tooltip={started ? 'Locked: stock was already transferred against this request.' : 'Where the stock is needed. Lines take it unless they set their own.'}>
                    {(p) => (
                      <Combobox
                        {...p}
                        placeholder="Search warehouses"
                        disabled={closed || started}
                        options={warehouseOptions(m.warehouses, draft.toWarehouse, draft.fromWarehouse)}
                        value={draft.toWarehouse || null}
                        onValueChange={(v) => pickTo(v ?? '')}
                      />
                    )}
                  </FormField>
                  <ReadOnly label="Open quantity" value={`${requestOpenQty(draft)} of ${requestedQty(draft)}`} hint="Lowered by each posted transfer copied from this request." />
                  {h.text('ref2', 'Ref. 2', { hint: 'External reference or planning document no.' })}
                </Fields>
              </Section>

              <Section icon="tag" title="Document">
                <Fields>
                  <ReadOnly
                    label="No."
                    value={added ? transferRequestNumber(draft) : `${TRANSFER_REQUEST_SERIES.find((s) => s.id === draft.seriesId)?.name ?? 'Primary'} · next number`}
                    hint={added ? undefined : 'Assigned from the series when the request is added.'}
                  />
                  <StatusField statuses={TRANSFER_REQUEST_STATUSES} intents={TRANSFER_REQUEST_STATUS_INTENT} value={draft.status} moves={moves} hint={STATUS_HINT[draft.status]} />
                  {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When the request is made.' })}
                  {h.date('dueDate', 'Due date', { required: true, error: errors.dueDate, hint: 'When the destination needs the stock. Not enforced.' })}
                  {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate, hint: 'Usually the same as the posting date.' })}
                  <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} hint="Set when the request closes." />
                </Fields>
              </Section>
            </div>

            <ItrLinesCard draft={draft} update={update} errors={errors} m={m} readOnly={closed} />

            <Section icon="notes" title="Remarks">
              <Fields>
                {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef)}
                {h.text('journalRemark', 'Journal remarks', { hint: 'Carried to the transfer copied from this request. The request itself makes no journal entry.' })}
                {h.area('pickPackRemarks', 'Pick and pack remarks', { rows: 2, hint: 'For the warehouse team picking the stock.' })}
                {h.area('remarks', 'Remarks', { rows: 2 })}
              </Fields>
            </Section>
          </fieldset>
        </Panel.Body>
      </Panel>
    </Form>
  );
}
