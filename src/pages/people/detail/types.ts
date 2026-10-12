import type { Employee } from '../../../mocks/employees';
import type { Errors } from '../../../components/form/fields';

/** The form's copy of the employee; no id until it's added. */
export type Draft = Omit<Employee, 'id'> & { id?: string };

export interface TabProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: Errors;
}

export const TABS = [
  { value: 'address', label: 'Address' },
  { value: 'membership', label: 'Membership' },
  { value: 'administration', label: 'Administration' },
  { value: 'personal', label: 'Personal' },
  { value: 'finance', label: 'Finance' },
  { value: 'remarks', label: 'Remarks' },
] as const;
export type TabId = (typeof TABS)[number]['value'];
