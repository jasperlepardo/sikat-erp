import { useEffect, useState } from 'react';
import { Radio } from '@jasperlepardo/sikat-design-system';
import { PRIORITIES } from '../../../mocks/masters';
import { LEAD_STAGES, type Partner, type PartnerRole } from '../../../mocks/partners';
import { ROLE_CONFIG } from '../roles';
import { listPartners } from '../../../services/partners';
import {
  channelDef,
  dunningTermDef,
  factoringCompanyDef,
  holidayCalendarDef,
  industryDef,
  leadSourceDef,
  planningGroupDef,
  projectDef,
  salesEmployeeDef,
  shippingTypeDef,
  technicianDef,
  territoryDef,
} from '../../settings/masterDefs';
import { PaymentDatesField } from './PaymentDatesField';
import { ControlAccountsSection } from './ControlAccountsSection';
import { PaymentTermsSection } from './PaymentTermsSection';
import { PropertiesSection } from './PropertiesSection';
import { Fields, Flags, ReadOnly, Section, bind, type TabProps } from './fields';

/** Everything set up once for a partner and rarely touched again. */
export function SettingsTab(props: TabProps) {
  const { draft, update } = props;
  const f = bind(draft, update);
  const has = (r: PartnerRole) => draft.roles.includes(r);
  const [others, setOthers] = useState<Partner[]>([]);
  useEffect(() => {
    listPartners().then((all) => setOthers(all.filter((p) => p.id !== draft.id)));
  }, [draft.id]);

  return (
    <>
      <PaymentTermsSection {...props} />
      <ControlAccountsSection {...props} />

      <Section icon="category" title="Classification">
        <Fields>
          {f.master('industryId', 'Industry', industryDef)}
          {f.text('aliasName', 'Alias name', { placeholder: 'e.g. Acme', hint: 'Short name used in search and lookups.' })}
          {f.master('shippingType', 'Shipping type', shippingTypeDef, {
            clearable: true,
            hint: 'Defaults into new documents. Shipping types live in Settings › Inventory.',
          })}
          {f.text('idNo2', 'ID no. 2', { placeholder: 'e.g. CS201912345', hint: 'Secondary ID, e.g. SEC or DTI registration no.' })}
          {f.text('unifiedTin', 'Unified TIN', { placeholder: '000-000-000-000', hint: 'For partners in a tax-consolidated group.' })}
          {f.text('gln', 'GLN', { placeholder: '13-digit GLN', hint: 'Global Location Number, for e-invoicing.' })}
        </Fields>
        <Flags>{f.check('blockMarketing', 'Block sending marketing content')}</Flags>
      </Section>

      <Section icon="assignment_ind" title="Assignment">
        <Fields>
          {f.master('salesEmployeeId', has('vendor') && !has('customer') ? 'Buyer' : 'Sales employee', salesEmployeeDef, { clearable: true })}
          {f.master('territoryId', 'Territory', territoryDef, { clearable: true })}
          {f.master('channelId', 'Channel', channelDef, { clearable: true })}
          {f.master('technicianId', 'Technician', technicianDef, { clearable: true })}
          {f.master('project', 'Project', projectDef, { clearable: true, hint: 'Default project on documents. Projects live in Settings › Company.' })}
        </Fields>
      </Section>

      {has('lead') ? (
        <Section icon={ROLE_CONFIG.lead.icon} title="Lead">
          <Fields>
            {f.master('leadSourceId', 'Source', leadSourceDef)}
            {f.pick('leadStage', 'Stage', LEAD_STAGES)}
          </Fields>
        </Section>
      ) : null}

      <Section icon="credit_score" title="Credit & collection">
        <Fields>
          {f.num('creditLimit', 'Credit limit', { prefix: 'PHP', hint: 'Warns or blocks when the open balance exceeds it.' })}
          {f.num('commitmentLimit', 'Commitment limit', { prefix: 'PHP', hint: 'Like credit limit, but includes open orders.' })}
          {f.master('dunningTermId', 'Dunning term', dunningTermDef, { clearable: true })}
          {f.pick('priority', 'Priority', PRIORITIES, { clearable: true, hint: 'Order in payment runs.' })}
          {f.master('holidayCalendarId', 'Holidays', holidayCalendarDef, { clearable: true, hint: 'Due dates skip these non-business days.' })}
          <PaymentDatesField value={draft.paymentDates} onChange={(paymentDates) => update({ paymentDates })} />
          <ReadOnly
            label="Average delay"
            value={`${draft.averageDelayDays} day${draft.averageDelayDays === 1 ? '' : 's'}`}
            hint="Calculated from payment history."
          />
        </Fields>
      </Section>

      {has('customer') ? (
        <Section icon="handshake" title="Factoring">
          <Fields>
            {f.master('factoringCompanyId', 'Factoring company', factoringCompanyDef, {
              clearable: true,
              hint: 'Set when this partner’s receivables are sold to a third party.',
            })}
            {f.text('factoringRef', 'Factoring reference', { disabled: !draft.factoringCompanyId, hint: !draft.factoringCompanyId ? 'Set a factoring company first.' : undefined, placeholder: 'e.g. FA-2026-0142' })}
          </Fields>
        </Section>
      ) : null}

      <Section icon="local_shipping" title="Delivery & checks">
        <Flags>
          {f.check('allowPartialDelivery', 'Allow partial delivery of sales order')}
          {f.check('allowPartialDeliveryPerRow', 'Allow partial delivery per row')}
          {f.check('endorsableChecks', 'Endorsable checks from this partner')}
          {f.check('acceptsEndorsedChecks', 'This partner accepts endorsed checks')}
        </Flags>
      </Section>

      <Section icon="hub" title="Consolidation">
        <Fields>
          {f.lookup('consolidatingPartnerId', 'Consolidating business partner', others.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })), {
            clearable: true,
            hint: 'Parent partner for consolidated payments or deliveries.',
          })}
        </Fields>
        {draft.consolidatingPartnerId ? (
          <div className="flex gap-6" role="radiogroup" aria-label="Consolidation type">
            <Radio
              name="consolidation"
              checked={draft.consolidationType === 'payment'}
              onChange={() => update({ consolidationType: 'payment' })}
            >
              Payment consolidation
            </Radio>
            <Radio
              name="consolidation"
              checked={draft.consolidationType === 'delivery'}
              onChange={() => update({ consolidationType: 'delivery' })}
            >
              Delivery consolidation
            </Radio>
          </div>
        ) : null}
        <Fields cols={1}>
          {has('customer') && has('vendor') ? (
            <ReadOnly
              label="Connected vendor / customer"
              value="Same record — this partner is both a customer and a vendor, so AR and AP can be netted directly."
            />
          ) : (
            f.lookup(
              'connectedPartnerId',
              has('vendor') ? 'Connected customer' : 'Connected vendor',
              others
                .filter((p) => p.id === draft.connectedPartnerId || p.roles.includes(has('vendor') ? 'customer' : 'vendor'))
                .map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
              {
                clearable: true,
                hint: 'A separate record for the same company in the other role, so AR and AP can be netted. Simpler: add that role to this record instead.',
              },
            )
          )}
        </Fields>
      </Section>

      <Section icon="mark_email_unread" title="Dunning">
        <Fields>
          <ReadOnly label="Dunning level" value={draft.dunningLevel || '—'} hint="Updated by dunning runs." />
          <ReadOnly label="Last dunning date" value={draft.dunningDate || '—'} hint="Updated by dunning runs." />
        </Fields>
        <Flags>{f.check('blockDunning', 'Block dunning letters')}</Flags>
      </Section>

      <Section icon="tune" title="Other">
        <Fields>
          {f.master('planningGroupId', 'Planning group', planningGroupDef, { clearable: true })}
          {f.text('portalPassword', 'Portal password', {
            type: 'password',
            placeholder: 'Not set',
            hint: 'For the partner’s customer or vendor portal login.',
          })}
        </Fields>
        <Flags>
          {f.check('affiliate', 'Affiliate (related company)')}
          {f.check('useShippedGoodsAccount', 'Use shipped goods account')}
        </Flags>
      </Section>

      <PropertiesSection {...props} />
    </>
  );
}
