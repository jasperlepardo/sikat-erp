import type { NamedEntry } from '../mocks/partnerMasters';
import {
  SEED_BRANCHES,
  SEED_COST_CENTERS,
  SEED_DEPARTMENTS,
  SEED_EMPLOYEE_ROLES,
  SEED_EMPLOYEE_STATUSES,
  SEED_POSITIONS,
  SEED_TEAMS,
  SEED_TERMINATION_REASONS,
  SEED_USERS,
} from '../mocks/peopleMasters';
import { createCollection } from './store';

// People (Settings › People)
export const positions = createCollection<NamedEntry>('sikat-erp:positions', SEED_POSITIONS, 'pos');
export const departments = createCollection<NamedEntry>('sikat-erp:departments', SEED_DEPARTMENTS, 'dpt');
export const employeeRoles = createCollection<NamedEntry>('sikat-erp:employee-roles', SEED_EMPLOYEE_ROLES, 'erl');
export const teams = createCollection<NamedEntry>('sikat-erp:teams', SEED_TEAMS, 'tm');
export const employeeStatuses = createCollection<NamedEntry>('sikat-erp:employee-statuses', SEED_EMPLOYEE_STATUSES, 'est');
export const terminationReasons = createCollection<NamedEntry>('sikat-erp:termination-reasons', SEED_TERMINATION_REASONS, 'trm');

// Company (Settings › Company)
export const branches = createCollection<NamedEntry>('sikat-erp:branches', SEED_BRANCHES, 'brn');
export const costCenters = createCollection<NamedEntry>('sikat-erp:cost-centers', SEED_COST_CENTERS, 'cc');
export const users = createCollection<NamedEntry>('sikat-erp:users', SEED_USERS, 'usr');
