/**
 * Starter values for the lists Employee Master Data picks from (Settings › People and Company).
 * Seeded into managed collections (services/peopleMasters.ts); read those, not these.
 * Append to the lists; never reorder (ids are positional).
 */
import { idIn } from './masters';
import { named, type NamedEntry } from './partnerMasters';

export const POSITIONS = [
  'General Manager', 'Store Manager', 'Sales Associate', 'Technician', 'Accountant', 'Warehouse Supervisor', 'Buyer', 'HR Officer',
] as const;
export const positionId = idIn('pos', POSITIONS);

export const DEPARTMENTS = ['Management', 'Sales', 'Service', 'Finance', 'Operations', 'Purchasing', 'Human Resources'] as const;
export const departmentId = idIn('dpt', DEPARTMENTS);

/** Company branches: head office and the stores (each store is also a warehouse in Inventory). */
export const BRANCHES = ['Head office (Pasig)', 'Cebu (Robinsons Galleria)', 'Davao (Abreeza)', 'Makati (Greenbelt 3)'] as const;
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
export const SEED_BRANCHES: NamedEntry[] = named('brn', BRANCHES);
export const SEED_COST_CENTERS: NamedEntry[] = named('cc', COST_CENTERS);
export const SEED_USERS: NamedEntry[] = named('usr', USERS);
export const SEED_EMPLOYEE_ROLES: NamedEntry[] = named('erl', EMPLOYEE_ROLES);
export const SEED_TEAMS: NamedEntry[] = named('tm', TEAMS);
export const SEED_EMPLOYEE_STATUSES: NamedEntry[] = named('est', EMPLOYEE_STATUSES);
export const SEED_TERMINATION_REASONS: NamedEntry[] = named('trm', TERMINATION_REASONS);
