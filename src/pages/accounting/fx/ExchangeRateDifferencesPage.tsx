import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Button, Checkbox, DatePicker, FormField, List, Panel, PanelHeader, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { Fields, Section } from '../../../components/form/fields';
import { accountText, type Account } from '../../../mocks/chartOfAccounts';
import type { ErdRow, ErdRun } from '../../../mocks/exchangeRateDifferences';
import { listApInvoices } from '../../../services/apInvoices';
import { listArInvoices } from '../../../services/arInvoices';
import { formatDate, todayISO } from '../../../services/dates';
import { defaultRates, erdLines, erdTotals, listErdRuns, nextDay, openForeignRows, postErdRun, type ErdMasters } from '../../../services/exchangeRateDifferences';
import { formatAmount } from '../../../services/format';
import { listItems } from '../../../services/items';
import { postingPeriodProblem, rowAccount } from '../../../services/journalEntries';
import { accounts as accountsCollection, companyTax, exchangeRates, rateOn, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../services/masterData';
import { listPartnersByRole } from '../../../services/partners';

const JE_PATH = '/accounting/journal-entries';

/** Month-end on or before today: the usual revaluation date. */
const lastMonthEnd = (today: string) => {
  const d = new Date(`${today.slice(0, 8)}01T00:00:00Z`);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};

/** Accounting › Exchange Rate Differences: revalue open foreign-currency invoices and bills at a period-end rate. */
export function ExchangeRateDifferencesPage() {
  const navigate = useNavigate();
  const [m, setM] = useState<ErdMasters & { accounts: Account[] }>();
  const [runs, setRuns] = useState<ErdRun[]>([]);
  const [date, setDate] = useState(lastMonthEnd(todayISO()));
  const [reversalDate, setReversalDate] = useState(nextDay(lastMonthEnd(todayISO())));
  const [rates, setRates] = useState<Record<string, number>>({});
  // Rows the user unticked; everything else with a rate is revalued.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [includeAr, setIncludeAr] = useState(true);
  const [includeAp, setIncludeAp] = useState(true);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [posting, setPosting] = useState(false);

  const load = async () => {
    const [arInvoices, apInvoices, customers, vendors, items, codes, [company], groups, withholding, wGroups, rateDays, accounts, past] = await Promise.all([
      listArInvoices(), listApInvoices(), listPartnersByRole('customer'), listPartnersByRole('vendor'), listItems(), taxCodes.list(), companyTax.list(), taxGroups.list(),
      withholdingTaxes.list(), withholdingGroups.list(), exchangeRates.list(), accountsCollection.list(), listErdRuns(),
    ]);
    setM({ arInvoices, apInvoices, customers, vendors, items, codes, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, rates: rateDays, accounts });
    setRuns([...past].sort((a, b) => b.date.localeCompare(a.date)));
  };
  useEffect(() => {
    void load();
  }, []);

  // The currencies with open documents, at the BSP rate on the date (typed-over rates stay).
  const currencies = useMemo(() => (m ? [...new Set([...m.arInvoices, ...m.apInvoices].filter((d) => d.status === 'Open' && d.currency !== 'PHP').map((d) => d.currency))].sort() : []), [m]);
  useEffect(() => {
    if (m) setRates(defaultRates(currencies, m.rates, date));
  }, [m, date, currencies]);
  const rows: ErdRow[] = useMemo(
    () => (m ? openForeignRows(date, rates, m).filter((r) => (r.docType === 'IN' ? includeAr : includeAp)).map((r) => ({ ...r, selected: Boolean(r.rate) && !unticked.has(r.id) })) : []),
    [m, date, rates, includeAr, includeAp, unticked],
  );

  if (!m) return <Text tone="muted" className="p-4">Loading open foreign-currency documents…</Text>;

  const totals = erdTotals(rows);
  const lines = erdLines(rows);
  const period = postingPeriodProblem(date) ?? (reversalDate <= date ? 'The reversal date must be after the revaluation date.' : postingPeriodProblem(reversalDate));
  const already = runs.find((r) => r.date === date);

  const post = async () => {
    setError(undefined);
    setPosting(true);
    try {
      const run = await postErdRun(date, reversalDate, rates, rows, remarks);
      setNotice(`Posted journal entry ${run.journalEntryNo}: unrealized gain PHP ${formatAmount(run.gain)}, loss PHP ${formatAmount(run.loss)}. It reverses on ${formatDate(run.reversalDate)}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  };

  const columns: TableColumn<ErdRow>[] = [
    { key: 'pick', header: '', cell: (r) => <Checkbox aria-label={`Revalue ${r.docNo}`} disabled={!r.rate} checked={r.selected} onChange={(e) => {
          const next = new Set(unticked);
          if (e.currentTarget.checked) next.delete(r.id);
          else next.add(r.id);
          setUnticked(next);
        }} /> },
    {
      key: 'doc',
      header: 'Document',
      cell: (r) => (
        <div className="flex flex-col">
          <Text variant="small">{r.docType === 'IN' ? 'A/R invoice' : 'A/P invoice'} {r.docNo}</Text>
          <Text variant="small" tone="muted">{r.partnerName}</Text>
        </div>
      ),
    },
    { key: 'balance', header: 'Open balance', cell: (r) => <span className="tabular-nums whitespace-nowrap">{r.currency} {formatAmount(r.balanceFc)}</span> },
    { key: 'booked', header: 'Booked rate', cell: (r) => <span className="tabular-nums">{r.bookedRate}</span> },
    { key: 'rate', header: 'Revaluation rate', cell: (r) => <span className="tabular-nums">{r.rate || '—'}</span> },
    {
      key: 'difference',
      header: 'Difference (PHP)',
      cell: (r) => {
        const effect = r.docType === 'IN' ? r.difference : -r.difference;
        return (
          <div className="flex flex-col whitespace-nowrap tabular-nums">
            <Text variant="small" tone={effect > 0 ? 'success' : effect < 0 ? 'danger' : 'muted'}>{formatAmount(Math.abs(r.difference))}</Text>
            <Text variant="small" tone="muted">{effect > 0 ? 'gain' : effect < 0 ? 'loss' : '—'} · {r.docType === 'IN' ? (r.difference > 0 ? 'Dr' : 'Cr') : r.difference > 0 ? 'Cr' : 'Dr'} {r.controlAccount}</Text>
          </div>
        );
      },
    },
  ];

  const runColumns: TableColumn<ErdRun>[] = [
    { key: 'date', header: 'Revaluation date', cell: (r) => formatDate(r.date) },
    { key: 'rates', header: 'Rates', cell: (r) => Object.entries(r.rates).map(([c, v]) => `${c} ${v}`).join(' · ') },
    { key: 'docs', header: 'Documents', cell: (r) => String(r.rows.length) },
    { key: 'gain', header: 'Gain / loss (PHP)', cell: (r) => <span className="tabular-nums">+{formatAmount(r.gain)} / −{formatAmount(r.loss)}</span> },
    { key: 'je', header: 'Journal entry', cell: (r) => <Button type="button" size="small" variant="ghost" onClick={() => navigate(`${JE_PATH}/${r.journalEntryId}`)}>{r.journalEntryNo} · reverses {formatDate(r.reversalDate)}</Button> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="currency_exchange"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32} iconVariant="outline"
        title="Exchange Rate Differences"
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Revaluation posted" onClose={() => setNotice(undefined)}>{notice}</Alert> : null}
        {error ? <Alert intent="danger" variant="outline" title="Can't post">{error}</Alert> : null}
        {already ? <Alert intent="warning" variant="outline" title="Already revalued">A run for {formatDate(date)} posted journal entry {already.journalEntryNo}. Posting again adds a second revaluation on top.</Alert> : null}

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <Section icon="event" title="Run">
            <Fields>
              <FormField label="Revaluation date" required error={postingPeriodProblem(date)} tooltip="Usually the last day of the period. Documents posted on or before it are revalued.">
                {(p) => <DatePicker {...p} value={date} onValueChange={(v) => { if (v) { setDate(v); setReversalDate(nextDay(v)); } }} />}
              </FormField>
              <FormField label="Reversal date" required error={reversalDate <= date ? 'Must be after the revaluation date.' : postingPeriodProblem(reversalDate)} tooltip="The entry reverses automatically on this day.">
                {(p) => <DatePicker {...p} value={reversalDate} onValueChange={(v) => v && setReversalDate(v)} />}
              </FormField>
              <div className="md:col-span-2 flex flex-wrap gap-6">
                <Checkbox checked={includeAr} onChange={(e) => setIncludeAr(e.currentTarget.checked)}>A/R invoices</Checkbox>
                <Checkbox checked={includeAp} onChange={(e) => setIncludeAp(e.currentTarget.checked)}>A/P invoices</Checkbox>
              </div>
              <div className="md:col-span-2">
                <TextField aria-label="Remarks" placeholder={`Exchange Rate Differences – ${formatDate(date)}`} value={remarks} onChange={(e) => setRemarks(e.currentTarget.value)} />
              </div>
            </Fields>
          </Section>
          <Section icon="currency_exchange" title="Rates">
            {currencies.length ? (
              <Fields>
                {currencies.map((c) => {
                  const bsp = rateOn(m.rates, c, date);
                  return (
                    <FormField key={c} label={`${c} → PHP`} tooltip="Defaults to the BSP reference rate on or before the date; type over it for this run.">
                      {(p) => (
                        <div className="flex flex-col gap-1">
                          <TextField {...p} type="number" min={0} value={String(rates[c] ?? '')} onChange={(e) => setRates({ ...rates, [c]: Number(e.currentTarget.value) || 0 })} />
                          <Text variant="small" tone="muted">{bsp ? `BSP ${bsp.rate} on ${formatDate(bsp.date)}` : 'No BSP rate on or before the date'}</Text>
                        </div>
                      )}
                    </FormField>
                  );
                })}
              </Fields>
            ) : (
              <Text variant="small" tone="muted">No open foreign-currency documents.</Text>
            )}
          </Section>
        </div>

        <DataTable
          variant="card"
          noPagination
          icon="table_rows"
          title="Open foreign-currency documents"
          description={`Open balance × (revaluation rate − booked rate). Gain PHP ${formatAmount(totals.gain)} · loss PHP ${formatAmount(totals.loss)} · net PHP ${formatAmount(totals.net)}.`}
          rows={rows}
          getRowId={(r) => r.id}
          columns={columns}
          unsortable={columns.map((c) => c.key)}
          empty={<Text variant="small" tone="muted">Nothing open in a foreign currency on {formatDate(date)}.</Text>}
        />

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <Section icon="account_balance" title="Journal entry">
            {lines.length ? (
              <List.Group divider>
                {lines.map((l) => (
                  <List.Item key={l.id} title={`${accountText(rowAccount(l, [...m.customers, ...m.vendors]), m.accounts)}${l.partnerId ? ` · ${[...m.customers, ...m.vendors].find((p) => p.id === l.partnerId)?.name ?? ''}` : ''}`} content={<span className="whitespace-nowrap tabular-nums">{l.debit ? `Dr ${formatAmount(l.debit)}` : `Cr ${formatAmount(l.credit)}`}</span>} />
                ))}
              </List.Group>
            ) : (
              <Text variant="small" tone="muted">Nothing to post: no ticked document has a difference at these rates.</Text>
            )}
            <Text variant="small" tone="muted">Dated {formatDate(date)}, trans. code FXRV, reversed on {formatDate(reversalDate)}.</Text>
            <div>
              <Button type="button" intent="primary" variant="solid" disabled={posting || !lines.length || Boolean(period)} onClick={post}>
                {posting ? 'Posting…' : 'Post revaluation'}
              </Button>
            </div>
            {period ? <Text variant="small" tone="danger">{period}</Text> : null}
          </Section>
          <DataTable icon="history" title="Previous runs" rows={runs} getRowId={(r) => r.id} columns={runColumns} unsortable={runColumns.map((c) => c.key)} noPagination empty={<Text variant="small" tone="muted">No revaluations posted yet.</Text>} />
        </div>
      </Panel.Body>
    </Panel>
  );
}
