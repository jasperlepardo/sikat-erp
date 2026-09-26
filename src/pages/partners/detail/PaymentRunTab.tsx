import { Badge, Button, Checkbox, Table, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { BANK_CHARGE_CODES, COUNTRIES, HOUSE_BANKS, PAYMENT_METHODS } from '../../../mocks/masters';
import type { PaymentMethodSetting } from '../../../mocks/partners';
import type { TabProps } from './GeneralTab';
import { Fields, Flags, ReadOnly, Section, bind } from './fields';

type MethodRow = PaymentMethodSetting & { description: string };

export function PaymentRunTab({ draft, update }: TabProps) {
  const f = bind(draft, update);
  const houseBank = HOUSE_BANKS.find((b) => b.bank === draft.houseBank);
  const rows: MethodRow[] = PAYMENT_METHODS.map((m) => ({
    ...m,
    include: draft.paymentMethods.find((x) => x.code === m.code)?.include ?? false,
  }));
  const setInclude = (code: string, include: boolean) =>
    update({
      paymentMethods: rows.map(({ code: c, include: i }) => ({ code: c, include: c === code ? include : i })),
      ...(!include && draft.defaultPaymentMethod === code ? { defaultPaymentMethod: '' } : {}),
    });

  const columns: TableColumn<MethodRow>[] = [
    { key: 'code', header: 'Code', cell: (m) => m.code },
    { key: 'description', header: 'Description', cell: (m) => m.description },
    {
      key: 'include',
      header: 'Include',
      cell: (m) => (
        <Checkbox
          aria-label={`Include ${m.description}`}
          checked={m.include}
          onChange={(e) => setInclude(m.code, e.currentTarget.checked)}
        />
      ),
    },
    {
      key: 'default',
      header: 'Default',
      cell: (m) =>
        draft.defaultPaymentMethod === m.code ? (
          <div className="flex items-center gap-2">
            <Badge intent="primary">Default</Badge>
            <Button type="button" size="small" variant="ghost" onClick={() => update({ defaultPaymentMethod: '' })}>
              Clear
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="small"
            variant="ghost"
            disabled={!m.include}
            onClick={() => update({ defaultPaymentMethod: m.code })}
          >
            Set as default
          </Button>
        ),
    },
  ];

  return (
    <>
      <Section icon="account_balance" title="House bank">
        <Fields>
          {f.pick('houseBankCountry', 'Country/region', COUNTRIES)}
          {f.pick(
            'houseBank',
            'Bank',
            HOUSE_BANKS.map((b) => b.bank),
          )}
          <ReadOnly label="Account" value={houseBank?.account ?? '—'} />
          <ReadOnly label="Branch" value={houseBank?.branch ?? '—'} />
          <ReadOnly label="BIC/SWIFT code" value={houseBank?.swift ?? '—'} />
          {f.text('paymentReference', 'Reference details', { hint: 'Printed on the payment run file.' })}
        </Fields>
      </Section>

      <Section icon="published_with_changes" title="Payment run options">
        <Fields>{f.pick('bankChargesCode', 'Bank charges allocation', BANK_CHARGE_CODES)}</Fields>
        <Flags>
          {f.check('paymentBlock', 'Payment block')}
          {f.check('singlePayment', 'Single payment per document')}
          {f.check('collectionAuthorization', 'Collection authorization (direct debit)')}
          {f.check('autoBankCharges', 'Auto-calculate bank charges for incoming payments')}
        </Flags>
      </Section>

      <Section icon="payments" title="Payment methods">
        <Table caption="Payment methods" columns={columns} rows={rows} getRowId={(m) => m.code} />
      </Section>
    </>
  );
}
