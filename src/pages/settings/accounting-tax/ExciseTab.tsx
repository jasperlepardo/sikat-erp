import {
  Button,
  Card,
  DatePicker,
  Icon,
  Table,
  TableStatus,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import {
  EXCISE_BASES,
  currentExcisePeriod,
  type ExciseCategory,
  type ExciseRatePeriod,
  type ExciseTier,
} from '../../../mocks/taxes';
import { exciseCategories } from '../../../services/masterData';
import { formatAmount } from '../../../services/format';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';
import { todayISO } from '../../../services/dates';

const today = () => todayISO();

const blankTier = (): ExciseTier => ({ upTo: null, adValoremRate: 0, specificAmount: 0 });
const blankPeriod = (): ExciseRatePeriod => ({ effectiveFrom: today(), effectiveTo: '', tiers: [blankTier()] });

const blank = (): ExciseCategory => ({
  id: newId('ex'),
  code: '',
  name: '',
  basis: 'Specific',
  unit: '',
  adValoremBase: '',
  rates: [blankPeriod()],
  legalBasis: '',
  active: true,
  notes: '',
});

function tierSummary(tiers: ExciseTier[], unit: string, adValoremBase: string): string {
  if (!tiers.length) return '—';
  if (tiers.length > 1) return `Tiered — ${tiers.length} bands`;
  const t = tiers[0];
  const adv = t.adValoremRate ? `${t.adValoremRate}%${adValoremBase ? ` of ${adValoremBase}` : ''}` : '';
  const spc = t.specificAmount ? `₱${formatAmount(t.specificAmount)}${unit ? ` per ${unit}` : ''}` : '';
  if (adv && spc) return `${adv} + ${spc}`;
  return adv || spc || '—';
}

export function ExciseTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(exciseCategories);
  return (
    <MasterList<ExciseCategory>
      {...route}
      icon="local_bar"
      title="Excise tax"
      noun="excise category"
      description="Excise on top of VAT for sin and other covered products. Items flagged as excise-taxable pick one of these. Sin-tax rates step up every January — add a new rate period instead of editing the old one."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'code', header: 'Code', cell: (x) => <span className="font-semibold">{x.code}</span> },
        { key: 'name', header: 'Products', cell: (x) => x.name },
        { key: 'basis', header: 'Basis', cell: (x) => x.basis },
        {
          key: 'rate',
          header: 'Rate today',
          cell: (x) => {
            const p = currentExcisePeriod(x, today());
            return p
              ? tierSummary(p.tiers, x.unit, x.adValoremBase)
              : <span className="text-warning">No rate in force</span>;
          },
        },
        {
          key: 'active',
          header: 'Status',
          cell: (x) => (
            <TableStatus intent={x.active ? 'success' : 'default'}>{x.active ? 'Active' : 'Inactive'}</TableStatus>
          ),
        },
      ]}
      searchText={(x) => `${x.code} ${x.name} ${x.legalBasis}`}
      blank={blank}
      label={(x) => `${x.code} · ${x.name}`}
      validate={(x, all) => {
        const e: Record<string, string> = {};
        if (!x.code.trim()) e.code = 'Code is required.';
        else if (all.some((o) => o.id !== x.id && o.code.toLowerCase() === x.code.trim().toLowerCase()))
          e.code = `${x.code} already exists.`;
        if (!x.name.trim()) e.name = 'Name is required.';
        if (!x.rates.length) e.rates = 'Add at least one rate period.';
        else if (x.rates.some((p) => !p.effectiveFrom)) e.rates = 'Every period needs an effective date.';
        else if (x.rates.some((p) => p.effectiveTo && p.effectiveTo < p.effectiveFrom))
          e.rates = 'A period ends before it starts.';
        else if (x.rates.some((p) => !p.tiers.length)) e.rates = 'Every period needs at least one rate.';
        else if (x.rates.some((p) => p.tiers.some((t) => t.adValoremRate < 0 || t.adValoremRate > 100)))
          e.rates = 'Ad valorem rates must be between 0 and 100.';
        else if (x.rates.some((p) => p.tiers.some((t) => t.specificAmount < 0)))
          e.rates = 'Specific amounts cannot be negative.';
        return e;
      }}
      onSave={(x) =>
        save({
          ...x,
          code: x.code.trim().toUpperCase(),
          rates: [...x.rates]
            .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
            .map((p) => ({ ...p, tiers: [...p.tiers].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity)) })),
        })
      }
      editor={(x, update, errors) => {
        const f = bind(x, update);
        const isSpecific = x.basis === 'Specific' || x.basis === 'Specific + ad valorem';
        const isAdValorem = x.basis === 'Ad valorem' || x.basis === 'Specific + ad valorem';
        return (
          <>
            <FieldStack>
              {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. EX-SSB' })}
              {f.text('name', 'Products', { required: true, error: errors.name })}
              {f.pick('basis', 'Basis', EXCISE_BASES)}
              {isSpecific && f.text('unit', 'Unit', { placeholder: 'e.g. pack, liter, proof liter' })}
              {isAdValorem && f.text('adValoremBase', 'Ad valorem base', { placeholder: 'e.g. net manufacturer price' })}
              {f.text('legalBasis', 'Legal basis', { placeholder: 'e.g. RA 10963 (TRAIN), NIRC Sec. 149' })}
              {f.area('notes', 'Notes', { rows: 2 })}
            </FieldStack>
            <RateHistory
              basis={x.basis}
              rates={x.rates}
              error={errors.rates}
              onChange={(rates) => update({ rates })}
            />
            <FieldStack>{f.status('active', 'Status')}</FieldStack>
          </>
        );
      }}
    />
  );
}

function RateHistory({
  basis,
  rates,
  error,
  onChange,
}: {
  basis: ExciseCategory['basis'];
  rates: ExciseRatePeriod[];
  error?: string;
  onChange: (rates: ExciseRatePeriod[]) => void;
}) {
  const setRate = (i: number, patch: Partial<ExciseRatePeriod>) =>
    onChange(rates.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const current = [...rates]
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
    .find((p) => p.effectiveFrom <= today() && (!p.effectiveTo || today() <= p.effectiveTo));

  return (
    <Section
      icon="history"
      title="Rate history"
      actions={
        <Button
          type="button"
          size="small"
          variant="ghost"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={() => onChange([...rates, blankPeriod()])}
        >
          New period
        </Button>
      }
    >
      <Text variant="small" tone="muted">
        When a rate changes, add a new period instead of editing the old one.
      </Text>
      {rates.map((p, i) => {
        const status =
          p.effectiveFrom > today() ? 'Upcoming'
          : current && p.effectiveFrom === current.effectiveFrom && p.effectiveTo === current.effectiveTo ? 'In force'
          : 'Superseded';
        const statusIntent =
          status === 'In force' ? 'success' : status === 'Upcoming' ? 'primary' : 'default';
        return (
          <Card key={i}>
            <div className="p-3 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 flex gap-3">
                  <DatePicker
                    aria-label="Effective from"
                    value={p.effectiveFrom || null}
                    onValueChange={(effectiveFrom) => setRate(i, { effectiveFrom })}
                  />
                  <DatePicker
                    aria-label="Effective to"
                    value={p.effectiveTo || null}
                    onValueChange={(v) => setRate(i, { effectiveTo: v ?? '' })}
                  />
                </div>
                <TableStatus intent={statusIntent}>{status}</TableStatus>
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  intent="danger"
                  disabled={rates.length === 1}
                  onClick={() => onChange(rates.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
              <TierEditor
                basis={basis}
                tiers={p.tiers}
                onChange={(tiers) => setRate(i, { tiers })}
              />
            </div>
          </Card>
        );
      })}
      {error ? (
        <Text variant="small" tone="danger">{error}</Text>
      ) : null}
    </Section>
  );
}

function TierEditor({
  basis,
  tiers,
  onChange,
}: {
  basis: ExciseCategory['basis'];
  tiers: ExciseTier[];
  onChange: (tiers: ExciseTier[]) => void;
}) {
  const set = (i: number, patch: Partial<ExciseTier>) =>
    onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const rows = tiers.map((t, i) => ({ ...t, id: String(i) }));
  const isSpecific = basis === 'Specific' || basis === 'Specific + ad valorem';
  const isAdValorem = basis === 'Ad valorem' || basis === 'Specific + ad valorem';
  const tiered = tiers.length > 1;

  return (
    <div className="flex flex-col gap-2">
      <Table
        caption="Rate tiers"
        getRowId={(r) => r.id}
        rows={rows}
        columns={[
          ...(tiered ? [{
            key: 'upTo',
            header: 'Price up to (PHP)',
            cell: (r: ExciseTier & { id: string }) => (
              <TextField
                aria-label="Price up to"
                type="number"
                min={0}
                prefix="₱"
                placeholder="blank = no limit"
                value={r.upTo === null ? '' : String(r.upTo)}
                onChange={(e) => set(Number(r.id), { upTo: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}
              />
            ),
          }] : []),
          ...(isAdValorem ? [{
            key: 'adValoremRate',
            header: 'Ad valorem (%)',
            cell: (r: ExciseTier & { id: string }) => (
              <TextField
                aria-label="Ad valorem rate"
                type="number"
                min={0}
                max={100}
                suffix="%"
                value={String(r.adValoremRate)}
                onChange={(e) => set(Number(r.id), { adValoremRate: Number(e.currentTarget.value) })}
              />
            ),
          }] : []),
          ...(isSpecific ? [{
            key: 'specificAmount',
            header: 'Specific amount (PHP)',
            cell: (r: ExciseTier & { id: string }) => (
              <TextField
                aria-label="Specific amount"
                type="number"
                min={0}
                prefix="₱"
                value={String(r.specificAmount)}
                onChange={(e) => set(Number(r.id), { specificAmount: Number(e.currentTarget.value) })}
              />
            ),
          }] : []),
          {
            key: 'remove',
            header: 'Remove',
            srOnlyHeader: true,
            cell: (r: ExciseTier & { id: string }) => (
              <Button
                type="button"
                size="small"
                variant="ghost"
                intent="danger"
                disabled={tiers.length === 1}
                onClick={() => onChange(tiers.filter((_, j) => j !== Number(r.id)))}
              >
                Remove
              </Button>
            ),
          },
        ]}
      />
      <Button
        type="button"
        size="small"
        variant="ghost"
        leadingIcon={<Icon size={16}>add</Icon>}
        onClick={() => onChange([...tiers, blankTier()])}
      >
        Add band
      </Button>
    </div>
  );
}
