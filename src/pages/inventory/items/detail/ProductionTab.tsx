import { Alert, Link, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { ISSUE_METHODS, holdsStock } from '../../../../mocks/itemMasters';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { TabProps } from './types';

export function ProductionTab({ draft, update, inv }: TabProps) {
  const warehouseOptions = (current: string) =>
    activeOptions(inv.warehouses.filter((w) => holdsStock(w) || w.code === current), (w) => w.code, (w) => `${w.code} · ${w.name}`, current, '— None —');
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
              (draft.issueMethod === 'Backflush'
                ? 'Components issue automatically when the finished good is received.'
                : 'Staff post an issue for production explicitly.') + ' Same setting as on the General tab.',
          })}
          {f.lookup('productionWarehouse', 'Production warehouse', warehouseOptions(draft.productionWarehouse), {
            hint: 'Where production orders pull components from.',
          })}
          {f.lookup('componentWarehouse', 'Component warehouse', warehouseOptions(draft.componentWarehouse), {
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
