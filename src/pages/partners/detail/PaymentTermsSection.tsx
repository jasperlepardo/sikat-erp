import { EFFECTIVE_DISCOUNT_GROUPS, EFFECTIVE_PRICE, PAYMENT_TERMS, PRICE_LISTS } from '../../../mocks/masters';
import { Fields, Flags, Section, bind, type TabProps } from './fields';

export function PaymentTermsSection({ draft, update, errors }: TabProps) {
  const f = bind(draft, update);
  const isCustomer = draft.roles.includes('customer');
  const isVendor = draft.roles.includes('vendor');

  return (
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
  );
}
