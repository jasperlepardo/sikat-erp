import { useEffect, useState } from 'react';
import { Radio, Text } from '@jasperlepardo/sikat-design-system';
import { AccountField, useAccounts } from '../../../components/form/AccountField';
import { PLANNING_GROUPS } from '../../../mocks/masters';
import type { Partner } from '../../../mocks/partners';
import { listPartners } from '../../../services/partners';
import type { TabProps } from './GeneralTab';
import { Fields, Flags, ReadOnly, Section, bind } from './fields';

export function AccountingTab({ draft, update, errors }: TabProps) {
  const f = bind(draft, update);
  const isCustomer = draft.roles.includes('customer');
  const isVendor = draft.roles.includes('vendor');
  const chart = useAccounts();
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
          {isCustomer ? (
            <AccountField
              label="Accounts receivable"
              role="receivable"
              accounts={chart}
              required
              error={errors.receivableAccount}
              hint="Every invoice to this partner posts here."
              value={draft.receivableAccount}
              onChange={(receivableAccount) => update({ receivableAccount })}
            />
          ) : null}
          {isVendor ? (
            <AccountField
              label="Accounts payable"
              role="payable"
              accounts={chart}
              required
              error={errors.payableAccount}
              hint="Every bill from this partner posts here."
              value={draft.payableAccount}
              onChange={(payableAccount) => update({ payableAccount })}
            />
          ) : null}
          <AccountField
            label="Down payment clearing account"
            role="downPaymentClearing"
            accounts={chart}
            allowNone
            error={errors.downPaymentClearingAccount}
            value={draft.downPaymentClearingAccount}
            onChange={(downPaymentClearingAccount) => update({ downPaymentClearingAccount })}
          />
          <AccountField
            label="Down payment interim account"
            role="downPaymentInterim"
            accounts={chart}
            allowNone
            error={errors.downPaymentInterimAccount}
            value={draft.downPaymentInterimAccount}
            onChange={(downPaymentInterimAccount) => update({ downPaymentInterimAccount })}
          />
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
