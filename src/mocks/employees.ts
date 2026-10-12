/**
 * Employee Master Data (SAP B1 OHEM): the people who work for the company. Separate from the
 * Sales employees & buyers list (OSLP), which an employee links to through `salesEmployeeId`.
 */
import { blankPostalAddress, type PostalAddress } from './address';
import { bankId, employeeId } from './masters';
import {
  branchId,
  costCenterId,
  departmentId,
  employeeRoleId,
  employeeStatusId,
  positionId,
  teamId,
  terminationReasonId,
  userId,
  type TeamRole,
} from './peopleMasters';

export const GENDERS = ['Male', 'Female'] as const;
export type Gender = (typeof GENDERS)[number];
export const MARITAL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];
/** What a salary or employee cost amount is per. */
export const PAY_PERIODS = ['Hour', 'Day', 'Week', 'Semi-month', 'Month', 'Year'] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];
export const EDUCATION_TYPES = ['High school', 'Vocational', 'Bachelor', 'Master', 'Doctorate', 'Certification'] as const;
export const ABSENCE_REASONS = ['Vacation leave', 'Sick leave', 'Maternity leave', 'Paternity leave', 'Solo parent leave', 'Emergency leave', 'Unpaid leave'] as const;

export interface EmployeeRole {
  roleId: string;
}
export interface EmployeeTeam {
  teamId: string;
  teamRole: TeamRole;
}
export interface Absence {
  id: string;
  fromDate: string;
  toDate: string;
  reason: string;
  /** Employee id of who approved it; '' when not yet approved. */
  approvedById: string;
}
export interface Education {
  id: string;
  fromDate: string;
  toDate: string;
  type: string;
  institution: string;
  major: string;
  diploma: string;
}
export interface Review {
  id: string;
  date: string;
  description: string;
  /** Employee id of the reviewing manager. */
  managerId: string;
  grade: string;
  remarks: string;
}
export interface PreviousEmployment {
  id: string;
  fromDate: string;
  toDate: string;
  employer: string;
  position: string;
  remarks: string;
}

export interface Employee {
  id: string;
  /** Employee code: assigned on save (EMP-0001) unless typed. Locked once saved. */
  code: string;
  firstName: string;
  middleName: string;
  lastName: string;
  /** Number in an outside payroll system. */
  externalNo: string;
  active: boolean;
  jobTitle: string;
  positionId: string;
  departmentId: string;
  branchId: string;
  /** Employee id of the direct manager. */
  managerId: string;
  userId: string;
  /** Entry in Sales employees & buyers this employee sells or buys as. */
  salesEmployeeId: string;
  costCenterId: string;
  officePhone: string;
  officeExt: string;
  mobilePhone: string;
  pager: string;
  homePhone: string;
  fax: string;
  email: string;
  /** Vendor business partner the employee's expense claims are paid through. */
  vendorId: string;

  workAddress: PostalAddress;
  homeAddress: PostalAddress;

  roles: EmployeeRole[];
  /** One of `roles`; '' when none is set. */
  defaultRoleId: string;
  teams: EmployeeTeam[];

  startDate: string;
  statusId: string;
  terminationDate: string;
  terminationReasonId: string;
  /** How the name displays: "Ana Cruz" or "Cruz Ana" / "Cruz, Ana". */
  nameOrder: 'first-last' | 'last-first';
  nameComma: boolean;
  showMiddleName: boolean;
  absences: Absence[];
  education: Education[];
  reviews: Review[];
  previousEmployment: PreviousEmployment[];

  gender: Gender | '';
  dateOfBirth: string;
  birthCountryCode: string;
  maritalStatus: MaritalStatus | '';
  children: number;
  /** National ID number (PhilSys PSN for Filipino citizens). */
  idNo: string;
  citizenshipCode: string;
  passportNo: string;
  passportIssueDate: string;
  passportExpiryDate: string;
  passportIssuer: string;

  salary: number;
  salaryPeriod: PayPeriod;
  employeeCost: number;
  employeeCostPeriod: PayPeriod;
  bankId: string;
  bankAccountNo: string;
  bankBranch: string;

  remarks: string;
}

export const blankEmployee = (): Omit<Employee, 'id'> & { id?: string } => ({
  code: '',
  firstName: '',
  middleName: '',
  lastName: '',
  externalNo: '',
  active: true,
  jobTitle: '',
  positionId: '',
  departmentId: '',
  branchId: '',
  managerId: '',
  userId: '',
  salesEmployeeId: '',
  costCenterId: '',
  officePhone: '',
  officeExt: '',
  mobilePhone: '',
  pager: '',
  homePhone: '',
  fax: '',
  email: '',
  vendorId: '',
  workAddress: blankPostalAddress(),
  homeAddress: blankPostalAddress(),
  roles: [{ roleId: employeeRoleId('Employee') }],
  defaultRoleId: employeeRoleId('Employee'),
  teams: [],
  startDate: '',
  statusId: '',
  terminationDate: '',
  terminationReasonId: '',
  nameOrder: 'first-last',
  nameComma: false,
  showMiddleName: false,
  absences: [],
  education: [],
  reviews: [],
  previousEmployment: [],
  gender: '',
  dateOfBirth: '',
  birthCountryCode: 'PH',
  maritalStatus: '',
  children: 0,
  idNo: '',
  citizenshipCode: 'PH',
  passportNo: '',
  passportIssueDate: '',
  passportExpiryDate: '',
  passportIssuer: '',
  salary: 0,
  salaryPeriod: 'Month',
  employeeCost: 0,
  employeeCostPeriod: 'Month',
  bankId: '',
  bankAccountNo: '',
  bankBranch: '',
  remarks: '',
});

// ── Seed ─────────────────────────────────────────────────────────────────────

/** Work addresses: head office and the stores (as on their warehouses in Inventory). */
const HEAD_OFFICE = blankPostalAddress({ addressLine: '155 Dr. Sixto Antonio Ave.', block: 'Rosario', city: 'City of Pasig', province: 'Metro Manila', zip: '1600', provinceCode: '1300', cityCode: '137403' });
const CEBU = blankPostalAddress({ addressLine: '1/L Robinsons Galleria Cebu, Maxilom-Osmeña Blvd.', block: 'Tejero', city: 'Cebu City', province: 'Cebu', zip: '6000', provinceCode: '0722', cityCode: '072217', barangayCode: '072217083' });
const DAVAO = blankPostalAddress({ addressLine: '2nd Flr., Abreeza Mall, J.P. Laurel Ave., Bajada', block: 'Barangay 20-B', city: 'Davao City', province: 'Davao del Sur', zip: '8000', provinceCode: '1124', cityCode: '112402', barangayCode: '112402153' });
const GREENBELT = blankPostalAddress({ addressLine: '2/F Greenbelt 3, Greenbelt Complex, Ayala Center', block: 'San Lorenzo', city: 'City of Makati', province: 'Metro Manila', zip: '1223', provinceCode: '1300', cityCode: '137602', barangayCode: '137602025' });
const home = (addressLine: string, city: string, province: string, zip: string) => blankPostalAddress({ addressLine, city, province, zip });

/** Employee seed ids, in seed order: `hem-001`… Append; never reorder. */
export const EMPLOYEE_NAMES = [
  'Ramon Villanueva', 'Jasper L.', 'Andrea Ramos', 'Ben Salazar', 'Carla Uy', 'Dino Pascual',
  'Edgar Bautista', 'Fe Lopez', 'Grace Tan', 'Hector Dizon', 'Isabel Reyes', 'Jun Mercado',
] as const;
const hemId = (name: (typeof EMPLOYEE_NAMES)[number]) => `hem-${String(EMPLOYEE_NAMES.indexOf(name) + 1).padStart(3, '0')}`;

type Seed = Partial<Employee> & Pick<Employee, 'firstName' | 'lastName'>;
const seed = (n: number, name: (typeof EMPLOYEE_NAMES)[number], s: Seed): Employee => {
  const roles = s.roles ?? [{ roleId: employeeRoleId('Employee') }];
  return {
    ...blankEmployee(),
    id: hemId(name),
    code: `EMP-${String(n).padStart(4, '0')}`,
    email: `${s.firstName.toLowerCase()}.${s.lastName.toLowerCase().replace(/\s+/g, '')}@sikat.ph`,
    officePhone: '(02) 8631 2200',
    statusId: employeeStatusId('Regular'),
    ...s,
    roles,
    defaultRoleId: s.defaultRoleId ?? roles[0].roleId,
  };
};

export const SEED_EMPLOYEES: Employee[] = [
  seed(1, 'Ramon Villanueva', {
    firstName: 'Ramon', middleName: 'Santos', lastName: 'Villanueva', jobTitle: 'General Manager', positionId: positionId('General Manager'),
    departmentId: departmentId('Management'), branchId: branchId('Head office (Pasig)'), userId: userId('manager'), costCenterId: costCenterId('Administration'),
    officeExt: '100', mobilePhone: '0917 555 0100', workAddress: HEAD_OFFICE, homeAddress: home('12 Acacia Lane, Valle Verde 5', 'City of Pasig', 'Metro Manila', '1604'),
    roles: [{ roleId: employeeRoleId('Employee') }, { roleId: employeeRoleId('Approver') }], defaultRoleId: employeeRoleId('Approver'),
    teams: [{ teamId: teamId('Store launch'), teamRole: 'Leader' }],
    startDate: '2026-01-01', gender: 'Male', dateOfBirth: '1974-03-18', maritalStatus: 'Married', children: 2, idNo: '1234-5678-9012-3456',
    salary: 220000, employeeCost: 265000, bankId: bankId('BDO Unibank'), bankAccountNo: '0012 3456 7890', bankBranch: 'Ortigas Center',
    education: [{ id: 'edu-1', fromDate: '1991-06-01', toDate: '1995-04-01', type: 'Bachelor', institution: 'Ateneo de Manila University', major: 'Management Engineering', diploma: 'BS Management Engineering' }],
    previousEmployment: [{ id: 'pem-1', fromDate: '2012-02-01', toDate: '2025-12-31', employer: 'Power Retail Group', position: 'Regional Operations Head', remarks: '' }],
  }),
  seed(2, 'Jasper L.', {
    firstName: 'Jasper', lastName: 'L.', email: 'jasper@sikat.ph', jobTitle: 'Business Systems Lead', positionId: positionId('Store Manager'),
    departmentId: departmentId('Sales'), branchId: branchId('Head office (Pasig)'), managerId: hemId('Ramon Villanueva'), userId: userId('jasper'),
    salesEmployeeId: employeeId('Jasper L.'), costCenterId: costCenterId('Corporate sales'), officeExt: '110', mobilePhone: '0917 555 0110', workAddress: HEAD_OFFICE,
    roles: [{ roleId: employeeRoleId('Sales') }, { roleId: employeeRoleId('Approver') }],
    teams: [{ teamId: teamId('Corporate accounts'), teamRole: 'Leader' }, { teamId: teamId('Store launch'), teamRole: 'Member' }],
    startDate: '2026-01-01', salary: 120000, employeeCost: 145000, bankId: bankId('BPI'), bankAccountNo: '3089 1122 33', bankBranch: 'Kapitolyo',
  }),
  seed(3, 'Andrea Ramos', {
    firstName: 'Andrea', lastName: 'Ramos', jobTitle: 'Corporate Account Manager', positionId: positionId('Sales Associate'),
    departmentId: departmentId('Sales'), branchId: branchId('Head office (Pasig)'), managerId: hemId('Jasper L.'), userId: userId('andrea'),
    salesEmployeeId: employeeId('Andrea Ramos'), costCenterId: costCenterId('Corporate sales'), officeExt: '121', mobilePhone: '0917 555 0121', workAddress: HEAD_OFFICE,
    roles: [{ roleId: employeeRoleId('Sales') }], teams: [{ teamId: teamId('Corporate accounts'), teamRole: 'Member' }],
    startDate: '2026-01-05', gender: 'Female', maritalStatus: 'Married', children: 1, salary: 55000, employeeCost: 68000, bankId: bankId('BDO Unibank'), bankAccountNo: '0045 6677 8899', bankBranch: 'Pasig Capitol',
    absences: [{ id: 'abs-1', fromDate: '2026-04-13', toDate: '2026-04-17', reason: 'Vacation leave', approvedById: hemId('Jasper L.') }],
    reviews: [{ id: 'rev-1', date: '2026-07-01', description: 'Mid-year review', managerId: hemId('Jasper L.'), grade: 'Exceeds expectations', remarks: 'Closed the DepEd Pasig rollout.' }],
  }),
  seed(4, 'Ben Salazar', {
    firstName: 'Ben', lastName: 'Salazar', jobTitle: 'Store Manager, Cebu', positionId: positionId('Store Manager'),
    departmentId: departmentId('Sales'), branchId: branchId('Cebu (Robinsons Galleria)'), managerId: hemId('Ramon Villanueva'), userId: userId('ben'),
    salesEmployeeId: employeeId('Ben Salazar'), costCenterId: costCenterId('Store operations'), officePhone: '(032) 412 7788', mobilePhone: '0918 555 0130', workAddress: CEBU,
    roles: [{ roleId: employeeRoleId('Sales') }, { roleId: employeeRoleId('Approver') }], teams: [{ teamId: teamId('Store launch'), teamRole: 'Member' }],
    startDate: '2026-01-01', gender: 'Male', maritalStatus: 'Married', children: 3, salary: 65000, employeeCost: 80000, bankId: bankId('Metrobank'), bankAccountNo: '112 3 44556 7', bankBranch: 'Cebu Fuente',
  }),
  seed(5, 'Carla Uy', {
    firstName: 'Carla', lastName: 'Uy', jobTitle: 'Purchasing Officer', positionId: positionId('Buyer'),
    departmentId: departmentId('Purchasing'), branchId: branchId('Head office (Pasig)'), managerId: hemId('Ramon Villanueva'), userId: userId('carla'),
    salesEmployeeId: employeeId('Carla Uy'), costCenterId: costCenterId('Logistics'), officeExt: '140', mobilePhone: '0917 555 0140', workAddress: HEAD_OFFICE,
    roles: [{ roleId: employeeRoleId('Purchaser') }], teams: [{ teamId: teamId('Month-end close'), teamRole: 'Member' }],
    startDate: '2026-01-01', gender: 'Female', maritalStatus: 'Single', salary: 48000, employeeCost: 59000, bankId: bankId('Security Bank'), bankAccountNo: '0000 0612 3456', bankBranch: 'Ortigas',
  }),
  seed(6, 'Dino Pascual', {
    firstName: 'Dino', lastName: 'Pascual', jobTitle: 'Store Manager, Davao', positionId: positionId('Store Manager'),
    departmentId: departmentId('Sales'), branchId: branchId('Davao (Abreeza)'), managerId: hemId('Ramon Villanueva'), userId: userId('dino'),
    salesEmployeeId: employeeId('Dino Pascual'), costCenterId: costCenterId('Store operations'), officePhone: '(082) 285 4411', mobilePhone: '0918 555 0160', workAddress: DAVAO,
    roles: [{ roleId: employeeRoleId('Sales') }], startDate: '2026-01-01', gender: 'Male', maritalStatus: 'Married', children: 1,
    salary: 62000, employeeCost: 76000, bankId: bankId('Land Bank of the Philippines'), bankAccountNo: '2541 0988 77', bankBranch: 'Davao Bajada',
  }),
  seed(7, 'Edgar Bautista', {
    firstName: 'Edgar', lastName: 'Bautista', jobTitle: 'Senior Service Technician', positionId: positionId('Technician'),
    departmentId: departmentId('Service'), branchId: branchId('Makati (Greenbelt 3)'), managerId: hemId('Ramon Villanueva'), costCenterId: costCenterId('After-sales service'),
    officePhone: '(02) 8757 3300', mobilePhone: '0917 555 0170', workAddress: GREENBELT, roles: [{ roleId: employeeRoleId('Technician') }],
    startDate: '2026-01-01', gender: 'Male', maritalStatus: 'Married', children: 2, salary: 42000, employeeCost: 52000, bankId: bankId('UnionBank'), bankAccountNo: '1092 3344 5566', bankBranch: 'Makati Ayala',
    education: [{ id: 'edu-1', fromDate: '2024-03-01', toDate: '2024-03-31', type: 'Certification', institution: 'Apple', major: 'Mac Service', diploma: 'Apple Certified Mac Technician' }],
  }),
  seed(8, 'Fe Lopez', {
    firstName: 'Fe', lastName: 'Lopez', jobTitle: 'Service Technician', positionId: positionId('Technician'),
    departmentId: departmentId('Service'), branchId: branchId('Makati (Greenbelt 3)'), managerId: hemId('Edgar Bautista'), costCenterId: costCenterId('After-sales service'),
    officePhone: '(02) 8757 3300', mobilePhone: '0917 555 0180', workAddress: GREENBELT, roles: [{ roleId: employeeRoleId('Technician') }],
    startDate: '2026-03-02', statusId: employeeStatusId('Probationary'), gender: 'Female', maritalStatus: 'Single', salary: 30000, employeeCost: 38000,
    bankId: bankId('BPI'), bankAccountNo: '4410 2299 01', bankBranch: 'Greenbelt',
  }),
  seed(9, 'Grace Tan', {
    firstName: 'Grace', middleName: 'Lim', lastName: 'Tan', jobTitle: 'Chief Accountant', positionId: positionId('Accountant'),
    departmentId: departmentId('Finance'), branchId: branchId('Head office (Pasig)'), managerId: hemId('Ramon Villanueva'), userId: userId('finance'),
    costCenterId: costCenterId('Administration'), officeExt: '150', mobilePhone: '0917 555 0190', workAddress: HEAD_OFFICE,
    roles: [{ roleId: employeeRoleId('Employee') }, { roleId: employeeRoleId('Approver') }], teams: [{ teamId: teamId('Month-end close'), teamRole: 'Leader' }],
    startDate: '2026-01-01', gender: 'Female', maritalStatus: 'Married', salary: 95000, employeeCost: 115000, bankId: bankId('China Bank'), bankAccountNo: '1450 7788 99', bankBranch: 'Pasig Kapitolyo',
    nameOrder: 'last-first', nameComma: true, showMiddleName: true,
  }),
  seed(10, 'Hector Dizon', {
    firstName: 'Hector', lastName: 'Dizon', jobTitle: 'Warehouse Supervisor', positionId: positionId('Warehouse Supervisor'),
    departmentId: departmentId('Operations'), branchId: branchId('Head office (Pasig)'), managerId: hemId('Ramon Villanueva'), costCenterId: costCenterId('Logistics'),
    officeExt: '160', mobilePhone: '0917 555 0200', workAddress: HEAD_OFFICE, startDate: '2026-01-01', gender: 'Male', maritalStatus: 'Married', children: 2,
    salary: 38000, employeeCost: 47000, bankId: bankId('RCBC'), bankAccountNo: '7591 0033 44', bankBranch: 'Pasig',
  }),
  seed(11, 'Isabel Reyes', {
    firstName: 'Isabel', lastName: 'Reyes', jobTitle: 'HR & Admin Officer', positionId: positionId('HR Officer'),
    departmentId: departmentId('Human Resources'), branchId: branchId('Head office (Pasig)'), managerId: hemId('Ramon Villanueva'), costCenterId: costCenterId('Administration'),
    officeExt: '170', mobilePhone: '0917 555 0210', workAddress: HEAD_OFFICE, startDate: '2026-01-12', gender: 'Female', maritalStatus: 'Single',
    salary: 40000, employeeCost: 49000, bankId: bankId('BDO Unibank'), bankAccountNo: '0067 1234 5500', bankBranch: 'Ortigas Center',
    absences: [{ id: 'abs-1', fromDate: '2026-08-10', toDate: '2026-08-11', reason: 'Sick leave', approvedById: hemId('Ramon Villanueva') }],
  }),
  seed(12, 'Jun Mercado', {
    firstName: 'Jun', lastName: 'Mercado', jobTitle: 'Sales Associate', positionId: positionId('Sales Associate'),
    departmentId: departmentId('Sales'), branchId: branchId('Cebu (Robinsons Galleria)'), managerId: hemId('Ben Salazar'), costCenterId: costCenterId('Store operations'),
    officePhone: '(032) 412 7788', mobilePhone: '0918 555 0220', workAddress: CEBU, roles: [{ roleId: employeeRoleId('Sales') }],
    startDate: '2026-02-02', active: false, statusId: employeeStatusId('Contractual'), terminationDate: '2026-07-31', terminationReasonId: terminationReasonId('End of contract'),
    gender: 'Male', maritalStatus: 'Single', salary: 22000, employeeCost: 28000,
  }),
];
