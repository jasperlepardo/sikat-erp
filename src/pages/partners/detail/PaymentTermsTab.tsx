import {
  DUNNING_TERMS,
  EFFECTIVE_DISCOUNT_GROUPS,
  EFFECTIVE_PRICE,
  HOLIDAY_CALENDARS,
  PAYMENT_TERMS,
  PRICE_LISTS,
  PRIORITIES,
} from '../../../mocks/masters';
import type { TabProps } from './GeneralTab';
import { Fields, Flags, ReadOnly, Section, bind } from './fields';

export function PaymentTermsTab({ draft, update, errors }: TabProps) {
  const f = bind(draft, update);
  const isCustomer = draft.roles.includes('customer');
  const isVendor = draft.roles.includes('vendor');

  return (
    <>
      <Section icon="request_quote" title="Terms & pricing">
        <Fields>
          {isCustomer
            ? f.pick('customerPaymentTerms', isVendor ? 'Payment terms (as customer)' : 'Payment terms', PAYMENT_TERMS, {
                required: true,
                error: errors.customerPaymentTerms,
                hint: 'Terms you give them. Drives due dates on invoices.',
              })
            : null}
          {isVendor
            ? f.pick('vendorPaymentTerms', isCustomer ? 'Payment terms (as vendor)' : 'Payment terms', PAYMENT_TERMS, {
                required: true,
                error: errors.vendorPaymentTerms,
                hint: 'Terms they give you. Drives due dates on bills.',
              })
            : null}
          {f.pick('priceList', 'Price list', PRICE_LISTS)}
          {f.num('totalDiscount', 'Total discount', { suffix: '%' })}
          {f.num('interestOnArrears', 'Interest on arrears', { suffix: '%' })}
          {f.pick('effectiveDiscountGroups', 'Effective discount groups', EFFECTIVE_DISCOUNT_GROUPS, {
            disabled: draft.noDiscountGroups,
          })}
          {f.pick('effectivePrice', 'Effective price', EFFECTIVE_PRICE)}
        </Fields>
        <Flags>
          {f.check('effectivePriceAllSources', 'Effective price considers all price sources', {
            disabled: draft.effectivePrice === 'Default priority',
          })}
          {f.check('noDiscountGroups', 'Do not apply discount groups')}
        </Flags>
      </Section>

      <Section icon="credit_score" title="Credit & collection">
        <Fields>
          {f.num('creditLimit', 'Credit limit', { prefix: 'PHP', hint: 'Warns or blocks when the open balance exceeds it.' })}
          {f.num('commitmentLimit', 'Commitment limit', { prefix: 'PHP', hint: 'Like credit limit, but includes open orders.' })}
          {f.pick('dunningTerm', 'Dunning term', DUNNING_TERMS)}
          {f.pick('priority', 'Priority', PRIORITIES, { hint: 'Order in payment runs.' })}
          {f.pick('holidays', 'Holidays', HOLIDAY_CALENDARS, { hint: 'Due dates skip these non-business days.' })}
          <ReadOnly
            label="Average delay"
            value={`${draft.averageDelayDays} day${draft.averageDelayDays === 1 ? '' : 's'}`}
            hint="Calculated from payment history."
          />
        </Fields>
      </Section>

      <Section icon="local_shipping" title="Delivery & checks">
        <Flags>
          {f.check('allowPartialDelivery', 'Allow partial delivery of sales order')}
          {f.check('allowPartialDeliveryPerRow', 'Allow partial delivery per row')}
          {f.check('endorsableChecks', 'Endorsable checks from this partner')}
          {f.check('acceptsEndorsedChecks', 'This partner accepts endorsed checks')}
        </Flags>
      </Section>
    </>
  );
}
