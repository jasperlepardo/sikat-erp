import { SEED_EMPLOYEES, type Employee } from '../mocks/employees';
import { createCollection } from './store';

export const employees = createCollection<Employee>('sikat-erp:employees', SEED_EMPLOYEES, 'hem', { audit: 'EMP' });

export const listEmployees = employees.list;
export const getEmployee = employees.get;

/** The employee's name as its Name positioning says: "Ana Cruz", "Cruz Ana" or "Cruz, Ana" (with the middle name if shown). */
export function employeeName(e: Pick<Employee, 'firstName' | 'middleName' | 'lastName' | 'nameOrder' | 'nameComma' | 'showMiddleName'>) {
  const given = [e.firstName, e.showMiddleName ? e.middleName : ''].map((s) => s.trim()).filter(Boolean).join(' ');
  const last = e.lastName.trim();
  if (e.nameOrder === 'first-last') return [given, last].filter(Boolean).join(' ');
  return [last, given].filter(Boolean).join(e.nameComma && last && given ? ', ' : ' ');
}

/** An employee's display name by id — the id itself if the employee is gone. */
export const employeeNameOf = (id: string) => {
  const e = employees.snapshot().find((x) => x.id === id);
  return e ? employeeName(e) : id;
};

/** Codes are unique. A blank code gets the next EMP-####. */
export async function saveEmployee(input: Omit<Employee, 'id'> & { id?: string }): Promise<Employee> {
  const all = await employees.list();
  const code = input.code.trim();
  if (code && all.some((e) => e.id !== input.id && e.code.toLowerCase() === code.toLowerCase())) {
    throw new Error(`Employee code ${code} is already used by another employee.`);
  }
  if (input.managerId && input.managerId === input.id) throw new Error('An employee cannot be their own manager.');
  if (code) return employees.save({ ...input, code });
  const next = Math.max(0, ...all.map((e) => Number(e.code.replace(/\D/g, '')) || 0)) + 1;
  return employees.save({ ...input, code: `EMP-${String(next).padStart(4, '0')}` });
}
