import { Badge, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import { ROUNDING_RULES, type Currency } from '../../../mocks/currencies';
import { currencies, exchangeRates, rateOn } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

/** Code, name and decimals checks, shared with "+ Add" on currency fields. */
export function validateCurrency(c: Currency, all: Currency[]) {
  const e: Record<string, string> = {};
  const code = c.code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) e.code = 'Use the 3-letter ISO 4217 code, e.g. USD.';
  else if (all.some((x) => x.id !== c.id && x.code === code)) e.code = `${code} already exists.`;
  if (!c.name.trim()) e.name = 'Name is required.';
  if (c.decimals < 0 || c.decimals > 4) e.decimals = 'Use 0 to 4 decimals.';
  if (c.isLocal && !c.active) e.active = 'The local currency must stay active.';
  if (c.isSystem && !c.active) e.active = 'The system currency must stay active.';
  return e;
}

export const blankCurrency = (): Currency => ({
  id: newId('cur'),
  code: '',
  name: '',
  symbol: '',
  unitName: '',
  hundredthName: '',
  decimals: 2,
  rounding: 'No rounding',
  rateSource: 'BSP RERB',
  isLocal: false,
  isSystem: false,
  active: true,
});

export function CurrenciesTab(route: ListRoute) {
  const { rows, save, setActive, reload } = useCollectionRows(currencies);
  const rates = useAsync(exchangeRates.list, []) ?? [];

  return (
    <MasterList<Currency>
      {...route}
      icon="currency_exchange"
      title="Currencies"
      noun="currency"
      description="Books are kept in Philippine pesos (local currency). Active currencies can be used on partners and documents; rates come from the BSP bulletin on the Exchange rates tab."
      rows={rows}
      // The local and system currencies always stay active.
      onSetActive={(picked, active) =>
        setActive(active ? picked : picked.filter((c) => !c.isLocal && !c.isSystem), active)
      }
      defaultSort={{ key: 'code', direction: 'asc' }}
      sortValue={(c, key) =>
        key === 'code'
          ? `${c.isLocal ? 0 : c.isSystem ? 1 : 2}${c.code}`
          : key === 'rate'
            ? (rateOn(rates, c.code)?.rate ?? -1)
            : key === 'active'
              ? Number(c.active)
              : String(c[key as keyof Currency] ?? '').toLowerCase()
      }
      columns={[
        {
          key: 'code',
          header: 'Code',
          cell: (c) => (
            <div className="flex items-center gap-2">
              <span className="font-semibold">{c.code}</span>
              {c.isLocal ? <Badge intent="primary">Local</Badge> : null}
              {c.isSystem ? <Badge variant="outline">System</Badge> : null}
            </div>
          ),
        },
        { key: 'name', header: 'Name', cell: (c) => `${c.symbol}  ${c.name}` },
        { key: 'decimals', header: 'Decimals', cell: (c) => c.decimals },
        {
          key: 'rate',
          header: 'Latest rate (PHP)',
          cell: (c) => {
            if (c.isLocal) return <span className="text-muted">—</span>;
            const r = rateOn(rates, c.code);
            return r ? (
              <span>
                {r.rate.toLocaleString('en-PH', { maximumFractionDigits: 6 })}{' '}
                <span className="text-muted">· {r.date}</span>
              </span>
            ) : (
              <span className={c.active ? 'text-warning' : 'text-muted'}>No rate yet</span>
            );
          },
        },
        {
          key: 'active',
          header: 'Status',
          cell: (c) => (
            <TableStatus intent={c.active ? 'success' : 'default'}>{c.active ? 'Active' : 'Inactive'}</TableStatus>
          ),
        },
      ]}
      searchText={(c) => `${c.code} ${c.name} ${c.unitName}`}
      blank={blankCurrency}
      label={(c) => `${c.code} · ${c.name}`}
      validate={validateCurrency}
      onSave={async (c) => {
        // Only one system currency: saving a new one clears the flag on the old one.
        if (c.isSystem) {
          for (const other of (rows ?? []).filter((x) => x.isSystem && x.id !== c.id)) {
            await currencies.save({ ...other, isSystem: false });
          }
        }
        await save({ ...c, code: c.code.trim().toUpperCase() });
        reload();
      }}
      editor={(c, update, errors) => {
        const f = bind(c, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('code', 'Code (ISO 4217)', { required: true, error: errors.code, readOnly: c.isLocal })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.text('symbol', 'Symbol')}
              {f.text('unitName', 'Unit name', { hint: 'For amounts in words, e.g. "peso".' })}
              {f.text('hundredthName', 'Hundredth name', { hint: 'e.g. "centavo".' })}
              {f.num('decimals', 'Decimals', { error: errors.decimals })}
              {f.pick('rounding', 'Rounding', ROUNDING_RULES)}
              {c.isLocal
                ? null
                : f.pick('rateSource', 'Rate source', ['BSP RERB', 'Manual'], {
                    hint: 'BSP RERB rates are imported from the daily bulletin.',
                  })}
            </Fields>
            <Flags>
              {f.check('active', 'Active', { disabled: c.isLocal })}
              {f.check('isSystem', 'System currency (second reporting currency)', { disabled: c.isLocal })}
            </Flags>
            {errors.active ? (
              <Text variant="small" tone="danger">
                {errors.active}
              </Text>
            ) : null}
            {c.isLocal ? (
              <Text variant="small" tone="muted">
                The local currency can’t be changed once books are open.
              </Text>
            ) : null}
          </>
        );
      }}
    />
  );
}
