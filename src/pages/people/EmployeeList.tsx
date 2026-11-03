import { useMemo } from 'react';
import { TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../components/form/listColumns';
import type { Employee } from '../../mocks/employees';
import { employeeName, employeeNameOf, employees } from '../../services/employees';
import { nameIn } from '../../services/partnerMasters';
import { branches, departments, positions } from '../../services/peopleMasters';
import { useCollection } from '../../components/form/MasterLookup';
import { EMPTY_FILTER, oneRule } from '../../components/filter/engine';
import { choiceField, textField } from '../../components/filter/fieldKit';
import type { BuiltInView } from '../../components/filter/useListViews';
import { EMPLOYEES_PATH, EMPLOYEE_NOUN } from './paths';

const initials = (e: Employee) => `${e.firstName[0] ?? ''}${e.lastName[0] ?? ''}`.toUpperCase();
const name = (list: Parameters<typeof nameIn>[0], id: string) => (id ? nameIn(list, id) : '');

const FIELDS = [
  textField<Employee>('name', 'Name', (e) => [e.firstName, e.middleName, e.lastName]),
  textField<Employee>('code', 'Employee code', (e) => e.code),
  textField<Employee>('jobTitle', 'Job title', (e) => e.jobTitle),
  textField<Employee>('department', 'Department', (e) => name(departments, e.departmentId)),
  textField<Employee>('branch', 'Branch', (e) => name(branches, e.branchId)),
  textField<Employee>('manager', 'Manager', (e) => (e.managerId ? employeeNameOf(e.managerId) : '')),
  choiceField<Employee>('status', 'Status', ['Active', 'Inactive'], (e) => (e.active ? 'Active' : 'Inactive')),
];

const VIEWS: BuiltInView[] = [
  { id: 'active', name: 'Active employees', filter: oneRule('status', 'is', 'Active') },
  { id: 'all', name: 'All employees', filter: EMPTY_FILTER },
  { id: 'inactive', name: 'Inactive employees', filter: oneRule('status', 'is', 'Inactive') },
];

function sortValue(e: Employee, key: string): string {
  if (key === 'name') return employeeName(e).toLowerCase();
  if (key === 'department') return name(departments, e.departmentId);
  if (key === 'branch') return name(branches, e.branchId);
  if (key === 'manager') return e.managerId ? employeeNameOf(e.managerId) : '';
  const value = e[key as keyof Employee];
  return typeof value === 'string' ? value : '';
}

export function EmployeeList({ compact, selectedId }: { compact?: boolean; selectedId?: string } = {}) {
  const loaded = useCollection(employees);
  const all = useMemo(() => [...(loaded ?? [])], [loaded]);
  useCollection(departments);
  useCollection(branches);
  useCollection(positions);

  const allColumns: ListColumn<Employee>[] = [
    { key: 'name', header: 'Employee', sortable: true, locked: true, cell: (e) => <TableContent href={`#${EMPLOYEES_PATH}/${e.id}`} subcopy={e.code}>{employeeName(e)}</TableContent> },
    { key: 'jobTitle', header: 'Job title', sortable: true, cell: (e) => <TableContent subcopy={name(positions, e.positionId)}>{e.jobTitle || '—'}</TableContent> },
    { key: 'department', header: 'Department', sortable: true, cell: (e) => name(departments, e.departmentId) || '—' },
    { key: 'branch', header: 'Branch', sortable: true, cell: (e) => name(branches, e.branchId) || '—' },
    {
      key: 'manager',
      header: 'Manager',
      sortable: true,
      cell: (e) => {
        const m = all.find((x) => x.id === e.managerId);
        return m ? <TableContent initials={initials(m)}>{employeeName(m)}</TableContent> : '—';
      },
    },
    { key: 'contact', header: 'Contact', defaultHidden: true, cell: (e) => <TableContent subcopy={e.mobilePhone}>{e.email || '—'}</TableContent> },
    { key: 'status', header: 'Status', cell: (e) => <TableStatus intent={e.active ? 'success' : 'default'}>{e.active ? 'Active' : 'Inactive'}</TableStatus> },
  ];

  const { columns, manager } = useListColumns('employees', allColumns);

  return (
    <ListPage
      rows={loaded ? all : undefined}
      columns={columns}
      fields={FIELDS}
      noun={EMPLOYEE_NOUN}
      icon="badge"
      basePath={EMPLOYEES_PATH}
      listKey="employees"
      builtIns={VIEWS}
      defaultSort={{ key: 'name', direction: 'asc' }}
      search={{ placeholder: 'Search by name, code, job title or e-mail', label: 'Search employees' }}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      filterFn={(e, q) => !q || `${e.code} ${e.firstName} ${e.middleName} ${e.lastName} ${e.jobTitle} ${e.email}`.toLowerCase().includes(q)}
      sortFn={(a, b, sort) => sortValue(a, sort.key).localeCompare(sortValue(b, sort.key))}
    />
  );
}
