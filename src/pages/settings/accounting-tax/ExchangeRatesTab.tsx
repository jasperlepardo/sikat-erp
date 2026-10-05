import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  FormField,
  Icon,
  Link,
  Table,
  TableStatus,
  Text,
  Textarea,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import { BSP_RERB_URL, type ExchangeRate } from '../../../mocks/currencies';
import { currencies, exchangeRates, parseBspBulletin } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { readXlsxText } from '../../../services/xlsx';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';
import { todayISO } from '../../../services/dates';

const today = () => todayISO();
const fmt = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 6 });

export function ExchangeRatesTab(route: ListRoute) {
  const { rows, save, reload } = useCollectionRows(exchangeRates);
  const allCurrencies = useAsync(currencies.list, []) ?? [];
  const foreign = allCurrencies.filter((c) => !c.isLocal);
  // The list shows a column per active foreign currency; the rest are on the day's page.
  const shown = foreign.filter((c) => c.active);
  const [importing, setImporting] = useState(false);

  const sorted = useMemo(() => [...(rows ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [rows]);

  return (
    <>
      {importing ? (
        <BspImport
          existing={rows ?? []}
          codes={foreign.map((c) => c.code)}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            reload();
          }}
        />
      ) : null}
      <MasterList<ExchangeRate>
      {...route}
        icon="trending_up"
        title="Exchange rates"
        noun="day"
        description={
          <>
            One record per day: pesos per 1 unit of each foreign currency. Documents use the latest rate on or before
            their posting date. Source: the{' '}
            <Link href={BSP_RERB_URL} target="_blank" rel="noreferrer">
              BSP Reference Exchange Rate Bulletin
            </Link>
            , published every banking day.
          </>
        }
        rows={sorted}
        defaultSort={{ key: 'date', direction: 'desc' }}
        sortValue={(r, key) =>
          key === 'date' || key === 'source' ? r[key] : key === 'count' ? Object.keys(r.rates).length : (r.rates[key] ?? -1)
        }
        actions={
          <Button
            type="button"
            size="small"
            variant="ghost"
            leadingIcon={<Icon size={16}>download</Icon>}
            onClick={() => setImporting(true)}
          >
            Import BSP bulletin
          </Button>
        }
        columns={[
          { key: 'date', header: 'Date', cell: (r) => r.date },
          ...shown.map((c) => ({
            key: c.code,
            header: `${c.code} (PHP)`,
            cell: (r: ExchangeRate) =>
              r.rates[c.code] ? fmt(r.rates[c.code]) : <span className="text-muted">{r.unavailable.includes(c.code) ? 'N/A' : '—'}</span>,
          })),
          {
            key: 'count',
            header: 'Currencies',
            cell: (r) => (
              <span className="text-muted">
                {Object.keys(r.rates).length} of {foreign.length}
              </span>
            ),
          },
          {
            key: 'source',
            header: 'Source',
            cell: (r) => <TableStatus intent={r.source === 'BSP RERB' ? 'primary' : 'default'}>{r.source}</TableStatus>,
          },
        ]}
        searchText={(r) => `${r.date} ${r.source}`}
        blank={() => ({ id: newId('fx'), date: today(), rates: {}, unavailable: [], source: 'Manual' })}
        label={(r) => `Rates on ${r.date}`}
        validate={(r, all) => {
          const e: Record<string, string> = {};
          if (!r.date) e.date = 'Pick a date.';
          else if (all.some((x) => x.id !== r.id && x.date === r.date)) e.date = `${r.date} already has rates — open that day instead.`;
          for (const [code, rate] of Object.entries(r.rates)) if (!(rate > 0)) e[`rate-${code}`] = 'Enter a rate above 0, or clear it.';
          if (!Object.keys(r.rates).length) e.rates = 'Enter at least one rate.';
          return e;
        }}
        onSave={save}
        editor={(r, update, errors) => {
          const f = bind(r, update);
          const setRate = (code: string, value: string) => {
            const rates = { ...r.rates };
            if (value === '') delete rates[code];
            else rates[code] = Number(value);
            update({ rates });
          };
          return (
            <>
              <Fields cols={3}>
                {f.date('date', 'Date', { required: true, error: errors.date })}
                {f.pick('source', 'Source', ['BSP RERB', 'Manual'])}
              </Fields>
              {errors.rates ? (
                <Alert intent="danger" variant="outline" title={errors.rates}>
                  Pesos per 1 unit of the currency. Leave a currency blank if it has no rate that day.
                </Alert>
              ) : null}
              <Fields cols={3}>
                {foreign.map((c) => (
                  <FormField
                    key={c.code}
                    label={`${c.code} · ${c.name}`}
                    error={errors[`rate-${c.code}`]}
                    hint={r.unavailable.includes(c.code) ? 'N/A on this bulletin.' : undefined}
                  >
                    {(p) => (
                      <TextField
                        {...p}
                        type="number"
                        prefix="₱"
                        placeholder="No rate"
                        value={r.rates[c.code] != null ? String(r.rates[c.code]) : ''}
                        onChange={(e) => setRate(c.code, e.currentTarget.value)}
                      />
                    )}
                  </FormField>
                ))}
              </Fields>
            </>
          );
        }}
      />
    </>
  );
}

/**
 * Upload the day's RERB.xlsx or paste the bulletin (from the web page or the PDF);
 * rows are matched by ISO code and the peso-equivalent column (the last number) is taken.
 */
function BspImport({
  existing,
  codes,
  onClose,
  onImported,
}: {
  existing: ExchangeRate[];
  codes: string[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [date, setDate] = useState(today());
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const bulletin = useMemo(() => parseBspBulletin(text, codes), [text, codes]);
  const parsed = bulletin.rates;
  const day = existing.find((d) => d.date === date);
  const prior = (code: string) => day?.rates[code];

  const load = (next: string) => {
    setText(next);
    // Take the date printed on the bulletin, e.g. "05 October 2026".
    const found = parseBspBulletin(next, codes).date;
    if (found) setDate(found);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setFileError('');
    setFileName(file.name);
    try {
      load(await readXlsxText(file));
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Could not read the file.');
    }
  };

  const run = async () => {
    setSaving(true);
    // One record for the day: the bulletin's rates over any already saved for that date.
    await exchangeRates.save({
      id: day?.id ?? `fx-${date}`,
      date,
      rates: { ...day?.rates, ...Object.fromEntries(parsed.map((r) => [r.currency, r.rate])) },
      unavailable: bulletin.unavailable,
      source: 'BSP RERB',
    });
    setSaving(false);
    onImported();
  };

  return (
    <Section
      icon="download"
      title="Import BSP Reference Exchange Rate Bulletin"
      actions={
        <div className="flex gap-1">
          <Button type="button" size="small" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="small"
            intent="primary"
            variant="solid"
            disabled={!parsed.length || saving}
            onClick={run}
          >
            {saving ? 'Importing…' : `Import ${parsed.length || ''} rate${parsed.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      }
    >
      <ol className="list-decimal space-y-1 pl-5 text-sm text-body">
        <li>
          Open the{' '}
          <Link href={BSP_RERB_URL} target="_blank" rel="noreferrer">
            BSP exchange rate page
          </Link>{' '}
          and download the day’s Reference Exchange Rate Bulletin (RERB.xlsx).
        </li>
        <li>Upload it below — or copy the bulletin table from the web page or PDF and paste it.</li>
        <li>Check the preview. Rates are pesos per unit (the “Phil. peso equivalent” column).</li>
      </ol>
      <Fields cols={3}>
        <FormField label="Bulletin date" required>
          {(p) => <DatePicker {...p} value={date} onValueChange={setDate} />}
        </FormField>
        <FormField label="Bulletin file" error={fileError} hint={fileName || 'RERB.xlsx from the BSP site.'}>
          {() => (
            <div>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  void upload(e.currentTarget.files?.[0]);
                  e.currentTarget.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                leadingIcon={<Icon size={16}>upload_file</Icon>}
                onClick={() => fileInput.current?.click()}
              >
                Upload RERB.xlsx
              </Button>
            </div>
          )}
        </FormField>
      </Fields>
      <FormField label="Bulletin text">
        {(p) => (
          <Textarea
            {...p}
            rows={8}
            placeholder={'e.g.\nUnited States  Dollar  USD  …  61.5060\nJapan  Yen  JPY  …  0.3836'}
            value={text}
            onChange={(e) => {
              setFileName('');
              load(e.currentTarget.value);
            }}
          />
        )}
      </FormField>
      {text && !parsed.length ? (
        <Alert intent="warning" variant="outline" title="No rates found">
          Each row needs a currency code (e.g. USD) and its peso equivalent as the last number.
        </Alert>
      ) : null}
      {parsed.length ? (
        <Card>
          <Table
            caption="Rates to import"
            getRowId={(r) => r.currency}
            rows={parsed}
            columns={[
              { key: 'currency', header: 'Currency', cell: (r) => r.currency },
              { key: 'rate', header: 'PHP per unit', cell: (r) => fmt(r.rate) },
              {
                key: 'action',
                header: 'Action',
                cell: (r) => {
                  const was = prior(r.currency);
                  return was == null ? (
                    <TableStatus intent="success">New</TableStatus>
                  ) : was === r.rate ? (
                    <TableStatus intent="default">Unchanged</TableStatus>
                  ) : (
                    <TableStatus intent="warning">Replaces {fmt(was)}</TableStatus>
                  );
                },
              },
            ]}
          />
        </Card>
      ) : null}
      {bulletin.unavailable.length ? (
        <Text variant="small" tone="muted">
          Quoted as N/A on this bulletin, so not imported: {bulletin.unavailable.join(', ')}.
        </Text>
      ) : null}
      <Text variant="caption">
        The date is read from the bulletin when present. Currencies not set up on the Currencies tab are skipped.
      </Text>
    </Section>
  );
}
