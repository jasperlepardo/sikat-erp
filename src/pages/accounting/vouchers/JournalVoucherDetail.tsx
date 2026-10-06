import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section } from '../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import type { JournalVoucher, VoucherEntry } from '../../../mocks/journalVouchers';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { jeTotals } from '../../../services/journalEntries';
import { VoucherPostError, deleteVoucher, deleteVoucherEntries, getVoucher, hasPosted, postVoucherEntries, toJournalEntry } from '../../../services/journalVouchers';
import { accounts as accountsCollection, taxCodes as taxCodesCollection } from '../../../services/masterData';
import { listPartners } from '../../../services/partners';
import { JE_LIST_PATH } from '../journal/JournalEntryDetail';
import { jeProblems, type JeMasters } from '../journal/JeEditor';
import { JV_LIST_PATH, entryPath, voucherState } from './JournalVoucherList';

/** A voucher: its draft entries, what each needs before it can post, and Post / Delete. */
export function JournalVoucherDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const [voucher, setVoucher] = useState<JournalVoucher | null>();
  const [m, setM] = useState<JeMasters>();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<{ intent: 'success' | 'danger'; title: string; text: string }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([accountsCollection.list(), listPartners(), taxCodesCollection.list()]).then(([accounts, partners, codes]) => !cancelled && setM({ accounts, partners, codes }));
    if (id) getVoucher(id).then((v) => !cancelled && setVoucher(v ?? null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (voucher === undefined || !m) return <Text tone="muted" className="p-4">Loading journal voucher…</Text>;
  if (voucher === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="folder_open" title="Journal voucher not found" />
        <Panel.Body>
          <Button onClick={() => navigate(JV_LIST_PATH)}>Back to journal vouchers</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const entries = [...voucher.entries].sort((a, b) => a.transNo - b.transNo);
  const openEntries = entries.filter((e) => e.entryStatus === 'Open');
  /** What stops an open entry from posting (first problem), or undefined when it's ready. */
  const blockerOf = (e: VoucherEntry) => jeProblems(toJournalEntry(e, m.codes), m)[0]?.message;
  const ready = openEntries.filter((e) => !blockerOf(e));
  const state = voucherState(voucher);
  const pickedOpen = openEntries.filter((e) => selected.includes(e.id));

  const post = async (picked: VoucherEntry[]) => {
    const blocked = picked.filter((e) => blockerOf(e));
    if (blocked.length) {
      return setMessage({
        intent: 'danger',
        title: `Nothing posted — ${blocked.length} entr${blocked.length === 1 ? 'y needs' : 'ies need'} fixing`,
        text: blocked.map((e) => `Entry ${e.transNo}: ${blockerOf(e)}`).join(' '),
      });
    }
    setBusy(true);
    try {
      const { voucher: v, posted } = await postVoucherEntries(voucher.id, picked.map((e) => e.id));
      setVoucher(v);
      setSelected([]);
      setMessage({
        intent: 'success',
        title: 'Posted',
        text: `${posted.map((p) => `Entry ${p.transNo} → journal entry ${p.number}`).join(', ')}.${openEntries.length > posted.length ? ' The voucher stays open for its other entries.' : ' Every entry is posted; the voucher is closed.'}`,
      });
    } catch (err) {
      if (!(err instanceof VoucherPostError)) throw err;
      setVoucher((await getVoucher(voucher.id)) ?? null);
      setMessage({
        intent: 'danger',
        title: err.posted.length ? `Stopped after ${err.posted.length} posted` : 'Not posted',
        text: err.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const removeEntries = async (picked: VoucherEntry[]) => {
    setVoucher(await deleteVoucherEntries(voucher.id, picked.map((e) => e.id)));
    setSelected([]);
    setMessage({ intent: 'success', title: 'Deleted', text: `${picked.length} open entr${picked.length === 1 ? 'y' : 'ies'} deleted.` });
  };

  const removeVoucher = async () => {
    await deleteVoucher(voucher.id);
    navigate(JV_LIST_PATH, { state: { notice: `Journal voucher ${voucher.voucherNo} deleted.` } });
  };

  const menu: MoreMenuItem[] = [
    ...(!hasPosted(voucher) ? [{ label: 'Delete voucher', icon: 'delete', onSelect: removeVoucher }] : []),
  ];

  const columns: TableColumn<VoucherEntry>[] = [
    {
      key: 'transNo',
      header: 'Trans. No.',
      cell: (e) => <TableLink onClick={() => navigate(entryPath(voucher.id, e.id))}>{e.transNo}</TableLink>,
    },
    { key: 'postingDate', header: 'Posting date', cell: (e) => formatDate(e.postingDate) },
    {
      key: 'remarks',
      header: 'Remarks',
      cell: (e) => <TableSubcontent subcopy={[e.ref1, e.ref2].filter(Boolean).join(' · ') || undefined}>{e.remarks || '—'}</TableSubcontent>,
    },
    { key: 'debit', header: 'Debit', cell: (e) => <TableAmount currency="PHP">{formatAmount(jeTotals(e.lines).debit)}</TableAmount> },
    { key: 'credit', header: 'Credit', cell: (e) => <TableAmount currency="PHP">{formatAmount(jeTotals(e.lines).credit)}</TableAmount> },
    {
      key: 'check',
      header: 'Ready to post?',
      cell: (e) => {
        if (e.entryStatus === 'Closed')
          return (
            <TableLink onClick={() => navigate(`${JE_LIST_PATH}/${e.journalEntryId}`)}>
              {`Journal entry ${e.number}`}
            </TableLink>
          );
        const blocker = blockerOf(e);
        // The short version here; the reason shows on hover and when posting is refused.
        return blocker ? (
          <span title={blocker}>
            <Text variant="small" tone="danger">
              {/debits and credits/i.test(blocker) ? 'Not balanced' : 'Needs fixing'}
            </Text>
          </span>
        ) : (
          <Text variant="small" tone="muted">
            Ready
          </Text>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (e) => <TableStatus intent={e.entryStatus === 'Closed' ? 'default' : 'success'}>{e.entryStatus === 'Closed' ? 'Posted' : 'Open'}</TableStatus>,
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        type="details"
        icon="folder_open"
        title={`Journal voucher ${voucher.voucherNo}`}
        subcopy={`Created ${formatDate(voucher.createdOn)} by ${voucher.createdBy}`}
        status={<Badge size="small" intent={state.intent}>{state.label}</Badge>}
        actions={
          <>
            <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(JV_LIST_PATH)}>
              Back
            </Button>
            {menu.length ? <MoreMenu items={menu} /> : null}
            <Button
              type="button"
              intent="primary"
              variant="solid"
              size="extra-large"
              disabled={busy || !openEntries.length}
              onClick={() => post(openEntries)}
            >
              {busy ? 'Posting…' : 'Post voucher'}
            </Button>
          </>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice && !message ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        {message ? (
          <Alert intent={message.intent} variant="outline" title={message.title} onClose={() => setMessage(undefined)}>
            {message.text}
          </Alert>
        ) : null}

        <Section icon="info" title="Voucher">
          <Fields cols={3}>
            <ReadOnly label="Voucher No." value={String(voucher.voucherNo)} />
            <ReadOnly label="Entries" value={`${entries.length} · ${entries.length - openEntries.length} posted`} />
            <ReadOnly label="Ready to post" value={`${ready.length} of ${openEntries.length} open`} hint="Balanced, in an open period, on accounts that take manual postings." />
          </Fields>
          <Text variant="small" tone="muted">
            Entries here don’t touch the ledger. Post them one at a time or the whole voucher; each becomes its own journal entry. An entry can be saved unbalanced,
            but posting needs debits to equal credits.
          </Text>
        </Section>

        <Card className="flex-initial">
          <Card.Header
            icon={<Icon size={24}>table_rows</Icon>}
            actions={
              <div className="flex flex-wrap items-center gap-1">
                {pickedOpen.length ? (
                  <>
                    <Text variant="small" tone="muted">
                      {pickedOpen.length} selected
                    </Text>
                    <Button type="button" size="small" variant="ghost" disabled={busy} onClick={() => post(pickedOpen)}>
                      Post selected
                    </Button>
                    <Button type="button" size="small" variant="ghost" intent="danger" disabled={busy} onClick={() => removeEntries(pickedOpen)}>
                      Delete selected
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  size="small"
                  intent="primary"
                  variant="solid"
                  leadingIcon={<Icon size={16}>add</Icon>}
                  onClick={() => navigate(entryPath(voucher.id, 'new'))}
                >
                  Add entry
                </Button>
              </div>
            }
          >
            Entries
          </Card.Header>
          <Table
            caption="Voucher entries"
            columns={columns}
            rows={entries}
            getRowId={(e) => e.id}
            onRowAction={(e) => navigate(entryPath(voucher.id, e.id))}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
          />
          {!entries.length ? (
            <Text variant="small" tone="muted" className="p-4">
              No entries — add one, or delete the voucher.
            </Text>
          ) : null}
        </Card>
      </Panel.Body>
    </Panel>
  );
}
