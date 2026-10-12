import { Fields, Section, bind } from '../../../components/form/fields';
import { GENDERS, MARITAL_STATUSES } from '../../../mocks/employees';
import { todayISO } from '../../../services/dates';
import { countryDef } from '../../settings/masterDefs';
import type { TabProps } from './types';

/** Whole years from `dob` to today. */
const ageOn = (dob: string, today = todayISO()) => {
  const years = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  return today.slice(5) < dob.slice(5) ? years - 1 : years;
};

/** Personal details, national ID and passport. */
export function PersonalTab({ draft, update, errors }: TabProps) {
  const h = bind(draft, update);
  const options = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
  return (
    <>
      <Section icon="person" title="Personal">
        <Fields cols={2}>
          {h.choose('gender', 'Gender', options(GENDERS), { clearable: true, placeholder: 'Not specified' })}
          {h.date('dateOfBirth', 'Date of birth', {
            error: errors.dateOfBirth,
            hint: draft.dateOfBirth && !errors.dateOfBirth ? `${ageOn(draft.dateOfBirth)} years old.` : undefined,
          })}
          {h.master('birthCountryCode', 'Country of birth', countryDef, { clearable: true })}
          {h.choose('maritalStatus', 'Marital status', options(MARITAL_STATUSES), { clearable: true, placeholder: 'Not specified' })}
          {h.num('children', 'No. of children', { error: errors.children })}
          {h.master('citizenshipCode', 'Citizenship', countryDef, { clearable: true })}
          {h.text('idNo', 'ID no.', { placeholder: '0000-0000-0000-0000', hint: 'National ID number (PhilSys PSN for Filipino citizens).' })}
        </Fields>
      </Section>
      <Section icon="flight" title="Passport">
        <Fields cols={2}>
          {h.text('passportNo', 'Passport no.', { placeholder: 'e.g. P1234567A' })}
          {h.text('passportIssuer', 'Issuer', { placeholder: 'e.g. DFA Manila' })}
          {h.date('passportIssueDate', 'Issue date')}
          {h.date('passportExpiryDate', 'Expiration date', { error: errors.passportExpiryDate })}
        </Fields>
      </Section>
    </>
  );
}
