/**
 * List-page paths for people. Only type imports here: shared helpers and
 * other pages import these, and importing them from a page module pulls that whole page into
 * every chunk that links to it.
 */
import type { Noun } from '../../components/form/noun';

export const EMPLOYEES_PATH = '/people/employees';
export const EMPLOYEE_NOUN: Noun = { one: 'employee', many: 'employees' };
