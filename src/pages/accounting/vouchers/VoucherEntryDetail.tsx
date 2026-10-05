import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Form, Panel, PanelHeader, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, type Problem } from '../../../components/form/ProblemsAlert';
import { CURRENT_USER } from '../../../mocks/common';
import type { JournalVoucher, VoucherEntry } from '../../../mocks/journalVouchers';
import { todayISO } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { JePostError, jeTotals, withAutoTax } from '../../../services/journalEntries';
import {
  VoucherPostError,
  deleteVoucherEntries,
  getVoucher,
  newVoucherEntry,
  postVoucherEntries,
  saveVoucherEntry,
  toJournalEntry,
} from '../../../services/journalVouchers';
import { accounts as accountsCollection, taxCodes as taxCodesCollection } from '../../../services/masterData';
import { listPartners } from '../../../services/partners';
import { JE_LIST_PATH } from '../journal/JournalEntryDetail';
import { JeHeaderSections, JeRowsTable, jeProblems, type JeMasters } from '../journal/JeEditor';
import { JV_LIST_PATH, entryPath } from './JournalVoucherList';

type TabId = 'contents' | 'attachments';

/** Keyed by route so moving between entries (or to a new one) starts a fresh form. */
export function VoucherEntryDetail() {
  const { id, entryId } = useParams();
  const location = useLocation();
  return <VoucherEntryForm key={entryId === 'new' ? location.key : `${id}/${entryId}`} />;
}

/**
 * One draft journal entry in a voucher — the journal entry form, except Save puts it in the
 * voucher with no G/L impact (unbalanced is allowed, with a warning) and Post makes the real entry.
 */
function VoucherEntryForm() {
  const { id: voucherId = 'new', entryId = 'new' } = useParams();
  const navigate = useNavigate();
  const isNewVoucher = voucherId === 'new';
  const isNew = entryId === 'new';

  const [voucher, setVoucher] = useState<JournalVoucher | null>();
  const [draft, setDraft] = useState<VoucherEntry | null>();
  const [m, setM] = useState<JeMasters>();
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [notice, setNotice] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>('contents');

  useEffect(() => {
    let cancelled = false;
    Promise.all([accountsCollection.list(), listPartners(), taxCodesCollection.list()]).then(([accounts, partners, codes]) => !cancelled && setM({ accounts, partners, codes }));
    if (isNewVoucher) {
      setVoucher(null);
      setDraft(newVoucherEntry(todayISO(), 0));
    } else {
      getVoucher(voucherId).then((v) => {
        if (cancelled) return;
        setVoucher(v ?? null);
        setDraft(!v ? null : isNew ? newVoucherEntry(todayISO(), 0) : (v.entries.find((e) => e.id === entryId) ?? null));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [voucherId, entryId, isNew, isNewVoucher]);

  const back = () => navigate(isNewVoucher || !voucher ? JV_LIST_PATH : `${JV_LIST_PATH}/${voucher.id}`);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading voucher entry…</Text>;
  if (draft === null || (!isNewVoucher && !voucher)) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="folder_open" title="Voucher entry not found" />
        <Panel.Body>
          <Button onClick={back}>Back</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const posted = draft.entryStatus === 'Closed';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const lines = posted ? draft.lines : withAutoTax(draft, m.codes);
  const totals = jeTotals(lines);
  const update = (patch: Partial<VoucherEntry>) => setDraft({ ...draft, ...patch });
  const h = bind(draft, update);
  const voucherLabel = isNewVoucher ? 'New voucher' : `Journal voucher ${voucher!.voucherNo}`;

  /** Save into the voucher: no G/L impact, and no balance check — only a warning on the way back. */
  const save = async () => {
    setSaving(true);
    try {
      const { voucher: v, entry } = await saveVoucherEntry(voucherId, draft, CURRENT_USER, todayISO());
      const off = jeTotals(withAutoTax(entry, m.codes)).difference;
      navigate(`${JV_LIST_PATH}/${v.id}`, {
        state: {
          notice: `Entry ${entry.transNo} saved to voucher ${v.voucherNo}.${off ? ` Debits and credits differ by PHP ${formatAmount(Math.abs(off))} — it can't post until they match.` : ''}`,
        },
      });
    } catch (err) {
      if (!(err instanceof JePostError)) throw err;
      setProblems([{ tab: 'header', key: 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  /** Save, then post this entry as a journal entry — blocked unless it passes the journal entry checks. */
  const postNow = async () => {
    const found = jeProblems(toJournalEntry(draft, m.codes), m) as Problem<TabId>[];
    setProblems(found);
    if (found.length) return setTab('contents');
    setSaving(true);
    try {
      const { voucher: v, entry } = await saveVoucherEntry(voucherId, draft, CURRENT_USER, todayISO());
      const { posted: done } = await postVoucherEntries(v.id, [entry.id]);
      navigate(`${JV_LIST_PATH}/${v.id}`, { state: { notice: `Entry ${entry.transNo} posted as journal entry ${done[0]?.number}.` } });
    } catch (err) {
      if (!(err instanceof VoucherPostError) && !(err instanceof JePostError)) throw err;
      setProblems([{ tab: 'header', key: 'postingDate', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!voucher) return back();
    await deleteVoucherEntries(voucher.id, [draft.id]);
    navigate(`${JV_LIST_PATH}/${voucher.id}`, { state: { notice: `Entry ${draft.transNo} deleted.` } });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!posted) void save();
  };

  const siblings = voucher ? [...voucher.entries].sort((a, b) => a.transNo - b.transNo) : [];
  const at = siblings.findIndex((e) => e.id === draft.id);
  const menu: MoreMenuItem[] = [
    ...(!posted ? [{ label: isNewVoucher ? 'Add to new voucher and post' : 'Save and post this entry', icon: 'send', onSelect: postNow }] : []),
    ...(posted && draft.journalEntryId ? [{ label: `Open journal entry ${draft.number}`, icon: 'open_in_new', onSelect: () => navigate(`${JE_LIST_PATH}/${draft.journalEntryId}`) }] : []),
    ...(at > 0 ? [{ label: `Previous entry (${siblings[at - 1].transNo})`, icon: 'arrow_upward', onSelect: () => navigate(entryPath(voucher!.id, siblings[at - 1].id)) }] : []),
    ...(at >= 0 && at < siblings.length - 1 ? [{ label: `Next entry (${siblings[at + 1].transNo})`, icon: 'arrow_downward', onSelect: () => navigate(entryPath(voucher!.id, siblings[at + 1].id)) }] : []),
    ...(!posted && !isNew ? [{ label: 'Delete entry', icon: 'delete', onSelect: remove }] : []),
  ];

  return (
    <Form className="flex-1" onSubmit={submit} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="edit_note"
          title={isNew ? 'New voucher entry' : `Entry ${draft.transNo}`}
          subcopy={`${voucherLabel} · ${posted ? `posted as journal entry ${draft.number}` : 'draft — no G/L impact until posted'}`}
          tabs={
            <Tabs
              variant="outline"
              value={tab}
              onValueChange={(v) => setTab(v as TabId)}
              items={[
                { value: 'contents', label: 'Contents' },
                { value: 'attachments', label: 'Attachments', badge: draft.attachments.length ? String(draft.attachments.length) : undefined },
              ]}
            />
          }
          status={<Badge intent={posted ? 'default' : 'success'}>{posted ? 'Posted' : 'Open'}</Badge>}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={back}>
                {posted ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              {posted ? null : (
                <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                  {saving ? 'Saving…' : isNewVoucher ? 'Add to new voucher' : 'Save to voucher'}
                </Button>
              )}
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => (t === 'contents' ? 'Contents' : t === 'attachments' ? 'Attachments' : undefined)} />
          {notice ? (
            <Alert intent="default" variant="outline" title="Import from Excel" onClose={() => setNotice(undefined)}>
              {notice}
            </Alert>
          ) : null}
          {posted ? (
            <Alert intent="default" variant="outline" title="This entry is posted">
              {`It's journal entry ${draft.number} now and can't change here. To undo it, reverse that journal entry.`}
            </Alert>
          ) : totals.difference && lines.some((l) => l.debit || l.credit) ? (
            <Alert intent="warning" variant="outline" title="Not balanced">
              {`Debits and credits differ by PHP ${formatAmount(Math.abs(totals.difference))}. You can save it to the voucher as it is, but it can't post until they match.`}
            </Alert>
          ) : null}

          <fieldset disabled={posted} className="contents">
            <JeHeaderSections
              draft={draft}
              update={update}
              errors={errors}
              readOnly={posted}
              transNoHint="This entry's number within the voucher."
              documentTop={<ReadOnly label="Voucher No." value={isNewVoucher ? 'Next number' : String(voucher!.voucherNo)} />}
            />
            {tab === 'contents' ? (
              <JeRowsTable draft={draft} update={update} errors={errors} readOnly={posted} m={m} lines={lines} onNotice={setNotice} balanceRule="must be zero to post" />
            ) : null}
          </fieldset>

          {tab === 'attachments' ? (
            <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="Backup for the entry: schedules, approvals, invoice scans. They carry to the journal entry when it posts." withDescription />
          ) : null}

          <Section icon="notes" title="Remarks">
            <Fields cols={1}>{h.area('remarks', 'Remarks', { rows: 2, hint: 'Describe the entry for whoever reviews the voucher.' })}</Fields>
          </Section>
        </Panel.Body>
      </Panel>
    </Form>
  );
}
