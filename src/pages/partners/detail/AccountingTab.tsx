import { useEffect, useState } from 'react';
import { Radio, Text } from '@jasperlepardo/sikat-design-system';
import { GL_ACCOUNTS, PLANNING_GROUPS } from '../../../mocks/masters';
import type { Partner } from '../../../mocks/partners';
import { listPartners } from '../../../services/partners';
import type { TabProps } from './GeneralTab';
import { Fields, Flags, ReadOnly, Section, bind } from './fields';

export function AccountingTab({ draft, update, errors }: TabProps) {
  const f = bind(draft, update);
  const isCustomer = draft.roles.includes('customer');
  const isVendor = draft.roles.includes('vendor');
  const [others, setOthers] = useState<Partner[]>([]);
  useEffect(() => {
    listPartners().then((all) => setOthers(all.filter((p) => p.id !== draft.id)));
  }, [draft.id]);

  const consolidating = others.find((p) => p.id === draft.consolidatingPartnerId);
  const partnerOptions = ['— None —', ...others.map((p) => `${p.code} · ${p.name}`)];

  return (
    <>
      <Section icon="account_tree" title="Control accounts">
        <Fields>
          {isCustomer
            ? f.pick('receivableAccount', 'Accounts receivable', GL_ACCOUNTS.receivable, {
                required: true,
                error: errors.receivableAccount,
                hint: 'Every invoice to this partner posts here.',
              })
            : null}
          {isVendor
            ? f.pick('payableAccount', 'Accounts payable', GL_ACCOUNTS.payable, {
                required: true,
                error: errors.payableAccount,
                hint: 'Every bill from this partner posts here.',
              })
            : null}
          {f.pick('downPaymentClearingAccount', 'Down payment clearing account', GL_ACCOUNTS.downPaymentClearing)}
          {f.pick('downPaymentInterimAccount', 'Down payment interim account', GL_ACCOUNTS.downPaymentInterim)}
        </Fields>
        {!isCustomer && !isVendor ? (
          <Text variant="small" tone="muted">
            Control accounts apply once this partner is a customer or vendor.
          </Text>
        ) : null}
      </Section>

      <Section icon="hub" title="Consolidation">
        <Fields>
          <PartnerPick
            label="Consolidating business partner"
            value={consolidating ? `${consolidating.code} · ${consolidating.name}` : '— None —'}
            options={partnerOptions}
            onChange={(v) =>
              update({ consolidatingPartnerId: others.find((p) => `${p.code} · ${p.name}` === v)?.id ?? '' })
            }
          />
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
          <ReadOnly
            label="Connected vendor / customer"
            value={
              isCustomer && isVendor
                ? 'Same record — this partner is both a customer and a vendor, so AR and AP can be netted directly.'
                : 'Not needed: add the Vendor or Customer role on the General tab instead of linking a second record.'
            }
          />
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
        <Fields>{f.pick('planningGroup', 'Planning group', PLANNING_GROUPS)}</Fields>
        <Flags>
          {f.check('affiliate', 'Affiliate (related company)')}
          {f.check('useShippedGoodsAccount', 'Use shipped goods account')}
        </Flags>
      </Section>
    </>
  );
}

/** Picks another business partner by display name; reports the chosen name. */
function PartnerPick({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const obj = { value };
  return bind(obj, (p) => p.value !== undefined && onChange(p.value)).pick('value', label, options, {
    hint: 'Parent partner for consolidated payments or deliveries.',
  });
}
