import { Badge, Button, Checkbox, Table, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { BANK_CHARGE_CODES, PAYMENT_METHODS } from '../../../mocks/masters';
import type { PaymentMethodSetting } from '../../../mocks/partners';
import type { TabProps } from './GeneralTab';
import { Fields, Flags, Section, bind } from './fields';

type MethodRow = PaymentMethodSetting & { description: string };

export function PaymentRunTab({ draft, update }: TabProps) {
  const f = bind(draft, update);
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
      <Section icon="published_with_changes" title="Payment run options">
        <Fields>
          {f.pick('bankChargesCode', 'Bank charges allocation', BANK_CHARGE_CODES)}
          {f.text('paymentReference', 'Reference details', { hint: 'Printed on the payment run file.' })}
        </Fields>
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
