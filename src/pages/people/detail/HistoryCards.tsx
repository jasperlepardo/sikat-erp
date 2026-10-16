import { useState, type ReactNode } from 'react';
import { Icon, Link, Text, type TableColumn, type Option } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { FieldStack, bind, type Errors } from '../../../components/form/fields';
import { newId } from '../../../services/useCollectionRows';
import { formatDate } from '../../../services/dates';
import {
  ABSENCE_REASONS,
  EDUCATION_TYPES,
  type Absence,
  type Education,
  type PreviousEmployment,
  type Review,
} from '../../../mocks/employees';
import { EditPanel } from '../../partners/detail/EditPanel';
import type { Draft } from './types';

type Row = { id: string };
type ListKey = 'absences' | 'education' | 'reviews' | 'previousEmployment';

/** One of the employee's history lists: Absence, Education, Reviews or Previous employment. */
interface HistoryDef<T extends Row> {
  key: ListKey;
  icon: string;
  title: string;
  noun: string;
  description: string;
  blank: () => T;
  columns: (employeeName: (id: string) => string) => TableColumn<T>[];
  editor: (row: T, update: (patch: Partial<T>) => void, errors: Errors, employees: Option[]) => ReactNode;
  validate: (row: T) => Errors;
  /** Newest first. */
  sortKey: (row: T) => string;
}

const date = (iso: string) => (iso ? formatDate(iso) : '—');
const period = (from: string, to: string) => (from || to ? `${date(from)} – ${to ? date(to) : 'present'}` : '—');
const datesInOrder = (e: Errors, from: string, to: string) => {
  if (from && to && to < from) e.toDate = 'Ends before it starts.';
};

const absenceDef: HistoryDef<Absence> = {
  key: 'absences',
  icon: 'event_busy',
  title: 'Absence',
  noun: 'absence',
  description: 'Leaves and other absences, with who approved them.',
  blank: () => ({ id: newId('abs'), fromDate: '', toDate: '', reason: '', approvedById: '' }),
  columns: (nameOf) => [
    { key: 'fromDate', header: 'Period', cell: (a) => period(a.fromDate, a.toDate) },
    { key: 'reason', header: 'Reason', cell: (a) => a.reason || '—' },
    { key: 'approvedById', header: 'Approved by', cell: (a) => (a.approvedById ? nameOf(a.approvedById) : 'Not approved') },
  ],
  editor: (a, update, errors, employees) => {
    const f = bind(a, update);
    return (
      <FieldStack>
        {f.date('fromDate', 'From', { required: true, error: errors.fromDate })}
        {f.date('toDate', 'To', { required: true, error: errors.toDate })}
        {f.choose('reason', 'Reason', ABSENCE_REASONS.map((r) => ({ value: r, label: r })), { clearable: true, placeholder: 'Pick a reason' })}
        {f.lookup('approvedById', 'Approved by', employees, { clearable: true, placeholder: 'Not approved' })}
      </FieldStack>
    );
  },
  validate: (a) => {
    const e: Errors = {};
    if (!a.fromDate) e.fromDate = 'Enter the first day.';
    if (!a.toDate) e.toDate = 'Enter the last day.';
    datesInOrder(e, a.fromDate, a.toDate);
    return e;
  },
  sortKey: (a) => a.fromDate,
};

const educationDef: HistoryDef<Education> = {
  key: 'education',
  icon: 'school',
  title: 'Education',
  noun: 'education',
  description: 'Schools, degrees and certifications.',
  blank: () => ({ id: newId('edu'), fromDate: '', toDate: '', type: '', institution: '', major: '', diploma: '' }),
  columns: () => [
    { key: 'fromDate', header: 'Period', cell: (x) => period(x.fromDate, x.toDate) },
    { key: 'type', header: 'Type', cell: (x) => x.type || '—' },
    { key: 'institution', header: 'Institution', cell: (x) => x.institution || '—' },
    { key: 'diploma', header: 'Diploma', cell: (x) => x.diploma || x.major || '—' },
  ],
  editor: (x, update, errors) => {
    const f = bind(x, update);
    return (
      <FieldStack>
        {f.date('fromDate', 'From')}
        {f.date('toDate', 'To', { error: errors.toDate })}
        {f.choose('type', 'Type', EDUCATION_TYPES.map((t) => ({ value: t, label: t })), { clearable: true, placeholder: 'Pick a type' })}
        {f.text('institution', 'Institution', { required: true, error: errors.institution, placeholder: 'e.g. University of the Philippines Diliman' })}
        {f.text('major', 'Major', { placeholder: 'e.g. Accountancy' })}
        {f.text('diploma', 'Diploma', { placeholder: 'e.g. BS Accountancy' })}
      </FieldStack>
    );
  },
  validate: (x) => {
    const e: Errors = {};
    if (!x.institution.trim()) e.institution = 'Enter the school or institution.';
    datesInOrder(e, x.fromDate, x.toDate);
    return e;
  },
  sortKey: (x) => x.fromDate,
};

const reviewDef: HistoryDef<Review> = {
  key: 'reviews',
  icon: 'reviews',
  title: 'Reviews',
  noun: 'review',
  description: 'Performance reviews, with the reviewing manager and grade.',
  blank: () => ({ id: newId('rev'), date: '', description: '', managerId: '', grade: '', remarks: '' }),
  columns: (nameOf) => [
    { key: 'date', header: 'Date', cell: (r) => date(r.date) },
    { key: 'description', header: 'Review', cell: (r) => r.description || '—' },
    { key: 'managerId', header: 'Manager', cell: (r) => (r.managerId ? nameOf(r.managerId) : '—') },
    { key: 'grade', header: 'Grade', cell: (r) => r.grade || '—' },
  ],
  editor: (r, update, errors, employees) => {
    const f = bind(r, update);
    return (
      <FieldStack>
        {f.date('date', 'Date', { required: true, error: errors.date })}
        {f.text('description', 'Review', { required: true, error: errors.description, placeholder: 'e.g. Annual review 2026' })}
        {f.lookup('managerId', 'Manager', employees, { clearable: true, placeholder: 'Who reviewed' })}
        {f.text('grade', 'Grade', { placeholder: 'e.g. Meets expectations' })}
        {f.area('remarks', 'Remarks', { rows: 3 })}
      </FieldStack>
    );
  },
  validate: (r) => {
    const e: Errors = {};
    if (!r.date) e.date = 'Enter the review date.';
    if (!r.description.trim()) e.description = 'Describe the review.';
    return e;
  },
  sortKey: (r) => r.date,
};

const previousEmploymentDef: HistoryDef<PreviousEmployment> = {
  key: 'previousEmployment',
  icon: 'work_history',
  title: 'Previous employment',
  noun: 'previous employment',
  description: 'Where the employee worked before.',
  blank: () => ({ id: newId('pem'), fromDate: '', toDate: '', employer: '', position: '', remarks: '' }),
  columns: () => [
    { key: 'fromDate', header: 'Period', cell: (p) => period(p.fromDate, p.toDate) },
    { key: 'employer', header: 'Employer', cell: (p) => p.employer || '—' },
    { key: 'position', header: 'Position', cell: (p) => p.position || '—' },
  ],
  editor: (p, update, errors) => {
    const f = bind(p, update);
    return (
      <FieldStack>
        {f.date('fromDate', 'From')}
        {f.date('toDate', 'To', { error: errors.toDate })}
        {f.text('employer', 'Employer', { required: true, error: errors.employer, placeholder: 'e.g. Acme Trading Corp.' })}
        {f.text('position', 'Position', { placeholder: 'e.g. Sales Supervisor' })}
        {f.area('remarks', 'Remarks', { rows: 3 })}
      </FieldStack>
    );
  },
  validate: (p) => {
    const e: Errors = {};
    if (!p.employer.trim()) e.employer = 'Enter the employer.';
    datesInOrder(e, p.fromDate, p.toDate);
    return e;
  },
  sortKey: (p) => p.fromDate,
};

/** One history list as a card: rows newest first, a row opens its side panel. */
function HistoryCard<T extends Row>({
  def,
  draft,
  update,
  employees,
  employeeName,
}: {
  def: HistoryDef<T>;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  employees: Option[];
  employeeName: (id: string) => string;
}) {
  const rows = draft[def.key] as unknown as T[];
  const [editing, setEditing] = useState<{ value: T; isNew: boolean } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const save = (list: T[]) => update({ [def.key]: list } as Partial<Draft>);

  const open = (value: T, isNew: boolean) => {
    setErrors({});
    setEditing({ value: structuredClone(value), isNew });
  };
  const done = () => {
    if (!editing) return;
    const found = def.validate(editing.value);
    setErrors(found);
    if (Object.keys(found).length) return;
    save(editing.isNew ? [...rows, editing.value] : rows.map((r) => (r.id === editing.value.id ? editing.value : r)));
    setEditing(null);
  };

  return (
    <>
      <DataTable<T>
        variant="card"
        icon={def.icon}
        title={def.title}
        description={def.description}
        actions={
          <Link leadingIcon={<Icon size={20}>add</Icon>} onClick={() => open(def.blank(), true)}>
            Add {def.noun}
          </Link>
        }
        rows={[...rows].sort((a, b) => def.sortKey(b).localeCompare(def.sortKey(a)))}
        columns={def.columns(employeeName)}
        getRowId={(r) => r.id}
        sortValue={(r, key) => String((r as Record<string, unknown>)[key] ?? '')}
        noPagination
        onRemove={(picked) => save(rows.filter((r) => !picked.includes(r)))}
        empty={<Text variant="small" tone="muted">None recorded.</Text>}
      />
      {editing ? (
        <EditPanel
          icon={def.icon}
          title={`${editing.isNew ? 'Add' : 'Edit'} ${def.noun}`}
          onCancel={() => setEditing(null)}
          onDone={done}
        >
          {def.editor(editing.value, (p) => setEditing({ ...editing, value: { ...editing.value, ...p } }), errors, employees)}
        </EditPanel>
      ) : null}
    </>
  );
}

/** Absence, Education, Reviews and Previous employment, in SAP B1's order. */
export function HistoryCards(props: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  employees: Option[];
  employeeName: (id: string) => string;
}) {
  return (
    <>
      <HistoryCard def={absenceDef} {...props} />
      <HistoryCard def={educationDef} {...props} />
      <HistoryCard def={reviewDef} {...props} />
      <HistoryCard def={previousEmploymentDef} {...props} />
    </>
  );
}
