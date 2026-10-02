import { FormField, MultiSelect } from '@jasperlepardo/sikat-design-system';

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: ordinal(i + 1) }));

/** The days of the month a partner pays or is paid on (SAP B1 "Payment Dates"), for payment runs. */
export function PaymentDatesField({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <FormField
      label="Payment dates"
      tooltip="Days of the month payments to or from this partner fall on, e.g. the 15th and 30th, for payment runs. Leave empty for any day."
    >
      {(p) => (
        <MultiSelect
          {...p}
          options={DAYS}
          placeholder="Any day"
          value={value.map(String)}
          onValueChange={(v) => onChange(v.map(Number).sort((a, b) => a - b))}
        />
      )}
    </FormField>
  );
}
