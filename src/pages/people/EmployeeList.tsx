import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  Card,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableContent,
  TableStatus,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import type { Employee } from '../../mocks/employees';
import { employeeName, employeeNameOf, employees } from '../../services/employees';
import { nameIn } from '../../services/partnerMasters';
import { branches, departments, positions } from '../../services/peopleMasters';
import { useCollection } from '../../components/form/MasterLookup';
import { fillCardClass, useListPage } from '../../components/form/DataTable';
import { EMPTY_FILTER, oneRule } from '../../components/filter/engine';
import { choiceField, textField } from '../../components/filter/fieldKit';
import { useListPresets } from '../../components/filter/useListPresets';
import type { BuiltInView } from '../../components/filter/useListViews';
import { EMPLOYEES_PATH } from './paths';

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

/** Sort key → comparable text. */
function sortValue(e: Employee, key: string): string {
  if (key === 'name') return employeeName(e).toLowerCase();
  if (key === 'department') return name(departments, e.departmentId);
  if (key === 'branch') return name(branches, e.branchId);
  if (key === 'manager') return e.managerId ? employeeNameOf(e.managerId) : '';
  const value = e[key as keyof Employee];
  return typeof value === 'string' ? value : '';
}

/** People › Employees: Employee Master Data. */
export function EmployeeList() {
  const navigate = useNavigate();
  const loaded = useCollection(employees);
  const all = useMemo(() => [...(loaded ?? [])], [loaded]);
  // The lookups below read these lists; subscribing re-renders the table after a rename in Settings.
  useCollection(departments);
  useCollection(branches);
  useCollection(positions);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
  const presets = useListPresets({
    list: 'employees',
    fields: FIELDS,
    builtIns: VIEWS,
    defaultSort: { key: 'name', direction: 'asc' },
    rows: loaded ? all : undefined,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(all).filter(
      (e) => !q || `${e.code} ${e.firstName} ${e.middleName} ${e.lastName} ${e.jobTitle} ${e.email}`.toLowerCase().includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => sortValue(a, sort.key).localeCompare(sortValue(b, sort.key)) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, presets.filter, query, sort]);

  const { visible: onPage, pagination } = paginate(rows);

  const columns: TableColumn<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      sortable: true,
      cell: (e) => (
        <TableContent href={`#${EMPLOYEES_PATH}/${e.id}`} subcopy={e.code}>{employeeName(e)}</TableContent>
      ),
    },
    {
      key: 'jobTitle',
      header: 'Job title',
      sortable: true,
      cell: (e) => <TableContent subcopy={name(positions, e.positionId)}>{e.jobTitle || '—'}</TableContent>,
    },
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
    {
      key: 'contact',
      header: 'Contact',
      cell: (e) => <TableContent subcopy={e.mobilePhone}>{e.email || '—'}</TableContent>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (e) => <TableStatus intent={e.active ? 'success' : 'default'}>{e.active ? 'Active' : 'Inactive'}</TableStatus>,
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="badge"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32} iconVariant="outline"
        title={presets.menu}
        showSearch
        searchLabel="Search employees"
        searchPlaceholder="Search by name, code, job title or e-mail"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="medium"
            shape="pill"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate(`${EMPLOYEES_PATH}/new`)}
          >
            New employee
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {presets.bar(null)}
        <Card className={fillCardClass(onPage.length)}>
          {loaded ? (
            <Table
              caption="Employees"
              columns={columns}
              rows={onPage}
              getRowId={(e) => e.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              pagination={pagination}
            />
          ) : (
            <Text tone="muted" className="p-4">Loading employees…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
