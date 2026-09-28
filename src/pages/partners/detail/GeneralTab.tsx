import { Checkbox, Radio, Text } from '@jasperlepardo/sikat-design-system';
import {
  BUSINESS_TYPES,
  CHANNELS,
  EMPLOYEES,
  INDUSTRIES,
  PROJECTS,
  TECHNICIANS,
  TERRITORIES,
} from '../../../mocks/masters';
import { LEAD_SOURCES, LEAD_STAGES, contactName, type PartnerRole, type PartnerStatus } from '../../../mocks/partners';
import { ROLE_CONFIG, ROLE_ORDER } from '../roles';
import { activeOptions, shippingTypes } from '../../../services/inventoryMasters';
import { useAsync } from '../../../services/useAsync';
import { Fields, Flags, ReadOnly, Section, bind, type Draft, type Errors } from './fields';

export interface TabProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: Errors;
  /** The role of the list the form was opened from; it can't be removed there. */
  lockedRole?: PartnerRole;
}

const STATUSES: PartnerStatus[] = ['Active', 'Inactive', 'Advanced'];

export function GeneralTab({ draft, update, errors, lockedRole }: TabProps) {
  const f = bind(draft, update);
  const has = (r: PartnerRole) => draft.roles.includes(r);
  const toggleRole = (r: PartnerRole, on: boolean) =>
    update({
      roles: ROLE_ORDER.filter((x) => (x === r ? on : draft.roles.includes(x))),
      ...(on && r === 'lead' && !draft.leadStage ? { leadStage: 'New' as const, leadSource: LEAD_SOURCES[0] } : {}),
    });
  const defaultContact = draft.contacts.find((c) => c.id === draft.defaultContactId);
  const shipping = useAsync(shippingTypes.list, []) ?? [];

  return (
    <>
      <Section icon="call" title="Contact channels">
        <Fields>
          {f.text('tel1', 'Tel 1', { type: 'tel' })}
          {f.text('tel2', 'Tel 2', { type: 'tel' })}
          {f.text('mobile', 'Mobile phone', { type: 'tel' })}
          {f.text('fax', 'Fax', { type: 'tel' })}
          {f.text('email', 'Email', {
            type: 'email',
            error: errors.email,
            hint: 'Default recipient for emailed documents.',
          })}
          {f.text('website', 'Website', { type: 'url', placeholder: 'https://' })}
          <ReadOnly
            label="Contact person"
            value={defaultContact ? contactName(defaultContact) : '—'}
            hint="The default contact under Contact persons in the side column."
          />
        </Fields>
        <Flags>{f.check('blockMarketing', 'Block sending marketing content')}</Flags>
      </Section>

      <Section icon="category" title="Classification">
        <Fields>
          {f.pick('industry', 'Industry', INDUSTRIES)}
          {f.pick('businessType', 'Type of business', BUSINESS_TYPES)}
          {f.text('aliasName', 'Alias name', { hint: 'Short name used in search and lookups.' })}
          {f.choose('shippingType', 'Shipping type', activeOptions(shipping, (x) => x.id, (x) => x.name, draft.shippingType, '— None —'), {
            hint: 'Defaults into new documents. Shipping types live in Settings › Inventory.',
          })}
          {f.text('idNo2', 'ID no. 2', { hint: 'Secondary ID, e.g. SEC or DTI registration no.' })}
          {f.text('unifiedTin', 'Unified TIN', { hint: 'For partners in a tax-consolidated group.' })}
          {f.text('gln', 'GLN', { hint: 'Global Location Number, for e-invoicing.' })}
        </Fields>
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

      <Section icon="toggle_on" title="Status">
        <div className="flex flex-wrap gap-6" role="radiogroup" aria-label="Status">
          {STATUSES.map((s) => (
            <Radio key={s} name="bp-status" checked={draft.status === s} onChange={() => update({ status: s })}>
              {s}
            </Radio>
          ))}
        </div>
        {draft.status === 'Advanced' ? (
          <Fields cols={3}>
            {f.date('statusFrom', 'Active from', { required: true, error: errors.statusFrom })}
            {f.date('statusTo', 'Active to', { required: true, error: errors.statusTo })}
            {f.text('statusRemarks', 'Remarks')}
          </Fields>
        ) : (
          <Fields cols={1}>{f.text('statusRemarks', 'Remarks', { placeholder: 'Why the status changed' })}</Fields>
        )}
        {draft.status === 'Advanced' ? (
          <Text variant="small" tone="muted">
            Advanced: the partner is active only between these dates.
          </Text>
        ) : null}
      </Section>

      {has('lead') ? (
        <Section icon={ROLE_CONFIG.lead.icon} title="Lead">
          <Fields>
            {f.pick('leadSource', 'Source', LEAD_SOURCES)}
            {f.pick('leadStage', 'Stage', LEAD_STAGES)}
          </Fields>
        </Section>
      ) : null}

      <Section icon="group_work" title="Roles">
        <Text variant="small" tone="muted">
          One business partner can be a lead, a customer and a vendor. It appears in each matching list, and edits here
          show everywhere.
        </Text>
        <Flags>
          {ROLE_ORDER.map((r) => (
            <Checkbox
              key={r}
              checked={has(r)}
              // Keep the list's own role, and always at least one role.
              disabled={r === lockedRole || (has(r) && draft.roles.length === 1)}
              onChange={(e) => toggleRole(r, e.currentTarget.checked)}
            >
              {ROLE_CONFIG[r].singular} <span className="text-muted">· {ROLE_CONFIG[r].title} list</span>
            </Checkbox>
          ))}
        </Flags>
      </Section>
    </>
  );
}
