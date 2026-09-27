import { useMemo, useState } from 'react';
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
} from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../components/form/fields';
import { MasterList } from '../../../components/form/MasterList';
import { BSP_RERB_URL, type ExchangeRate } from '../../../mocks/currencies';
import { currencies, exchangeRates, parseBspBulletin } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { newId, useCollectionRows } from './useCollectionRows';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 6 });

export function ExchangeRatesTab() {
  const { rows, save, reload } = useCollectionRows(exchangeRates);
  const allCurrencies = useAsync(currencies.list, []) ?? [];
  const foreign = allCurrencies.filter((c) => !c.isLocal);
  const [importing, setImporting] = useState(false);

  const sorted = useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.date.localeCompare(a.date) || a.currency.localeCompare(b.currency)),
    [rows],
  );

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
        icon="trending_up"
        title="Exchange rates"
        noun="exchange rate"
        description={
          <>
            Pesos per 1 unit of foreign currency, one rate per currency per day. Documents use the latest rate on or
            before their posting date. Source: the{' '}
            <Link href={BSP_RERB_URL} target="_blank" rel="noreferrer">
              BSP Reference Exchange Rate Bulletin
            </Link>
            , published every banking day.
          </>
        }
        rows={sorted}
        defaultSort={{ key: 'date', direction: 'desc' }}
        sortValue={(r, key) =>
          key === 'inverse' ? 1 / r.rate : key === 'rate' ? r.rate : String(r[key as keyof ExchangeRate])
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
          {
            key: 'currency',
            header: 'Currency',
            cell: (r) => `${r.currency} · ${allCurrencies.find((c) => c.code === r.currency)?.name ?? ''}`,
          },
          { key: 'rate', header: 'PHP per unit', cell: (r) => fmt(r.rate) },
          {
            key: 'inverse',
            header: 'Units per PHP',
            cell: (r) => <span className="text-muted">{fmt(1 / r.rate)}</span>,
          },
          {
            key: 'source',
            header: 'Source',
            cell: (r) => <TableStatus intent={r.source === 'BSP RERB' ? 'primary' : 'default'}>{r.source}</TableStatus>,
          },
        ]}
        searchText={(r) => `${r.date} ${r.currency} ${r.source}`}
        blank={() => ({ id: newId('fx'), date: today(), currency: 'USD', rate: 0, source: 'Manual' })}
        label={(r) => `${r.currency} on ${r.date}`}
        validate={(r, all) => {
          const e: Record<string, string> = {};
          if (!r.date) e.date = 'Pick a date.';
          if (!r.currency) e.currency = 'Pick a currency.';
          if (!(r.rate > 0)) e.rate = 'Enter a rate above 0.';
          if (all.some((x) => x.id !== r.id && x.date === r.date && x.currency === r.currency))
            e.currency = `${r.currency} already has a rate for ${r.date}.`;
          return e;
        }}
        onSave={save}
        editor={(r, update, errors) => {
          const f = bind(r, update);
          return (
            <Fields cols={3}>
              {f.date('date', 'Date', { required: true, error: errors.date })}
              {f.choose(
                'currency',
                'Currency',
                foreign.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })),
                { required: true, error: errors.currency },
              )}
              {f.num('rate', `PHP per 1 ${r.currency}`, { required: true, error: errors.rate, prefix: '₱' })}
              {f.pick('source', 'Source', ['BSP RERB', 'Manual'])}
            </Fields>
          );
        }}
      />
    </>
  );
}

/**
 * Paste the day's BSP bulletin (copy the table from the web page or the PDF); rows
 * are matched by ISO code and the peso-equivalent column (the last number) is taken.
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
  const bulletin = useMemo(() => parseBspBulletin(text, codes), [text, codes]);
  const parsed = bulletin.rates;
  const replaces = (code: string) => existing.find((r) => r.date === date && r.currency === code);

  const run = async () => {
    setSaving(true);
    for (const { currency, rate } of parsed) {
      const prior = replaces(currency);
      await exchangeRates.save({ id: prior?.id ?? `fx-${date}-${currency}`, date, currency, rate, source: 'BSP RERB' });
    }
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
          and the day’s bulletin.
        </li>
        <li>Select the currency table and copy it — the web table or the PDF both work.</li>
        <li>Paste it below and check the preview. Rates are pesos per unit (the “Phil. peso equivalent” column).</li>
      </ol>
      <Fields cols={3}>
        <FormField label="Bulletin date" required>
          {(p) => <DatePicker {...p} value={date} onValueChange={setDate} />}
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
              const next = e.currentTarget.value;
              setText(next);
              // Take the date printed on the bulletin, e.g. "September 25, 2026".
              const found = parseBspBulletin(next, codes).date;
              if (found) setDate(found);
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
                  const prior = replaces(r.currency);
                  return prior ? (
                    <TableStatus intent="warning">Replaces {fmt(prior.rate)}</TableStatus>
                  ) : (
                    <TableStatus intent="success">New</TableStatus>
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
