import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Link, Panel, PanelHeader, Table, TableAmount, TableContent, TableStatus, Tabs, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { choiceField, dateField, numberField, textField } from '../../../components/filter/fieldKit';
import { EMPTY_FILTER, oneRule } from '../../../components/filter/engine';
import { useListPresets } from '../../../components/filter/useListPresets';
import { useListPage } from '../../../components/form/DataTable';
import { MoreMenu } from '../../../components/form/MoreMenu';
import { formatDate, todayISO } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listPayments } from '../../../services/outgoingPayments';
import { useAsync } from '../../../services/useAsync';
import { InvoicePanel } from './InvoicePanel';
import { BANK_PAYMENTS_PATH, BILL_STATUSES, BILL_STATUS_INTENT, billsOf, loadPayablesMasters, sumByCurrency, type Bill } from './payables';

/** Where "Create payment run" goes until the payment run screen is built. */
export const PAYMENT_RUN_PATH = '/banking/payment-orders';

interface VendorRow {
  kind: 'vendor';
  id: string;
  vendorId: string;
  name: string;
  code: string;
  currency: string;
  bills: BillRow[];
  earliestDue: string;
  maxDaysOverdue: number;
  overdue: number;
  balance: number;
  /** The vendor's whole open balance, to say when the filtered sum is only part of it. */
  fullBalance: number;
}
interface BillRow {
  kind: 'bill';
  id: string;
  bill: Bill;
}
type Row = VendorRow | BillRow;

const OPEN: string[] = ['Unpaid', 'Partially paid'];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

const fields = [
  textField<Bill>('no', 'A/P no.', (b) => b.no),
  textField<Bill>('vendorRef', 'Vendor invoice no.', (b) => b.vendorRef),
  textField<Bill>('vendor', 'Vendor', (b) => `${b.invoice.vendorName} ${b.invoice.vendorCode}`),
  dateField<Bill>('dueDate', 'Due date', (b) => b.dueDate),
  choiceField<Bill>('status', 'Status', BILL_STATUSES, (b) => b.status),
  numberField<Bill>('daysOverdue', 'Days overdue', (b) => b.daysOverdue),
  numberField<Bill>('balanceDue', 'Balance due', (b) => b.balanceDue),
  textField<Bill>('currency', 'Currency', (b) => b.currency),
];

/**
 * Payables (Banking › Outgoing Payments): what we owe, grouped by vendor, and where a payment
 * starts. Ticking bills shows the action bar: one vendor → Pay, several → Create payment run.
 */
export function PayablesPage() {
  const navigate = useNavigate();
  const data = useAsync(() => Promise.all([loadPayablesMasters(), listPayments()]), []);
  const today = todayISO();
  const bills = useMemo(() => (data ? billsOf(data[0], today) : undefined), [data, today]);
  const [query, setQuery] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [panelId, setPanelId] = useState<string | null>(null);
  const { resetPage, paginate } = useListPage(10);
  const presets = useListPresets({
    list: 'payables',
    fields,
    builtIns: [
      { id: 'open', name: 'Open bills', filter: oneRule('status', 'in', OPEN) },
      { id: 'overdue', name: 'Overdue bills', filter: { match: 'all', rules: [{ id: 'status', field: 'status', op: 'in', value: OPEN }, { id: 'days', field: 'daysOverdue', op: 'gt', value: 0 }] } },
      { id: 'all', name: 'All bills', filter: EMPTY_FILTER },
    ],
    defaultSort: null,
    rows: bills,
    onChange: resetPage,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return presets
      .apply(bills ?? [])
      .filter((b) => !q || [b.invoice.vendorName, b.invoice.vendorCode, b.no, b.vendorRef].join(' ').toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, presets.filter, query]);

  // Vendors with the most overdue first; their bills by due date.
  const groups = useMemo(() => {
    const byVendor = new Map<string, Bill[]>();
    for (const b of filtered) byVendor.set(b.vendorId, [...(byVendor.get(b.vendorId) ?? []), b]);
    return [...byVendor].map(([vendorId, list]): VendorRow => {
      const sorted = [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const open = sorted.filter((b) => b.balanceDue > 0);
      const first = sorted[0].invoice;
      return {
        kind: 'vendor',
        id: `v:${vendorId}`,
        vendorId,
        name: first.vendorName,
        code: first.vendorCode,
        currency: first.currency,
        bills: sorted.map((bill) => ({ kind: 'bill', id: bill.id, bill })),
        earliestDue: open[0]?.dueDate ?? '',
        maxDaysOverdue: Math.max(0, ...open.map((b) => b.daysOverdue)),
        overdue: round2(open.filter((b) => b.daysOverdue > 0).reduce((n, b) => n + b.balanceDue, 0)),
        balance: round2(sorted.reduce((n, b) => n + b.balanceDue, 0)),
        fullBalance: round2((bills ?? []).filter((b) => b.vendorId === vendorId).reduce((n, b) => n + b.balanceDue, 0)),
      };
    }).sort((a, b) => b.overdue - a.overdue || b.balance - a.balance);
  }, [filtered, bills]);

  const { visible, pagination } = paginate(groups);
  const billOf = new Map((bills ?? []).map((b) => [b.id, b]));
  const payable = (id: string) => (billOf.get(id)?.balanceDue ?? 0) > 0;
  const tickedBills = ticked.map((id) => billOf.get(id)!).filter(Boolean);
  const vendorIds = [...new Set(tickedBills.map((b) => b.vendorId))];
  const filteredIds = new Set(filtered.map((b) => b.id));
  const hiddenCount = tickedBills.filter((b) => !filteredIds.has(b.id)).length;
  const matching = filtered.filter((b) => b.balanceDue > 0);
  const total = sumByCurrency(tickedBills.map((b) => ({ currency: b.currency, amount: b.balanceDue })), formatAmount);

  // The table reports the ticked rows on this page; keep ticks elsewhere (other pages, hidden by filters).
  const onPage = new Set(visible.flatMap((g) => g.bills.map((r) => r.id)));
  const select = (ids: string[]) => setTicked([...ticked.filter((id) => !onPage.has(id)), ...ids.filter((id) => onPage.has(id) && payable(id))]);

  const pay = () => navigate(`${BANK_PAYMENTS_PATH}/new`, { state: { vendorId: vendorIds[0], invoiceIds: ticked } });
  const run = () => navigate(PAYMENT_RUN_PATH, { state: { invoiceIds: ticked } });

  const columns: TableColumn<Row>[] = [
    {
      key: 'name',
      header: 'Vendor / Invoice',
      cell: (r) =>
        r.kind === 'vendor' ? (
          <div className="flex flex-col py-1">
            <span className="font-semibold">{r.name}</span>
            <Text as="span" variant="small" tone="muted">
              {r.code} · {plural(r.bills.filter((b) => b.bill.balanceDue > 0).length, 'open bill')}
              {r.overdue ? <span className="text-(--color-text-danger)"> · {formatAmount(r.overdue)} overdue</span> : null}
              {r.balance !== r.fullBalance ? ` · filtered (of ${formatAmount(r.fullBalance)})` : null}
            </Text>
          </div>
        ) : (
          <TableContent onClick={() => setPanelId(r.bill.id)} subcopy={r.bill.vendorRef || undefined}>{r.bill.no}</TableContent>
        ),
    },
    { key: 'dueDate', header: 'Due date', cell: (r) => (r.kind === 'vendor' ? (r.earliestDue ? formatDate(r.earliestDue) : '—') : r.bill.dueDate ? formatDate(r.bill.dueDate) : '—') },
    {
      key: 'daysOverdue',
      header: 'Days overdue',
      align: 'end',
      cell: (r) => {
        const days = r.kind === 'vendor' ? r.maxDaysOverdue : r.bill.balanceDue > 0 ? r.bill.daysOverdue : 0;
        return days > 0 ? <span className="text-(--color-text-danger) tabular-nums">{days}</span> : '—';
      },
    },
    { key: 'status', header: 'Status', cell: (r) => (r.kind === 'bill' ? <TableStatus intent={BILL_STATUS_INTENT[r.bill.status]}>{r.bill.status}</TableStatus> : null) },
    { key: 'total', header: 'Total', align: 'end', cell: (r) => (r.kind === 'bill' ? <TableAmount currency={r.bill.currency}>{formatAmount(r.bill.total)}</TableAmount> : null) },
    {
      key: 'balance',
      header: 'Balance due',
      align: 'end',
      cell: (r) => <TableAmount currency={r.kind === 'vendor' ? r.currency : r.bill.currency}>{formatAmount(r.kind === 'vendor' ? r.balance : r.bill.balanceDue)}</TableAmount>,
    },
  ];

  const panelBill = panelId ? billOf.get(panelId) : undefined;
  const nothingOpen = bills && !bills.some((b) => b.balanceDue > 0);

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search payables"
        searchPlaceholder="Search by vendor, A/P no. or vendor invoice no."
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="payments"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={presets.menu}
        tabs={<OutgoingTabs value="payables" />}
        actions={
          <MoreMenu
            label="New Payment"
            button={{ intent: 'primary' }}
            items={[
              { label: 'Payment', icon: 'payments', onSelect: () => navigate(`${BANK_PAYMENTS_PATH}/new`) },
              { label: 'Payment run', icon: 'checklist', onSelect: () => navigate(PAYMENT_RUN_PATH) },
            ]}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <Text tone="muted" variant="small">What we owe, by vendor. Tick bills to pay them.</Text>
        {presets.bar(null)}
        <Card className="flex-initial">
          {!bills ? (
            <Text tone="muted" className="p-4">Loading payables…</Text>
          ) : nothingOpen && !filtered.length ? (
            <Text tone="muted" className="p-4">Nothing to pay — every bill is paid.</Text>
          ) : !groups.length ? (
            <div className="flex items-center gap-2 p-4">
              <Text tone="muted">No bills match these filters.</Text>
              <Link
                intent="primary"
                onClick={() => {
                  presets.setFilter(EMPTY_FILTER);
                  setQuery('');
                }}
              >
                Clear all
              </Link>
            </div>
          ) : (
            <Table<Row>
              caption="Payables by vendor"
              columns={columns}
              rows={visible}
              getRowId={(r) => r.id}
              getSubRows={(r) => (r.kind === 'vendor' ? r.bills : undefined)}
              selectable
              selectedIds={ticked}
              onSelectionChange={select}
              pagination={pagination}
            />
          )}
        </Card>

        {ticked.length ? (
          <Card className="sticky bottom-0 z-10 flex-initial">
            <Card.Content>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-1 flex-col">
                  <Text as="span" className="font-semibold">
                    {vendorIds.length === 1
                      ? `${plural(tickedBills.length, 'bill')} · ${tickedBills[0].invoice.vendorName} · ${total}`
                      : `${plural(tickedBills.length, 'bill')} · ${vendorIds.length} vendors · ${total} · creates ${vendorIds.length} payments`}
                  </Text>
                  {hiddenCount ? <Text as="span" variant="small" tone="muted">{plural(hiddenCount, 'ticked bill')} {hiddenCount === 1 ? 'is' : 'are'} hidden by filters</Text> : null}
                  {matching.length > ticked.filter((id) => filteredIds.has(id)).length ? (
                    <Link intent="primary" onClick={() => setTicked([...new Set([...ticked, ...matching.map((b) => b.id)])])}>
                      Select all {plural(matching.length, 'bill')} matching filters
                    </Link>
                  ) : null}
                </div>
                <Button type="button" intent="white" variant="ghost" size="medium" shape="pill" onClick={() => setTicked([])}>Clear</Button>
                {vendorIds.length === 1 ? (
                  <Button type="button" intent="primary" variant="solid" size="medium" shape="pill" onClick={pay}>Pay</Button>
                ) : (
                  <Button type="button" intent="primary" variant="solid" size="medium" shape="pill" onClick={run}>Create payment run</Button>
                )}
              </div>
            </Card.Content>
          </Card>
        ) : null}
      </Panel.Body>
      {presets.panel}
      {panelBill && data ? <InvoicePanel bill={panelBill} m={data[0]} payments={data[1]} onClose={() => setPanelId(null)} /> : null}
    </Panel>
  );
}

/** Payables | Payments, at the top of both lists. */
export function OutgoingTabs({ value }: { value: 'payables' | 'payments' }) {
  const navigate = useNavigate();
  return (
    <Tabs
      variant="outline"
      value={value}
      onValueChange={(v) => navigate(v === 'payables' ? BANK_PAYMENTS_PATH : `${BANK_PAYMENTS_PATH}/payments`)}
      items={[
        { value: 'payables', label: 'Payables' },
        { value: 'payments', label: 'Payments' },
      ]}
    />
  );
}
