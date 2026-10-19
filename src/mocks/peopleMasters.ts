/**
 * Starter values for the lists Employee Master Data picks from (Settings › People and Company).
 * Seeded into managed collections (services/peopleMasters.ts); read those, not these.
 * Append to the lists; never reorder (ids are positional).
 */
import { idIn } from './masters';
import { named, type NamedEntry } from './partnerMasters';
import { STORE_NAMES } from './storeWarehouses';

export const POSITIONS = [
  'General Manager', 'Store Manager', 'Sales Associate', 'Technician', 'Accountant', 'Warehouse Supervisor', 'Buyer', 'HR Officer',
] as const;
export const positionId = idIn('pos', POSITIONS);

export const DEPARTMENTS = ['Management', 'Sales', 'Service', 'Finance', 'Operations', 'Purchasing', 'Human Resources', 'Marketing', 'IT'] as const;
export const departmentId = idIn('dpt', DEPARTMENTS);

/**
 * Company branches: head office, the first three stores, then one branch per store (WH-005…).
 * Append only. 'Makati (Greenbelt 3)' is inactive: its Mobile Care counter (WH-004) is a second
 * warehouse of the Greenbelt 3 store.
 */
export const BRANCHES = ['Head office (Pasig)', 'Cebu (Robinsons Galleria)', 'Davao (Abreeza)', 'Makati (Greenbelt 3)', ...STORE_NAMES] as const;
export const branchId = idIn('brn', BRANCHES);

export const COST_CENTERS = ['Administration', 'Store operations', 'After-sales service', 'Logistics', 'Corporate sales'] as const;
export const costCenterId = idIn('cc', COST_CENTERS);

/** System user accounts (login names). */
export const USERS = ['manager', 'jasper', 'andrea', 'ben', 'carla', 'dino', 'finance'] as const;
export const userId = idIn('usr', USERS);

export const EMPLOYEE_ROLES = ['Employee', 'Sales', 'Technician', 'Purchaser', 'Approver'] as const;
export const employeeRoleId = idIn('erl', EMPLOYEE_ROLES);

export const TEAMS = ['Corporate accounts', 'Store launch', 'Month-end close'] as const;
export const teamId = idIn('tm', TEAMS);
/** A member's part in a team. */
export const TEAM_ROLES = ['Leader', 'Member'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const EMPLOYEE_STATUSES = ['Regular', 'Probationary', 'Contractual', 'Project-based', 'On leave'] as const;
export const employeeStatusId = idIn('est', EMPLOYEE_STATUSES);

export const TERMINATION_REASONS = ['Resignation', 'End of contract', 'Retirement', 'Termination for just cause', 'Redundancy'] as const;
export const terminationReasonId = idIn('trm', TERMINATION_REASONS);

export const SEED_POSITIONS: NamedEntry[] = named('pos', POSITIONS);
export const SEED_DEPARTMENTS: NamedEntry[] = named('dpt', DEPARTMENTS);
/** A branch, with the warehouse its new purchase request lines default to. */
export interface Branch extends NamedEntry {
  /** One of the branch's own warehouses; '' = none. */
  defaultWarehouseCode: string;
}
// Branch n's own stock is warehouse WH-n (head office WH-001, the stores after), except the
// retired Makati branch, whose WH-004 now belongs to Greenbelt 3.
const RETIRED_BRANCH = branchId('Makati (Greenbelt 3)');
export const SEED_BRANCHES: Branch[] = named('brn', BRANCHES).map((b, i) =>
  b.id === RETIRED_BRANCH
    ? { ...b, active: false, defaultWarehouseCode: '' }
    : { ...b, defaultWarehouseCode: `WH-${String(i + 1).padStart(3, '0')}` },
);
export const SEED_COST_CENTERS: NamedEntry[] = named('cc', COST_CENTERS);
export const SEED_USERS: NamedEntry[] = named('usr', USERS);
export const SEED_EMPLOYEE_ROLES: NamedEntry[] = named('erl', EMPLOYEE_ROLES);
export const SEED_TEAMS: NamedEntry[] = named('tm', TEAMS);
export const SEED_EMPLOYEE_STATUSES: NamedEntry[] = named('est', EMPLOYEE_STATUSES);
export const SEED_TERMINATION_REASONS: NamedEntry[] = named('trm', TERMINATION_REASONS);
