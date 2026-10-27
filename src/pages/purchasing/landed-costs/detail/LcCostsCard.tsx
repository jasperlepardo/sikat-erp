import {
  Button,
  Checkbox,
  Icon,
  Select,
  Table,
  type TableColumn,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { allocate, lcTotals } from '../../../../services/landedCosts';
import { formatAmount } from '../../../../services/format';
import type { LandedCostEntry } from '../../../../mocks/landedCosts';
import { landedCostTypeDef } from '../../../settings/masterDefs';
import type { LcSectionProps } from './types';

const ALLOC_BY_OPTIONS: { value: LandedCostEntry['allocationBy']; label: string }[] = [
  { value: 'Quantity', label: 'Quantity' },
  { value: 'Value', label: 'Value' },
  { value: 'Equal', label: 'Equal' },
];

export function LcCostsCard({ draft, update, errors, readOnly }: LcSectionProps) {
  const h = bind(draft, update);

  const addEntry = () => {
    const entry: LandedCostEntry = {
      id: `lce-${crypto.randomUUID().slice(0, 8)}`,
      landedCostTypeId: '',
      allocationBy: 'Value',
      amount: 0,
      includeForCustoms: false,
      isVariable: false,
    };
    update({ costs: [...draft.costs, entry] });
  };

  const updateEntry = (id: string, patch: Partial<LandedCostEntry>) => {
    update({ costs: draft.costs.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  };

  const removeEntry = (id: string) => {
    update({ costs: draft.costs.filter((e) => e.id !== id) });
  };

  const recalculate = () => {
    const allocated = allocate(draft.costs, draft.lines);
    update({ lines: allocated });
  };

  const columns: TableColumn<LandedCostEntry>[] = [
    {
      key: 'landedCostTypeId',
      header: 'Cost type',
      cell: (e) => (
        <MasterLookup
          def={landedCostTypeDef}
          value={e.landedCostTypeId}
          onChange={(id) => updateEntry(e.id, { landedCostTypeId: id })}
          placeholder="Pick type"
          disabled={readOnly}
        />
      ),
    },
    {
      key: 'allocationBy',
      header: 'Allocation',
      cell: (e) => (
        <Select
          aria-label="Allocation method"
          options={ALLOC_BY_OPTIONS}
          value={e.allocationBy}
          onValueChange={(v) => v && updateEntry(e.id, { allocationBy: v as LandedCostEntry['allocationBy'] })}
          disabled={readOnly}
        />
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (e) => (
        <TextField
          type="number"
          aria-label="Amount"
          className="w-28 tabular-nums"
          value={String(e.amount)}
          min={0}
          step="0.01"
          disabled={readOnly}
          onChange={(ev) => updateEntry(e.id, { amount: parseFloat(ev.currentTarget.value) || 0 })}
        />
      ),
    },
    {
      key: 'includeForCustoms',
      header: 'Customs',
      cell: (e) => (
        <Checkbox
          aria-label="Include for customs"
          checked={e.includeForCustoms}
          disabled={readOnly}
          onChange={(ev) => updateEntry(e.id, { includeForCustoms: ev.currentTarget.checked })}
        >
          Include
        </Checkbox>
      ),
    },
    {
      key: 'isVariable',
      header: 'Variable',
      cell: (e) => (
        <Checkbox
          aria-label="Variable cost"
          checked={e.isVariable}
          disabled={readOnly}
          onChange={(ev) => updateEntry(e.id, { isVariable: ev.currentTarget.checked })}
        >
          Variable
        </Checkbox>
      ),
    },
    ...(!readOnly
      ? [{
          key: 'remove' as const,
          header: '',
          cell: (e: LandedCostEntry) => (
            <Button type="button" intent="danger" variant="ghost" size="small" onClick={() => removeEntry(e.id)}>
              <Icon size={16}>delete</Icon>
            </Button>
          ),
        }]
      : []),
  ];

  const total = lcTotals(draft.costs);

  return (
    <Section
      icon="calculate"
      title="Landed Costs"
      actions={
        !readOnly ? (
          <div className="flex gap-2">
            <Button type="button" intent="primary" variant="outline" size="small" shape="pill" onClick={recalculate}>
              Recalculate
            </Button>
            <Button
              type="button"
              intent="primary"
              variant="outline"
              size="small"
              shape="pill"
              leadingIcon={<Icon size={16}>add</Icon>}
              onClick={addEntry}
            >
              Add cost
            </Button>
          </div>
        ) : undefined
      }
    >
      {draft.costs.length === 0 ? (
        <Text tone="muted" className="text-sm py-1">
          {readOnly ? 'No cost entries.' : 'Add cost types to allocate — e.g. freight, customs, insurance.'}
        </Text>
      ) : (
        <div className="overflow-x-auto">
          <Table
            caption="Landed cost entries"
            columns={columns}
            rows={draft.costs}
            getRowId={(e) => e.id}
            layout="fill"
          />
        </div>
      )}
      {errors.costs ? <Text tone="danger" variant="small" className="mt-1">{errors.costs}</Text> : null}

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <Fields>
          {h.num('actualCustoms', 'Actual customs', { disabled: readOnly })}
          {h.date('customsDate', 'Customs date', { disabled: readOnly })}
          {h.check('customsAffectsInventory', 'Customs affects inventory cost')}
        </Fields>
        <div className="flex flex-col gap-1 text-sm text-right">
          <div className="flex justify-between">
            <span className="text-muted">Total costs</span>
            <span className="tabular-nums font-medium">{formatAmount(total)}</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
