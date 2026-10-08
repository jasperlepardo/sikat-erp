import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Checkbox,
  Combobox,
  FormField,
  Icon,
  IconButton,
  Link,
  Panel,
  PanelHeader,
  SidePanel,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { Fields, Flags, Section, bind } from '../../../components/form/fields';
import {
  BATCH_RESTRICTIONS,
  SUBLEVEL_TIERS,
  TIER_LABEL,
  TRANSACTION_RESTRICTIONS,
  blankBin,
  type BinLocation,
  type SublevelTier,
} from '../../../mocks/binLocations';
import {
  binLocations,
  binSublevels,
  fillPattern,
  generateBins,
  planGeneration,
  planRename,
  renameBins,
  sublevelsOf,
  type Range,
  type RenameRow,
} from '../../../services/binLocations';
import { itemGroups } from '../../../services/inventoryMasters';
import { useCollection } from '../../../components/form/MasterLookup';
import { binWarehouseOptions } from './sublevels';

type Ranges = Record<SublevelTier, Range>;
const OPEN: Ranges = { aisle: { from: '', to: '' }, shelf: { from: '', to: '' }, level: { from: '', to: '' } };

/** A portaled side panel with Cancel and one primary action; Escape cancels. */
function ToolPanel({
  icon,
  title,
  subcopy,
  primary,
  onCancel,
  children,
}: {
  icon: string;
  title: string;
  subcopy: string;
  primary: ReactNode;
  onCancel: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <SidePanel overlay onOverlayClick={onCancel} style={{ '--sikat-side-panel-width': '760px' } as CSSProperties}>
      <PanelHeader
        type="forms"
        icon={icon}
        title={title}
        subcopy={subcopy}
        actions={
          <>
            <IconButton intent="default" variant="link" label="Close" onClick={onCancel}>
              <Icon size={20}>close</Icon>
            </IconButton>
            <Button type="button" intent="default" variant="solid" size="extra-large" onClick={onCancel}>
              Cancel
            </Button>
            {primary}
          </>
        }
      />
      <Panel.Body className="flex flex-col gap-2">{children}</Panel.Body>
    </SidePanel>,
    document.body,
  );
}

/** Warehouse plus From–To per sublevel, over the warehouse's sublevel codes. */
function Selection({
  warehouse,
  onWarehouse,
  ranges,
  onRanges,
  required,
}: {
  warehouse: string;
  onWarehouse: (code: string) => void;
  ranges: Ranges;
  onRanges: (r: Ranges) => void;
  /** Generation needs every range bounded by real codes; blank still means "all". */
  required?: boolean;
}) {
  const subs = useCollection(binSublevels) ?? [];
  const set = (t: SublevelTier, end: keyof Range, v: string) => onRanges({ ...ranges, [t]: { ...ranges[t], [end]: v } });
  return (
    <>
      <Fields cols={3}>
        <FormField label="Warehouse" required>
          {(p) => (
            <Combobox
              {...p}
              options={binWarehouseOptions(warehouse)}
              placeholder="Pick a bin-enabled warehouse"
              value={warehouse || null}
              onValueChange={(v) => {
                onWarehouse(v ?? '');
                onRanges(OPEN);
              }}
            />
          )}
        </FormField>
      </Fields>
      <Fields cols={2}>
        {SUBLEVEL_TIERS.flatMap((t) => {
          const options = sublevelsOf(subs, warehouse, t).map((s) => ({
            value: s.code,
            label: s.code,
            subLabel: s.description || undefined,
          }));
          return (['from', 'to'] as const).map((end) => (
            <FormField key={`${t}-${end}`} label={`${TIER_LABEL[t]} ${end}`} required={required}>
              {(p) => (
                <Combobox
                  {...p}
                  options={options}
                  disabled={!warehouse}
                  clearable
                  placeholder={end === 'from' ? 'First' : 'Last'}
                  value={ranges[t][end] || null}
                  onValueChange={(v) => set(t, end, v ?? '')}
                />
              )}
            </FormField>
          ));
        })}
      </Fields>
    </>
  );
}

// ── Generate bins (Bin Location Management) ─────────────────────────────────

/** Creates a bin for every Aisle × Shelf × Level in the ranges, with shared properties. */
export function GenerateBinsPanel({ warehouse: initial, onCancel, onDone }: { warehouse?: string; onCancel: () => void; onDone: () => void }) {
  const [warehouse, setWarehouse] = useState(initial ?? binWarehouseOptions()[0]?.value ?? '');
  const [ranges, setRanges] = useState<Ranges>(OPEN);
  const [d, setD] = useState<BinLocation>(() => blankBin({ reason: '' }));
  const [patterns, setPatterns] = useState({
    description: 'Bin {LEVEL} on shelf {SHELF}, aisle {AISLE}',
    barcode: '{WH}{AISLE}{SHELF}{LEVEL}',
    altSortCode: '{SEQ:3}',
  });
  const [saving, setSaving] = useState(false);
  const subs = useCollection(binSublevels) ?? [];
  const bins = useCollection(binLocations) ?? [];
  const f = bind(d, (p) => setD((x) => ({ ...x, ...p })));

  const plan = useMemo(
    () =>
      warehouse
        ? planGeneration({ warehouse, ranges, defaults: d, patterns }, subs, bins)
        : { add: [], skipped: [] },
    [warehouse, ranges, d, patterns, subs, bins],
  );
  const add = plan.add;

  const run = async () => {
    setSaving(true);
    try {
      await generateBins(add);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const sample = add[0];
  return (
    <ToolPanel
      icon="apps"
      title="Generate bins"
      subcopy="Adds a bin for every aisle, shelf and level in the ranges. Existing bins are left as they are."
      onCancel={onCancel}
      primary={
        <Button type="button" intent="primary" variant="solid" size="extra-large" disabled={!add.length || saving} onClick={run}>
          {saving ? 'Generating…' : `Generate ${add.length || ''} bin${add.length === 1 ? '' : 's'}`}
        </Button>
      }
    >
      <Section icon="filter_alt" title="Bins to generate">
        <Selection warehouse={warehouse} onWarehouse={setWarehouse} ranges={ranges} onRanges={setRanges} />
        <Text variant="small" tone="muted">
          Ranges run over the warehouse’s sublevel codes; a blank end means first or last. Add codes on the Sublevel codes tab.
        </Text>
        {warehouse ? (
          <Alert intent={add.length ? 'primary' : 'warning'}>
            {add.length
              ? `${add.length} new bin${add.length === 1 ? '' : 's'}: ${add[0].code}${add.length > 1 ? ` … ${add[add.length - 1].code}` : ''}.`
              : 'Nothing to generate.'}
            {plan.skipped.length ? ` ${plan.skipped.length} already exist and are skipped.` : ''}
          </Alert>
        ) : null}
      </Section>

      <Section icon="tune" title="Properties for every new bin">
        <Fields>{f.status('active', 'Status')}</Fields>
        <Flags>
          {f.check('excludeAutoAlloc', 'Exclude from automatic allocation on issue')}
        </Flags>
        <Fields cols={3}>
          {f.num('minQty', 'Minimum qty', { hint: '0 = not set.' })}
          {f.num('maxQty', 'Maximum qty', { hint: '0 = no limit.' })}
          {f.num('maxWeight', 'Maximum weight', { suffix: 'kg', hint: '0 = no limit.' })}
        </Fields>
        <Fields cols={3}>
          {f.choose('itemRestriction', 'Item restriction', [
            { value: 'none', label: 'None' },
            { value: 'singleItem', label: 'Single item only' },
            { value: 'itemGroup', label: 'Specific item group' },
            { value: 'singleItemGroup', label: 'Single item group only' },
          ])}
          {d.itemRestriction === 'itemGroup'
            ? f.choose(
                'restrictedItemGroup',
                'Item group',
                itemGroups.snapshot().filter((g) => g.active).map((g) => ({ value: g.name, label: g.name })),
                { required: true },
              )
            : null}
          {f.choose('batchRestriction', 'Batch restriction', BATCH_RESTRICTIONS)}
          {f.choose('transactionRestriction', 'Transaction restriction', TRANSACTION_RESTRICTIONS)}
        </Fields>
        <Text variant="small" tone="muted">
          Receiving bin, a specific item and UoM restrictions are set bin by bin afterwards.
        </Text>
      </Section>

      <Section icon="text_fields" title="Generated text">
        <Text variant="small" tone="muted">
          Patterns build a different value for each bin: {'{WH}'}, {'{AISLE}'}, {'{SHELF}'}, {'{LEVEL}'} are the bin’s parts; {'{SEQ}'} counts 1, 2, 3… across
          the run and {'{SEQ:3}'} pads it to 001.
        </Text>
        <Fields cols={3}>
          {(['description', 'barcode', 'altSortCode'] as const).map((k) => (
            <FormField
              key={k}
              label={{ description: 'Description', barcode: 'Bar code', altSortCode: 'Alternative sort code' }[k]}
              hint={sample ? `First bin: ${fillPattern(patterns[k], sample, 1) || '—'}` : undefined}
            >
              {(p) => <TextField {...p} value={patterns[k]} onChange={(e) => setPatterns({ ...patterns, [k]: e.currentTarget.value })} />}
            </FormField>
          ))}
        </Fields>
        <Fields cols={2}>{f.text('reason', 'Reason', { placeholder: 'e.g. Initial setup — mezzanine racks' })}</Fields>
      </Section>
    </ToolPanel>
  );
}

// ── Modify bin codes (Bin Location Code Modification) ───────────────────────

type Change = { on: boolean; value: string };

/** Renames a range of bins by replacing their aisle, shelf or level. Bins keep their history and stock. */
export function ModifyBinCodesPanel({ warehouse: initial, onCancel, onDone }: { warehouse?: string; onCancel: () => void; onDone: () => void }) {
  const navigate = useNavigate();
  const [warehouse, setWarehouse] = useState(initial ?? binWarehouseOptions()[0]?.value ?? '');
  const [ranges, setRanges] = useState<Ranges>(OPEN);
  const [changes, setChanges] = useState<Record<SublevelTier, Change>>({
    aisle: { on: false, value: '' },
    shelf: { on: false, value: '' },
    level: { on: false, value: '' },
  });
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof renameBins>>>();
  const bins = useCollection(binLocations) ?? [];

  const picked = Object.fromEntries(SUBLEVEL_TIERS.filter((t) => changes[t].on && changes[t].value.trim()).map((t) => [t, changes[t].value]));
  const badValue = SUBLEVEL_TIERS.find((t) => changes[t].on && (!changes[t].value.trim() || changes[t].value.includes('-')));
  const rows: RenameRow[] = useMemo(
    () => (warehouse ? planRename({ warehouse, ranges, changes: picked, reason }, bins) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [warehouse, ranges, JSON.stringify(picked), bins],
  );
  const moving = rows.filter((r) => r.to.code !== r.bin.code);
  const conflicts = rows.filter((r) => r.conflict);

  const run = async () => {
    setSaving(true);
    try {
      setResult(await renameBins(rows, reason.trim()));
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <ToolPanel
        icon="edit_location_alt"
        title="Bin codes changed"
        subcopy={`${result.bins} bin${result.bins === 1 ? '' : 's'} renamed in ${warehouse}.`}
        onCancel={onDone}
        primary={
          <Button type="button" intent="primary" variant="solid" size="extra-large" onClick={onDone}>
            Done
          </Button>
        }
      >
        <Alert intent="success">
          {result.bins} bin{result.bins === 1 ? '' : 's'} renamed. {result.items} item{result.items === 1 ? '' : 's'} now default to the new codes. Posted documents
          keep the codes they were posted with.
        </Alert>
        <Alert intent="warning">Relabel the bins on the warehouse floor to match before anyone picks from them.</Alert>
        {result.drafts.length ? (
          <Section icon="pending_actions" title="Draft transfers to review">
            <Text variant="small" tone="muted">These drafts still name an old bin code. Open each and pick the renamed bin.</Text>
            {result.drafts.map((t) => (
              <Link key={t.id} onClick={() => navigate(`/inventory/stock-movements/${t.id}`)}>
                {`Draft to ${t.toWarehouse || '—'} · ${t.remarks || t.postingDate}`}
              </Link>
            ))}
          </Section>
        ) : null}
      </ToolPanel>
    );
  }

  return (
    <ToolPanel
      icon="edit_location_alt"
      title="Modify bin codes"
      subcopy="Renames bins after a warehouse reorganization. Each bin keeps its history, stock and properties; only its code changes."
      onCancel={onCancel}
      primary={
        <Button
          type="button"
          intent="primary"
          variant="solid"
          size="extra-large"
          disabled={!moving.length || conflicts.length > 0 || Boolean(badValue) || saving}
          onClick={run}
        >
          {saving ? 'Renaming…' : `Rename ${moving.length || ''} bin${moving.length === 1 ? '' : 's'}`}
        </Button>
      }
    >
      <Section icon="filter_alt" title="Bins to rename">
        <Selection warehouse={warehouse} onWarehouse={setWarehouse} ranges={ranges} onRanges={setRanges} />
        <Text variant="small" tone="muted">Leave a range blank to include all of that sublevel. Only bins that exist are renamed.</Text>
      </Section>

      <Section icon="edit" title="New sublevel values">
        <Text variant="small" tone="muted">Tick a sublevel to replace it in every selected bin. Unticked parts keep their values.</Text>
        <Fields cols={3}>
          {SUBLEVEL_TIERS.map((t) => (
            <div key={t} className="flex flex-col gap-1">
              <Checkbox checked={changes[t].on} onChange={(e) => setChanges({ ...changes, [t]: { ...changes[t], on: e.currentTarget.checked } })}>
                {TIER_LABEL[t]}
              </Checkbox>
              <TextField
                aria-label={`New ${TIER_LABEL[t].toLowerCase()}`}
                placeholder={`New ${TIER_LABEL[t].toLowerCase()}`}
                disabled={!changes[t].on}
                invalid={badValue === t}
                value={changes[t].value}
                onChange={(e) => setChanges({ ...changes, [t]: { on: true, value: e.currentTarget.value.toUpperCase() } })}
              />
            </div>
          ))}
        </Fields>
        {badValue ? (
          <Text variant="small" tone="danger">
            Enter the new {TIER_LABEL[badValue].toLowerCase()} — without “-”, which separates the parts of a bin code.
          </Text>
        ) : null}
        <Fields cols={2}>
          <FormField label="Reason" hint="Saved on each renamed bin. Blank: “Renamed from <old code>”.">
            {(p) => <TextField {...p} placeholder="e.g. Aisles renumbered for the mezzanine" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />}
          </FormField>
        </Fields>
      </Section>

      {conflicts.length ? (
        <Alert intent="danger">
          {conflicts.length} rename{conflicts.length === 1 ? '' : 's'} would clash with another bin. Narrow the range or pick other values.
        </Alert>
      ) : moving.length ? (
        <Alert intent="warning">
          Items’ default bins follow the new codes. Posted transfers keep the old codes; draft transfers on these bins are listed for review afterwards. Relabel the
          bins on the floor too.
        </Alert>
      ) : null}

      <DataTable
        icon="list"
        title={`Preview${rows.length ? ` (${rows.length} bin${rows.length === 1 ? '' : 's'} selected)` : ''}`}
        rows={rows}
        getRowId={(r) => r.bin.id}
        columns={[
          { key: 'from', header: 'Current code', cell: (r) => r.bin.code },
          {
            key: 'to',
            header: 'New code',
            cell: (r) =>
              r.to.code === r.bin.code ? (
                <Text variant="small" tone="muted">Unchanged</Text>
              ) : (
                <Text variant="small" tone={r.conflict ? 'danger' : undefined} weight="semibold">
                  {r.to.code}
                </Text>
              ),
          },
          { key: 'note', header: '', sortable: false, cell: (r) => (r.conflict ? <Text variant="small" tone="danger">{r.conflict}</Text> : null) },
        ]}
        empty={
          <Text variant="small" tone="muted">
            {warehouse ? 'No bins in this selection.' : 'Pick a warehouse.'}
          </Text>
        }
      />
    </ToolPanel>
  );
}
