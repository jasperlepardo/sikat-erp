import {
  CHANNELS,
  EMPLOYEES,
  INDUSTRIES,
  PROJECTS,
  TECHNICIANS,
  TERRITORIES,
} from '../../../mocks/masters';
import { LEAD_SOURCES, LEAD_STAGES, type PartnerRole } from '../../../mocks/partners';
import { ROLE_CONFIG } from '../roles';
import { activeOptions, shippingTypes } from '../../../services/inventoryMasters';
import { useAsync } from '../../../services/useAsync';
import { Fields, Flags, Section, bind, type Draft, type Errors } from './fields';

export interface TabProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: Errors;
}

export function GeneralTab({ draft, update }: TabProps) {
  const f = bind(draft, update);
  const has = (r: PartnerRole) => draft.roles.includes(r);
  const shipping = useAsync(shippingTypes.list, []) ?? [];

  return (
    <>
      <Section icon="category" title="Classification">
        <Fields>
          {f.pick('industry', 'Industry', INDUSTRIES)}
          {f.text('aliasName', 'Alias name', { hint: 'Short name used in search and lookups.' })}
          {f.choose('shippingType', 'Shipping type', activeOptions(shipping, (x) => x.id, (x) => x.name, draft.shippingType, '— None —'), {
            hint: 'Defaults into new documents. Shipping types live in Settings › Inventory.',
          })}
          {f.text('idNo2', 'ID no. 2', { hint: 'Secondary ID, e.g. SEC or DTI registration no.' })}
          {f.text('unifiedTin', 'Unified TIN', { hint: 'For partners in a tax-consolidated group.' })}
          {f.text('gln', 'GLN', { hint: 'Global Location Number, for e-invoicing.' })}
        </Fields>
        <Flags>{f.check('blockMarketing', 'Block sending marketing content')}</Flags>
      </Section>

      <Section icon="assignment_ind" title="Assignment">
        <Fields>
          {f.pick('salesEmployee', has('vendor') && !has('customer') ? 'Buyer' : 'Sales employee', EMPLOYEES)}
          {f.pick('territory', 'Territory', TERRITORIES)}
          {f.pick('channel', 'Channel', CHANNELS)}
          {f.pick('technician', 'Technician', TECHNICIANS)}
          {f.pick('project', 'Project', PROJECTS, { hint: 'Default project on documents.' })}
          {f.area('generalRemarks', 'Remarks', { rows: 2, className: 'md:col-span-2' })}
        </Fields>
      </Section>

      {has('lead') ? (
        <Section icon={ROLE_CONFIG.lead.icon} title="Lead">
          <Fields>
            {f.pick('leadSource', 'Source', LEAD_SOURCES)}
            {f.pick('leadStage', 'Stage', LEAD_STAGES)}
          </Fields>
        </Section>
      ) : null}
    </>
  );
}
