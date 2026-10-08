import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  Card,
  DatePicker,
  Icon,
  Select,
  Table,
  TableLink,
  TableStatus,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import { useHeaderSearch } from '../../../components/form/HeaderSearch';
import {
  currentWithholdingRate,
  WITHHOLDING_AGENTS,
  WITHHOLDING_BASES,
  WITHHOLDING_KINDS,
  WITHHOLDING_KIND_INFO,
  type WithholdingKind,
  type WithholdingRatePeriod,
  type WithholdingTax,
} from '../../../mocks/taxes';
import { todayISO } from '../../../services/dates';
import { withholdingTaxes } from '../../../services/masterData';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

const today = () => todayISO();


const blank = (): WithholdingTax => ({
  id: newId('wt'),
  atc: '',
  description: '',
  condition: '',
  attachmentRequired: null,
  kind: 'Expanded (EWT)',
  agent: 'Any',
  payee: 'Corporate',
  rates: [{ effectiveFrom: today(), effectiveTo: '', rate: 1 }],
  base: 'Amount net of VAT',
  birForms: WITHHOLDING_KIND_INFO['Expanded (EWT)'].forms,
  legalBasis: '',
  active: true,
  notes: '',
});

const todayStr = () => todayISO();

/** Row shown in the BIR-style grouped table: one condition tier, IND and CORP ATCs side by side. */
interface DisplayRow {
  condition: string;
  rate: number | null;
  ind: WithholdingTax | null;
  corp: WithholdingTax | null;
}

/** One description group within a kind section. */
interface DescriptionGroup {
  description: string;
  rows: DisplayRow[];
}

/** Build the BIR-style grouped structure from flat WithholdingTax rows. */
function buildGroups(taxes: WithholdingTax[]): Map<WithholdingKind, DescriptionGroup[]> {
  const result = new Map<WithholdingKind, DescriptionGroup[]>();
  for (const kind of WITHHOLDING_KINDS) {
    const kindRows = taxes.filter((t) => t.kind === kind);
    const groupMap = new Map<string, DescriptionGroup>();
    for (const t of kindRows) {
      if (!groupMap.has(t.description)) groupMap.set(t.description, { description: t.description, rows: [] });
      const group = groupMap.get(t.description)!;
      const conditionKey = t.condition || '__none__';
      const existing = group.rows.find((r) => (r.condition || '__none__') === conditionKey);
      if (existing) {
        if (t.payee === 'Individual') existing.ind = t;
        else if (t.payee === 'Corporate') existing.corp = t;
        else { existing.ind = t; existing.corp = t; }
      } else {
        group.rows.push({
          condition: t.condition,
          rate: currentWithholdingRate(t, todayStr()) ?? null,
          ind: t.payee === 'Individual' || t.payee === 'Any' ? t : null,
          corp: t.payee === 'Corporate' || t.payee === 'Any' ? t : null,
        });
      }
    }
    result.set(kind, [...groupMap.values()]);
  }
  return result;
}

export function WithholdingTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(withholdingTaxes);

  // RecordPage — delegate entirely to MasterList
  if (route.recordId) {
    return (
      <MasterList<WithholdingTax>
        {...route}
        icon="request_quote"
        title="Withholding tax"
        noun="withholding tax"
        rows={rows}
        onSetActive={setActive}
        columns={[
          { key: 'atc', header: 'ATC', cell: (w) => w.atc || '(no ATC)' },
          { key: 'description', header: 'Description', cell: (w) => w.description },
        ]}
        searchText={(w) => `${w.atc} ${w.description}`}
        blank={blank}
        label={(w) => `${w.atc || 'No ATC'} · ${w.description}`}
        validate={(w, all) => {
          const e: Record<string, string> = {};
          if (!w.description.trim()) e.description = 'Describe the income payment.';
          if (w.atc && all.some((x) => x.id !== w.id && x.atc === w.atc.trim().toUpperCase()))
            e.atc = `${w.atc} already exists.`;
          if (!w.rates.length) e.rates = 'Add at least one rate period.';
          else if (w.rates.some((p) => !p.effectiveFrom)) e.rates = 'Every period needs an effective date.';
          else if (w.rates.some((p) => p.effectiveTo && p.effectiveTo < p.effectiveFrom)) e.rates = 'A period ends before it starts.';
          else if (w.rates.some((p) => p.rate < 0 || p.rate > 100)) e.rates = 'Rates must be between 0 and 100.';
          return e;
        }}
        onSave={(w) => save({
          ...w,
          atc: w.atc.trim().toUpperCase(),
          rates: [...w.rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
        })}
        editor={(w, update, errors) => {
          const f = bind(w, update);
          return (
            <>
              <FieldStack>
                {f.text('atc', 'ATC', { error: errors.atc, placeholder: 'e.g. WC158', hint: 'Leave blank until confirmed.' })}
                {f.text('description', 'Description', { required: true, error: errors.description })}
                {f.choose('kind', 'Tax type',
                  WITHHOLDING_KINDS.map((k) => ({ value: k, label: `${WITHHOLDING_KIND_INFO[k].type} · ${WITHHOLDING_KIND_INFO[k].name}` })),
                  { hint: WITHHOLDING_KIND_INFO[w.kind].definition },
                )}
                {f.pick('payee', 'IND / CORP', ['Individual', 'Corporate', 'Any'])}
                {f.pick('agent', 'Withholding agent', WITHHOLDING_AGENTS, {
                  hint: 'Government = applicable to government withholding agent only.',
                })}
                {f.pick('base', 'Tax base', WITHHOLDING_BASES, { hint: 'The amount the rate is applied to.' })}
                {f.text('condition', 'Condition', { placeholder: 'e.g. if gross income exceeds ₱ 720,000.00', hint: 'BIR verbatim label for this tier.' })}
                {f.field('attachmentRequired', 'Attachment required',
                  { hint: 'Sworn declaration — vendor must have a valid current-year certificate on file for the reduced rate to apply.' },
                  (p) => (
                    <Select
                      {...(p as object)}
                      value={w.attachmentRequired ?? ''}
                      onValueChange={(v) => update({ attachmentRequired: v === 'sworn-declaration' ? 'sworn-declaration' : null })}
                      options={[
                        { value: '', label: 'None' },
                        { value: 'sworn-declaration', label: 'Sworn declaration' },
                      ]}
                    />
                  ),
                )}
                {f.text('birForms', 'BIR forms')}
                {f.text('legalBasis', 'Legal basis', { placeholder: 'e.g. RR 2-98 Sec. 2.57.2(A)' })}
                {f.area('notes', 'Notes', { rows: 2 })}
              </FieldStack>
              <RateHistory
                rates={w.rates ?? []}
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

  return <WithholdingListView rows={rows} basePath={route.basePath} />;
}

function WithholdingListView({
  rows,
  basePath,
}: {
  rows: WithholdingTax[] | undefined;
  basePath: string;
}) {
  const navigate = useNavigate();
  const headerSearch = useHeaderSearch('Search withholding tax');
  const [localQuery, setLocalQuery] = useState('');
  const query = headerSearch?.query ?? localQuery;

  const groups = useMemo(() => {
    const all = rows ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((t) => `${t.atc} ${t.description} ${t.condition} ${WITHHOLDING_KIND_INFO[t.kind].type}`.toLowerCase().includes(q))
      : all;
    return buildGroups(filtered);
  }, [rows, query]);

  const open = (t: WithholdingTax) => navigate(`${basePath}/${encodeURIComponent(t.id)}`);

  return (
    <>
      <div className="flex items-center justify-end gap-2 px-2 pt-2">
        <Button
          type="button"
          size="small"
          intent="primary"
          variant="solid"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={() => navigate(`${basePath}/new`)}
        >
          New
        </Button>
      </div>

      {headerSearch ? null : (
        <TextField
          aria-label="Search withholding tax"
          placeholder="Search withholding tax"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => setLocalQuery(e.currentTarget.value)}
        />
      )}

      <Text variant="small" tone="muted" className="px-1">
        {WITHHOLDING_KINDS.map((k) => `${WITHHOLDING_KIND_INFO[k].type} = ${WITHHOLDING_KIND_INFO[k].name}`).join(' · ')}
      </Text>

      {WITHHOLDING_KINDS.map((kind) => {
        const descGroups = groups.get(kind) ?? [];
        if (!descGroups.length) return null;
        const info = WITHHOLDING_KIND_INFO[kind];

        // Flatten into table rows: one header row per description group + one sub-row per tier
        type TableRow =
          | { type: 'header'; id: string; description: string; kind: string }
          | { type: 'tier'; id: string; condition: string; rate: number | null; ind: WithholdingTax | null; corp: WithholdingTax | null };

        const tableRows: TableRow[] = [];
        for (const g of descGroups) {
          tableRows.push({ type: 'header', id: `h-${g.description}`, description: g.description, kind: info.type });
          for (const r of g.rows) {
            tableRows.push({ type: 'tier', id: `t-${r.ind?.id ?? r.corp?.id ?? r.condition}`, ...r });
          }
        }

        return (
          <div key={kind} className="flex flex-col gap-1">
            <Text variant="small" weight="semibold" tone="muted" className="px-1">{info.type} — {info.name}</Text>
            <Card>
              <Table
                caption={info.name}
                getRowId={(r) => r.id}
                rows={tableRows}
                columns={[
                  {
                    key: 'description',
                    header: 'Description',
                    sortable: false,
                    cell: (r) => {
                      if (r.type === 'header') {
                        return <span className="font-semibold whitespace-normal">{r.description}</span>;
                      }
                      return r.condition
                        ? <span className="pl-4 text-muted whitespace-normal">– {r.condition}</span>
                        : <span className="pl-4 text-muted">—</span>;
                    },
                  },
                  {
                    key: 'rate',
                    header: 'Rate',
                    sortable: false,
                    cell: (r) => r.type === 'tier' && r.rate !== null ? `${r.rate}%` : null,
                  },
                  {
                    key: 'ind',
                    header: 'IND',
                    sortable: false,
                    cell: (r) => {
                      if (r.type !== 'tier' || !r.ind || r.ind === r.corp) return null;
                      return (
                        <TableLink onClick={() => open(r.ind!)}>
                          <span className="font-mono">{r.ind.atc || <span className="text-warning">No ATC</span>}</span>
                        </TableLink>
                      );
                    },
                  },
                  {
                    key: 'corp',
                    header: 'CORP',
                    sortable: false,
                    cell: (r) => {
                      if (r.type !== 'tier' || !r.corp || r.ind === r.corp) return null;
                      return (
                        <TableLink onClick={() => open(r.corp!)}>
                          <span className="font-mono">{r.corp.atc || <span className="text-warning">No ATC</span>}</span>
                        </TableLink>
                      );
                    },
                  },
                  {
                    key: 'any',
                    header: 'ATC',
                    sortable: false,
                    cell: (r) => {
                      if (r.type !== 'tier' || !r.ind || r.ind !== r.corp) return null;
                      return (
                        <TableLink onClick={() => open(r.ind!)}>
                          <span className="font-mono">{r.ind.atc || <span className="text-warning">No ATC</span>}</span>
                        </TableLink>
                      );
                    },
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    sortable: false,
                    cell: (r) => {
                      if (r.type !== 'tier') return null;
                      const active = [r.ind, r.corp].filter(Boolean).every((t) => t!.active);
                      return <TableStatus intent={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</TableStatus>;
                    },
                  },
                ]}
              />
            </Card>
          </div>
        );
      })}
    </>
  );
}

function RateHistory({
  rates,
  error,
  onChange,
}: {
  rates: WithholdingRatePeriod[];
  error?: string;
  onChange: (rates: WithholdingRatePeriod[]) => void;
}) {
  const set = (i: number, patch: Partial<WithholdingRatePeriod>) =>
    onChange(rates.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const rows = rates.map((p, i) => ({ ...p, rate: Number(p.rate) || 0, id: String(i) }));
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
          onClick={() => onChange([...rates, { effectiveFrom: today(), effectiveTo: '', rate: rates.at(-1)?.rate ?? 0 }])}
        >
          New period
        </Button>
      }
    >
      <Text variant="small" tone="muted">
        When a rate changes, add a new period instead of editing the old one.
      </Text>
      <Card>
        <Table
          caption="Rate history"
          getRowId={(r) => r.id}
          rows={rows}
          columns={[
            {
              key: 'effectiveFrom',
              header: 'Effective from',
              cell: (r) => (
                <DatePicker
                  aria-label="Effective from"
                  value={r.effectiveFrom || null}
                  onValueChange={(v) => set(Number(r.id), { effectiveFrom: v ?? '' })}
                />
              ),
            },
            {
              key: 'effectiveTo',
              header: 'Effective to',
              cell: (r) => (
                <DatePicker
                  aria-label="Effective to"
                  value={r.effectiveTo || null}
                  onValueChange={(v) => set(Number(r.id), { effectiveTo: v ?? '' })}
                />
              ),
            },
            {
              key: 'rate',
              header: 'Rate (%)',
              cell: (r) => (
                <TextField
                  aria-label="Rate"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0"
                  value={r.rate != null ? String(r.rate) : ''}
                  onChange={(e) => set(Number(r.id), { rate: Number(e.currentTarget.value) })}
                />
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => {
                const status =
                  r.effectiveFrom > today() ? 'Upcoming'
                  : current && r.effectiveFrom === current.effectiveFrom ? 'In force'
                  : 'Superseded';
                const intent = status === 'In force' ? 'success' : status === 'Upcoming' ? 'primary' : 'default';
                return <TableStatus intent={intent}>{status}</TableStatus>;
              },
            },
            {
              key: 'remove',
              header: 'Remove',
              srOnlyHeader: true,
              cell: (r) => (
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  intent="danger"
                  disabled={rates.length === 1}
                  onClick={() => onChange(rates.filter((_, j) => j !== Number(r.id)))}
                >
                  Remove
                </Button>
              ),
            },
          ]}
        />
      </Card>
      {error ? <Text variant="small" tone="danger">{error}</Text> : null}
    </Section>
  );
}
