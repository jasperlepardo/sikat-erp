import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Icon,
  List,
  Select,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Tabs,
  Text,
  TextField,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../../../components/form/DataTable';
import { formatAmount } from '../../../services/format';
import { useAsync } from '../../../services/useAsync';
import { EditPanel } from './EditPanel';
import { accountKind } from './PaymentAccounts';
import { accountsOf, methodTitle, paymentEntries, type PaymentEntry } from './PaymentMethodsTab';
import { DOC_SOURCES, docTypesFor, listPartnerDocuments, type DocType, type PartnerDocument } from './partnerDocuments';
import { Fields, Section, bind, type Draft } from './fields';

type Filter = 'open' | 'overdue' | 'all';

const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (d: PartnerDocument) => d.open && !!d.dueDate && d.dueDate < today();

const entryLabel = (e: PaymentEntry) => {
  const kind = accountKind(e.code);
  return e.account && kind ? `${methodTitle(e.code)} · ${kind.title(e.account)}` : methodTitle(e.code);
};
const entryId = (e: PaymentEntry) => e.account?.id ?? e.code;

/** Amounts summed per currency, e.g. "PHP 1,200.00 · USD 300.00". */
const sum = (docs: PartnerDocument[]) => {
  const byCurrency = new Map<string, number>();
  for (const d of docs) byCurrency.set(d.currency, (byCurrency.get(d.currency) ?? 0) + d.total);
  return [...byCurrency].map(([cur, n]) => `${cur} ${formatAmount(n)}`).join(' · ') || '—';
};

/**
 * Every document the partner is on — purchase requests, RFQs, POs, quotations, sales orders —
 * in one list. Types without a module yet show as "not built". Paying is a preview that isn't saved.
 */
export function TransactionsTab({ draft }: { draft: Draft }) {
  const navigate = useNavigate();
  const types = docTypesFor(draft.roles);
  const docs = useAsync(() => (draft.id ? listPartnerDocuments(draft.id, types) : Promise.resolve([])), [draft.id, types.join()]);
  const [filter, setFilter] = useState<Filter>('open');
  const [type, setType] = useState<DocType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<TableSort | null>({ key: 'date', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [paying, setPaying] = useState<PartnerDocument[] | null>(null);
  const [notice, setNotice] = useState('');

  if (!docs) return <Text tone="muted" className="p-4">Loading transactions…</Text>;

  const ofType = docs.filter((d) => type === 'all' || d.type === type);
  const open = ofType.filter((d) => d.open);
  const overdue = ofType.filter(isOverdue);
  const q = query.trim().toLowerCase();
  const rows = (filter === 'all' ? ofType : filter === 'open' ? open : overdue).filter(
    (d) => !q || [d.number, d.subcopy, DOC_SOURCES[d.type].label, d.status].join(' ').toLowerCase().includes(q),
  );
  const dir = sort?.direction === 'asc' ? 1 : -1;
  const sortKey = sort?.key as keyof PartnerDocument | undefined;
  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const x = a[sortKey] ?? '';
        const y = b[sortKey] ?? '';
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      })
    : rows;
  const picked = docs.filter((d) => selected.includes(d.id));
  // Only open, payable documents in one currency can be paid together.
  const payable = picked.length > 0 && picked.every((d) => d.open && d.payable) && new Set(picked.map((d) => d.currency)).size === 1;
  const nextDue = [...open].filter((d) => d.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const notBuilt = types.filter((t) => !DOC_SOURCES[t].list).map((t) => DOC_SOURCES[t].label.toLowerCase());

  const columns: TableColumn<PartnerDocument>[] = [
    {
      key: 'number',
      header: 'Document',
      cell: (d) => (
        <TableSubcontent subcopy={[DOC_SOURCES[d.type].label, d.subcopy].filter(Boolean).join(' · ')}>
          <TableLink onClick={() => navigate(d.href)}>{d.number}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'date', header: 'Date', cell: (d) => d.date },
    { key: 'dueDate', header: 'Due date', cell: (d) => (isOverdue(d) ? <TableStatus intent="danger">{d.dueDate}</TableStatus> : d.dueDate || '—') },
    { key: 'status', header: 'Status', cell: (d) => <TableStatus intent={d.intent}>{d.status}</TableStatus> },
    { key: 'total', header: 'Total', cell: (d) => <TableAmount currency={d.currency}>{formatAmount(d.total)}</TableAmount> },
  ];

  return (
    <div className="flex flex-col gap-2">
      {notice ? <Alert intent="success" variant="outline" title={notice} /> : null}

      <div className="grid gap-2 md:grid-cols-3">
        <Stat icon="pending_actions" label="Open" value={sum(open)} sub={`${open.length} document${open.length === 1 ? '' : 's'}`} />
        <Stat icon="event_busy" label="Overdue" value={sum(overdue)} sub={`${overdue.length} past due date`} />
        <Stat
          icon="event"
          label="Next due"
          value={nextDue ? `${nextDue.currency} ${formatAmount(nextDue.total)}` : '—'}
          sub={nextDue ? `${nextDue.number} · due ${nextDue.dueDate}` : 'Nothing open'}
        />
      </div>

      {/* The Transactions card: filters and search in its body, then the table in its own card. */}
      <Card>
        <Card.Header
          icon={<Icon size={24}>receipt_long</Icon>}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {picked.length ? (
                <>
                  <Text variant="small" tone="muted">
                    {picked.length} selected
                  </Text>
                  <Button
                    type="button"
                    size="small"
                    intent="primary"
                    variant="solid"
                    disabled={!payable || draft.paymentBlock}
                    title={draft.paymentBlock ? 'Payment block is on for this partner.' : payable ? undefined : 'Pick open purchase orders in one currency.'}
                    onClick={() => setPaying(picked)}
                  >
                    Pay {sum(picked)}
                  </Button>
                </>
              ) : null}
              <div className="w-56">
                <Select
                  aria-label="Document type"
                  options={[{ value: 'all', label: 'All document types' }, ...types.map((t) => ({ value: t, label: DOC_SOURCES[t].label }))]}
                  value={type}
                  onValueChange={(v) => {
                    setType((v || 'all') as DocType | 'all');
                    setSelected([]);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          }
        >
          Transactions
        </Card.Header>
        <Card.Content>
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              setSelected([]);
              setPage(1);
            }}
            items={[
              { value: 'open', label: 'Open', badge: String(open.length) },
              { value: 'overdue', label: 'Overdue', badge: String(overdue.length) },
              { value: 'all', label: 'All', badge: String(ofType.length) },
            ]}
          />
          <TextField
            aria-label="Search transactions"
            placeholder="Search by document no., reference or status"
            leadingIcon={<Icon size={20}>search</Icon>}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setPage(1);
            }}
          />
          <Card className="table-scroll">
            {rows.length ? (
              <Table
                caption="Transactions"
                columns={columns.map((c) => ({ sortable: true, ...c }))}
                rows={sorted.slice((page - 1) * pageSize, page * pageSize)}
                getRowId={(d) => d.id}
                sort={sort}
                onSortChange={setSort}
                onRowAction={(d) => navigate(d.href)}
                selectable
                selectedIds={selected}
                onSelectionChange={setSelected}
                pagination={{
                  page,
                  pageSize,
                  total: sorted.length,
                  pageSizes: PAGE_SIZES,
                  onPageChange: setPage,
                  onPageSizeChange: (size) => {
                    setPageSize(size);
                    setPage(1);
                  },
                }}
              />
            ) : (
              <Text variant="small" tone="muted" className="p-4">
                {query ? 'Nothing matches the search.' : filter === 'open' ? 'Nothing open.' : filter === 'overdue' ? 'Nothing overdue.' : 'No documents yet.'}
              </Text>
            )}
          </Card>
        </Card.Content>
      </Card>
      {notBuilt.length ? (
        <Text variant="small" tone="muted" className="px-2">
          Not built yet, so not listed: {notBuilt.join(', ')}.
        </Text>
      ) : null}

      {paying ? (
        <PayPanel
          draft={draft}
          docs={paying}
          onCancel={() => setPaying(null)}
          onDone={(summary) => {
            setPaying(null);
            setSelected([]);
            setNotice(summary);
          }}
        />
      ) : null}
    </div>
  );
}

/** A labelled figure in a card (a stand-in until the design system has a Stat tile). */
function Stat({ icon, label, value, sub }: { icon: string; label: string; value: string; sub: string }) {
  return (
    <Card>
      <Card.Header icon={<Icon size={24}>{icon}</Icon>}>{label}</Card.Header>
      <Card.Content>
        <Text variant="h3" as="p">
          {value}
        </Text>
        <Text variant="small" tone="muted">
          {sub}
        </Text>
      </Card.Content>
    </Card>
  );
}

/** Preview of paying the selected documents: amounts, date and how. Not saved — there are no payments yet. */
function PayPanel({
  draft,
  docs,
  onCancel,
  onDone,
}: {
  draft: Draft;
  docs: PartnerDocument[];
  onCancel: () => void;
  onDone: (summary: string) => void;
}) {
  const entries = paymentEntries(draft);
  // Start with the partner's default: its default method, and that method's default account.
  const preferred =
    entries.find((e) => e.code === draft.defaultPaymentMethod && (!e.account || accountsOf(draft, e.code).defaultAccountId === e.account.id)) ??
    entries[0];
  const [form, setForm] = useState({ date: today(), via: preferred ? entryId(preferred) : '' });
  const f = bind(form, (p: Partial<typeof form>) => setForm((x) => ({ ...x, ...p })));
  const currency = docs[0].currency;
  const total = docs.reduce((n, d) => n + d.total, 0);
  const via = entries.find((e) => entryId(e) === form.via);

  return (
    <EditPanel
      icon="payments"
      title={`Pay ${draft.name}`}
      onCancel={onCancel}
      onDone={() =>
        onDone(`Preview only: ${currency} ${formatAmount(total)} to ${draft.name} by ${via ? entryLabel(via) : 'no method'} on ${form.date} — not saved.`)
      }
    >
      <Section icon="receipt_long" title={`${docs.length} document${docs.length === 1 ? '' : 's'}`}>
        <List.Group divider>
          {docs.map((d) => (
            <List.Item key={d.id} title={d.number} content={`${currency} ${formatAmount(d.total)}`} />
          ))}
          <List.Item
            title={<Text as="span" weight="semibold" tone="heading">Total</Text>}
            content={<Text as="span" weight="semibold" tone="heading">{`${currency} ${formatAmount(total)}`}</Text>}
          />
        </List.Group>
      </Section>
      <Section icon="payments" title="Payment">
        <Fields>
          {f.date('date', 'Payment date')}
          {f.choose(
            'via',
            'Pay by',
            entries.map((e) => ({ value: entryId(e), label: entryLabel(e) })),
            { hint: 'The partner’s payment methods and accounts (side column).' },
          )}
        </Fields>
        <Text variant="small" tone="muted">
          Sketch: in the real flow you pay bills, not orders, and expanded withholding tax is deducted here with BIR Form 2307 issued.
        </Text>
      </Section>
    </EditPanel>
  );
}
