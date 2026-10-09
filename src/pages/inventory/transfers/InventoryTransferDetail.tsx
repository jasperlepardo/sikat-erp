import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Combobox,
  Form,
  FormField,
  IconButton,
  List,
  Panel,
  PanelHeader,
  panelHeaderIcons,
  Select,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { StatusField } from '../../../components/form/StatusField';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../mocks/common';
import { accountText, type Account } from '../../../mocks/chartOfAccounts';
import type { ItemGroup } from '../../../mocks/itemMasters';
import {
  DEFAULT_JOURNAL_REMARK,
  TRANSFER_SERIES,
  blankTransfer,
  newTransferLine,
  type InventoryTransfer,
  TRANSFER_STATUSES,
  type TransferStatus,
} from '../../../mocks/inventoryTransfers';
import { formatAmount } from '../../../services/format';
import { formatDate, todayISO } from '../../../services/dates';
import { loadInventoryMasters } from '../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../services/items';
import {
  TransferPostError,
  getTransfer,
  inventoryAccountFor,
  listTransfers,
  postTransfer,
  saveTransferDraft,
  saveTransferRemarks,
  shortages,
  transferJournal,
  transferNumber,
  transferQty,
  transferValue,
} from '../../../services/inventoryTransfers';
import { salesEmployeeDef } from '../../settings/masterDefs';
import { binsOf, receivingBin, transferBlock } from '../../../services/binLocations';
import { TransferLines, binFor, binOptions, warehouseOptions, type TransferDraft, type TransferMasters } from './TransferLines';

export const TRANSFER_LIST_PATH = '/inventory/stock-movements';

export const TRANSFER_STATUS_INTENT: Record<TransferStatus, 'default' | 'success'> = {
  Draft: 'default',
  Posted: 'success',
};

type TabId = 'contents';

interface Masters extends TransferMasters {
  groups: ItemGroup[];
  accounts: Account[];
}

/** The pre-post checklist. A draft only needs its source warehouse. */
function validate(d: TransferDraft, m: Masters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.fromWarehouse, 'header', 'fromWarehouse', 'Pick the From warehouse.');
  if (asDraft) return problems;

  need(d.toWarehouse, 'header', 'toWarehouse', 'Pick the To warehouse.');
  need(!d.toWarehouse || d.toWarehouse !== d.fromWarehouse, 'header', 'toWarehouse', 'From and To warehouse are the same — a transfer needs two warehouses.');
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');

  const whOf = (code: string) => m.warehouses.find((w) => w.code === code);
  const binOf = (warehouse: string, id: string) => m.bins.find((b) => b.warehouse === warehouse && b.id === id);
  const gone = (warehouse: string, id: string) => Boolean(id) && !binOf(warehouse, id);
  const from = whOf(d.fromWarehouse);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(item.inventoryItem, 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't an inventory item.`);
    need(isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(Number.isInteger(l.quantity) || item.manageBy !== 'Serial Numbers', 'contents', `line:${l.id}:quantity`, `${n}: serial-managed items move in whole units.`);
    need(!from?.binEnabled || l.fromBinId, 'contents', `line:${l.id}:fromBin`, `${n}: pick the bin it leaves from in ${d.fromWarehouse}.`);
    const outBlock = from?.binEnabled ? transferBlock(binOf(d.fromWarehouse, l.fromBinId), item, l.uom, 'out') : null;
    need(!outBlock, 'contents', `line:${l.id}:fromBin`, `${n}: ${outBlock}`);
    need(!from?.binEnabled || !gone(d.fromWarehouse, l.fromBinId), 'contents', `line:${l.id}:fromBin`, `${n}: its from-bin no longer exists in ${d.fromWarehouse} — pick another.`);
    need(l.toWarehouse, 'contents', `line:${l.id}:toWarehouse`, `${n}: pick the To warehouse.`);
    need(l.toWarehouse !== d.fromWarehouse, 'contents', `line:${l.id}:toWarehouse`, `${n}: To warehouse is the same as From.`);
    need(!whOf(l.toWarehouse)?.binEnabled || l.toBinId, 'contents', `line:${l.id}:toBin`, `${n}: pick the bin it goes to in ${l.toWarehouse}.`);
    const inBlock = whOf(l.toWarehouse)?.binEnabled ? transferBlock(binOf(l.toWarehouse, l.toBinId), item, l.uom, 'in') : null;
    need(!inBlock, 'contents', `line:${l.id}:toBin`, `${n}: ${inBlock}`);
    need(!whOf(l.toWarehouse)?.binEnabled || !gone(l.toWarehouse, l.toBinId), 'contents', `line:${l.id}:toBin`, `${n}: its to-bin no longer exists in ${l.toWarehouse} — pick another.`);
  }
  for (const s of shortages(d, m.items)) {
    const first = d.lines.find((l) => l.itemId === s.itemId)!;
    need(false, 'contents', `line:${first.id}:quantity`, `Insufficient stock — ${s.message}`);
  }
  return problems;
}

/** Keyed by record so moving between transfers (or duplicating into /new) starts a fresh form. */
export function InventoryTransferDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <TransferForm key={id === 'new' ? location.key : id} />;
}

function TransferForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: TransferDraft } | null)?.copyFrom;

  const [draft, setDraft] = useState<TransferDraft | null | undefined>(
    isNew ? (copyFrom ?? { ...blankTransfer(todayISO(), CURRENT_USER_ID), lines: [newTransferLine()] }) : undefined,
  );
  const [m, setM] = useState<Masters>();
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([listItems(), loadInventoryMasters()]).then(([items, inv]) =>
      setM({ items, warehouses: inv.warehouses, bins: inv.bins, groups: inv.groups, accounts: inv.accounts }),
    );
    if (isNew || !id) return;
    let cancelled = false;
    getTransfer(id).then((t) => !cancelled && setDraft(t ?? null));
    listTransfers().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((t) => t.id)));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading transfer…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="move_down" title="Transfer not found" />
        <Panel.Body>
          <Button onClick={() => navigate(TRANSFER_LIST_PATH)}>Back to stock movements</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const posted = draft.status === 'Posted';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const whOf = (code: string) => m.warehouses.find((w) => w.code === code);
  const to = whOf(draft.toWarehouse);
  const journal = transferJournal(draft, m.items, m.groups);
  const sharedAccounts = [
    ...new Set(
      draft.lines.flatMap((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item ? [inventoryAccountFor(item, draft.fromWarehouse, m.groups)] : [];
      }),
    ),
  ];

  const update = (patch: Partial<TransferDraft>) => setDraft({ ...draft, ...patch });
  const h = bind(draft, update);
  const autoRemark = (from: string, toWh: string) => (from && toWh ? `${DEFAULT_JOURNAL_REMARK} ${from} to ${toWh}` : DEFAULT_JOURNAL_REMARK);
  const remarkIsDefault = draft.journalRemark === autoRemark(draft.fromWarehouse, draft.toWarehouse) || draft.journalRemark === DEFAULT_JOURNAL_REMARK;

  /** A new source: lines re-default their from-bin; ones that now go nowhere lose their destination. */
  const pickFrom = (fromWarehouse: string) => {
    const from = whOf(fromWarehouse);
    update({
      fromWarehouse,
      toWarehouse: draft.toWarehouse === fromWarehouse ? '' : draft.toWarehouse,
      journalRemark: remarkIsDefault ? autoRemark(fromWarehouse, draft.toWarehouse === fromWarehouse ? '' : draft.toWarehouse) : draft.journalRemark,
      lines: draft.lines.map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        const fromBin = item ? binFor(item, from, m.bins) : '';
        return { ...l, fromBin, toWarehouse: l.toWarehouse === fromWarehouse ? '' : l.toWarehouse };
      }),
    });
  };

  /** A new destination: lines that followed the header follow it again. */
  const pickTo = (toWarehouse: string) => {
    const wh = whOf(toWarehouse);
    const toBin = wh?.binEnabled ? (receivingBin(m.bins, toWarehouse) ?? binsOf(m.bins, toWarehouse)[0])?.id ?? '' : '';
    update({
      toWarehouse,
      toBinId: toBin,
      journalRemark: remarkIsDefault ? autoRemark(draft.fromWarehouse, toWarehouse) : draft.journalRemark,
      lines: draft.lines.map((l) => (!l.toWarehouse || l.toWarehouse === draft.toWarehouse ? { ...l, toWarehouse, toBinId: toBin } : l)),
    });
  };

  const pickToBin = (toBin: string) =>
    update({ toBinId: toBin, lines: draft.lines.map((l) => (l.toWarehouse === draft.toWarehouse && (!l.toBinId || l.toBinId === draft.toBinId) ? { ...l, toBinId: toBin } : l)) });

  /** Post (Add), save a draft, or — once posted — save the remarks. */
  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (posted) {
      setSaving(true);
      const t = await saveTransferRemarks(draft as InventoryTransfer, { remarks: draft.remarks, journalRemark: draft.journalRemark });
      setSaving(false);
      return navigate(TRANSFER_LIST_PATH, { state: { notice: `Remarks saved on transfer ${transferNumber(t)}.` } });
    }
    // Empty lines are dropped rather than flagged.
    const doc = { ...draft, lines: draft.lines.filter((l) => l.itemId || draft.lines.length === 1) };
    const found = validate(doc, m, asDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const t = asDraft ? await saveTransferDraft(doc) : await postTransfer(doc);
      navigate(TRANSFER_LIST_PATH, {
        state: {
          notice: asDraft
            ? 'Draft transfer saved.'
            : `Transfer ${transferNumber(t)} posted — ${transferQty(t)} unit${transferQty(t) === 1 ? '' : 's'} moved out of ${t.fromWarehouse}.`,
        },
      });
    } catch (err) {
      if (!(err instanceof TransferPostError)) throw err;
      setProblems([{ tab: 'contents', key: 'lines', message: err.message }]);
      // Stock moved since the form loaded; show the current figures.
      listItems().then((items) => setM((prev) => prev && { ...prev, items }));
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: TransferDraft = {
      ...structuredClone(draft),
      id: undefined,
      status: 'Draft',
      docNum: 0,
      postingDate: today,
      documentDate: today,
      lines: draft.lines.map((l) => ({ ...l, id: newTransferLine().id })),
    };
    navigate(`${TRANSFER_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  /** Reverse: the same lines back the other way, as a new draft. Only for single-destination transfers. */
  const destinationsOf = [...new Set(draft.lines.map((l) => l.toWarehouse))];
  const reverse = () => {
    const today = todayISO();
    const back = destinationsOf[0];
    const copy: TransferDraft = {
      ...blankTransfer(today, CURRENT_USER_ID),
      fromWarehouse: back,
      toWarehouse: draft.fromWarehouse,
      journalRemark: autoRemark(back, draft.fromWarehouse),
      remarks: `Reverses transfer ${transferNumber(draft)}.`,
      lines: draft.lines.map((l) => ({ ...l, id: newTransferLine().id, fromBinId: l.toBinId, toWarehouse: draft.fromWarehouse, toBinId: l.fromBinId })),
    };
    navigate(`${TRANSFER_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  // What picking each status in the Status dropdown does; the others can't be reached from here.
  const statusMoves: Partial<Record<TransferStatus, () => void>> = draft.status === 'Draft' ? { Posted: () => submit(null) } : {};

  const menu: MoreMenuItem[] = [
    ...(!posted ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(posted && destinationsOf.length === 1 ? [{ label: 'Transfer back', icon: 'undo', onSelect: reverse }] : []),
  ];

  const title = isNew ? 'New inventory transfer' : posted ? transferNumber(draft) : 'Draft inventory transfer';
  const route = draft.fromWarehouse && draft.toWarehouse ? `${draft.fromWarehouse} → ${draft.toWarehouse}` : '';

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="move_down"
          title={title}
          subcopy={route || 'Move stock from one warehouse to another.'}
          leading={
            isNew ? undefined : (
              <>
                <IconButton
                  type="button"
                  label="Next"
                  intent="default"
                  variant="solid"
                  size="extra-large"
                  disabled={!nextId}
                  onClick={() => navigate(`${TRANSFER_LIST_PATH}/${nextId}`)}
                >
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton
                  type="button"
                  label="Previous"
                  intent="default"
                  variant="solid"
                  size="extra-large"
                  disabled={!prevId}
                  onClick={() => navigate(`${TRANSFER_LIST_PATH}/${prevId}`)}
                >
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
              </>
            )
          }
          status={isNew ? undefined : <Badge size="small" intent={TRANSFER_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(TRANSFER_LIST_PATH)}>
                Cancel
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : posted ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={() => undefined} />
          {posted ? (
            <Alert intent="default" variant="outline" title="This transfer is posted">
              Stock has moved, so only the remarks can change. To undo it, use Transfer back to move the stock the other way.
            </Alert>
          ) : null}

          <fieldset disabled={posted} className="contents">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Section icon="warehouse" title="Warehouses">
                <Fields>
                  <FormField label="From warehouse" required error={errors.fromWarehouse} tooltip="Where the stock is now. Only this warehouse's stock is taken.">
                    {(p) => (
                      <Combobox
                        {...p}
                        placeholder="Search warehouses"
                        disabled={posted}
                        options={warehouseOptions(m.warehouses, draft.fromWarehouse)}
                        value={draft.fromWarehouse || null}
                        onValueChange={(v) => pickFrom(v ?? '')}
                      />
                    )}
                  </FormField>
                  <FormField label="To warehouse" required error={errors.toWarehouse} tooltip="Where the stock goes. Lines take it unless they set their own.">
                    {(p) => (
                      <Combobox
                        {...p}
                        placeholder="Search warehouses"
                        disabled={posted}
                        options={warehouseOptions(m.warehouses, draft.toWarehouse, draft.fromWarehouse)}
                        value={draft.toWarehouse || null}
                        onValueChange={(v) => pickTo(v ?? '')}
                      />
                    )}
                  </FormField>
                  {to?.binEnabled ? (
                    <FormField label="To bin" tooltip="Default destination bin for the lines; each line can change it.">
                      {(p) => (
                        <Select
                          {...p}
                          disabled={posted}
                          options={binOptions(m.bins, to, draft.toBinId).filter((o) => o.value)}
                          value={draft.toBinId}
                          onValueChange={pickToBin}
                        />
                      )}
                    </FormField>
                  ) : (
                    <ReadOnly label="To bin" value="—" hint={draft.toWarehouse ? `${draft.toWarehouse} doesn't use bins.` : 'Pick the To warehouse first.'} />
                  )}
                  <ReadOnly
                    label="Value at cost"
                    value={`PHP ${formatAmount(transferValue({ lines: draft.lines.map((l) => ({ ...l, unitCost: posted ? l.unitCost : (m.items.find((i) => i.id === l.itemId)?.itemCost ?? 0) })) }))}`}
                    hint="Quantity × item cost. Company-wide stock value doesn't change."
                  />
                </Fields>
              </Section>

              <Section icon="tag" title="Document">
                <Fields>
                  <ReadOnly
                    label="No."
                    value={posted ? transferNumber(draft) : `${TRANSFER_SERIES.find((s) => s.id === draft.seriesId)?.name ?? 'Primary'} · next number`}
                    hint={posted ? undefined : 'Assigned from the series when the transfer is posted.'}
                  />
                  <StatusField statuses={TRANSFER_STATUSES} intents={TRANSFER_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Draft until posted. Posting moves the stock and can't be undone." />
                  {h.date('postingDate', 'Posting date', {
                    required: true,
                    error: errors.postingDate,
                    hint: 'When the stock movement is recorded. Must be in an open period.',
                  })}
                  {h.date('documentDate', 'Document date', {
                    required: true,
                    error: errors.documentDate,
                    hint: 'Usually the same as the posting date.',
                  })}
                </Fields>
              </Section>
            </div>

            <TransferLines draft={draft} update={update} errors={errors} m={m} readOnly={posted} />
          </fieldset>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <Section icon="notes" title="Remarks">
              <Fields cols={1}>
                <fieldset disabled={posted} className="contents">
                  {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef)}
                </fieldset>
                {h.text('journalRemark', 'Journal remarks', { hint: 'Shown on the journal entry, if one is made.' })}
                {h.area('remarks', 'Remarks', {
                  rows: 3,
                  hint: 'Why the stock is moving, and the transfer request no. if this fulfils one. Can be changed after posting.',
                })}
              </Fields>
            </Section>

            <Section icon="account_balance" title="Journal entry">
              {journal.length ? (
                <List.Group divider>
                  {journal.map((j) => (
                    <List.Item
                      key={j.account}
                      title={accountText(j.account, m.accounts)}
                      content={
                        <span className="whitespace-nowrap tabular-nums">
                          {j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}
                        </span>
                      }
                    />
                  ))}
                </List.Group>
              ) : (
                <Text variant="small" tone="muted">
                  {sharedAccounts.length
                    ? `No journal entry: both warehouses post to ${sharedAccounts.map((a) => accountText(a, m.accounts)).join(', ')}, so the value only moves between warehouse records.`
                    : 'Made only when the two warehouses use different inventory accounts. Add lines to see it.'}
                </Text>
              )}
            </Section>
          </div>
        </Panel.Body>
      </Panel>
    </Form>
  );
}
