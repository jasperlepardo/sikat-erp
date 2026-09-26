import { Alert, Link, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { ISSUE_METHODS, WAREHOUSES } from '../../../../mocks/itemMasters';
import type { TabProps } from './types';

const warehouseOptions = [
  { value: '— None —', label: '— None —' },
  ...WAREHOUSES.map((w) => ({ value: w.code, label: `${w.code} · ${w.name}` })),
];

export function ProductionTab({ draft, update }: TabProps) {
  const f = bind(draft, update);
  const makeWithoutBom = draft.procurementMethod === 'Make' && draft.planningMethod !== 'None' && !draft.bomCode;

  return (
    <>
      {makeWithoutBom ? (
        <Alert intent="warning" variant="outline" title="No bill of materials yet">
          This is a Make item, so MRP can’t create production orders for it until a BOM exists.
        </Alert>
      ) : null}
      <Section icon="precision_manufacturing" title="Production">
        <Fields>
          {f.pick('issueMethod', 'Issue method', ISSUE_METHODS, {
            required: true,
            hint:
              draft.issueMethod === 'Backflush'
                ? 'Components issue automatically when the finished good is received.'
                : 'Staff post an issue for production explicitly.',
          })}
          {f.choose('productionWarehouse', 'Production warehouse', warehouseOptions, {
            hint: 'Where production orders pull components from.',
          })}
          {f.choose('componentWarehouse', 'Component warehouse', warehouseOptions, {
            hint: 'Staging area for BOM components, if different.',
          })}
          <ReadOnly
            label="Bill of materials"
            value={
              draft.bomCode ? (
                draft.bomCode
              ) : (
                <>
                  None yet · <Link href="#/manufacturing/bills-of-materials">Manufacturing › Bills of Materials</Link>
                </>
              )
            }
          />
        </Fields>
        <Flags>{f.check('phantom', 'Phantom item')}</Flags>
        {draft.phantom ? (
          <Text variant="small" tone="muted">
            Phantom: never stocked; its components are exploded straight into the parent’s production order.
          </Text>
        ) : null}
      </Section>
    </>
  );
}
