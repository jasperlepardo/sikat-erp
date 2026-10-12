import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Badge, Button, Form, FormField, Panel, PanelHeader, Select, Tabs, Text, type Option } from '@jasperlepardo/sikat-design-system';
import { FieldStack, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { useCollection } from '../../../components/form/MasterLookup';
import { MoreMenu } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem as ProblemBase } from '../../../components/form/ProblemsAlert';
import { PrevNext, neighbours } from '../../../components/form/DetailNav';
import { blankEmployee } from '../../../mocks/employees';
import { employeeName, employees, getEmployee, saveEmployee } from '../../../services/employees';
import { listPartnersByRole } from '../../../services/partners';
import { useAsync } from '../../../services/useAsync';
import { branchDef, costCenterDef, departmentDef, positionDef, salesEmployeeDef, userDef } from '../../settings/masterDefs';
import { EMPLOYEES_PATH } from '../EmployeeList';
import { AddressTab } from './AddressTab';
import { AdministrationTab } from './AdministrationTab';
import { FinanceTab } from './FinanceTab';
import { MembershipTab } from './MembershipTab';
import { PersonalTab } from './PersonalTab';
import { TABS, type Draft, type TabId } from './types';

type Problem = ProblemBase<TabId>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checked on Add/Save. */
function validate(d: Draft, today: string): Problem[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.firstName.trim(), 'header', 'firstName', 'First name is required.');
  need(!d.email.trim() || EMAIL.test(d.email.trim()), 'header', 'email', 'Enter an e-mail address like name@company.ph.');
  need(!d.managerId || d.managerId !== d.id, 'header', 'managerId', 'An employee cannot be their own manager.');
  need(d.roles.every((r) => r.roleId), 'membership', 'roles', 'Pick a role on every row, or remove the empty row.');
  need(new Set(d.roles.map((r) => r.roleId)).size === d.roles.length, 'membership', 'roles', 'A role is listed twice.');
  need(d.teams.every((t) => t.teamId), 'membership', 'teams', 'Pick a team on every row, or remove the empty row.');
  need(new Set(d.teams.map((t) => t.teamId)).size === d.teams.length, 'membership', 'teams', 'A team is listed twice.');
  need(!d.terminationDate || !d.startDate || d.terminationDate >= d.startDate, 'administration', 'terminationDate', 'Termination date is before the start date.');
  need(!d.terminationReasonId || d.terminationDate, 'administration', 'terminationReasonId', 'A termination reason needs a termination date.');
  need(!d.dateOfBirth || d.dateOfBirth < today, 'personal', 'dateOfBirth', 'Date of birth must be in the past.');
  need(d.children >= 0 && Number.isInteger(d.children), 'personal', 'children', 'Enter a whole number, 0 or more.');
  need(
    !d.passportIssueDate || !d.passportExpiryDate || d.passportExpiryDate > d.passportIssueDate,
    'personal',
    'passportExpiryDate',
    'Expiration date must be after the issue date.',
  );
  need(d.salary >= 0, 'finance', 'salary', 'Salary cannot be negative.');
  need(d.employeeCost >= 0, 'finance', 'employeeCost', 'Employee costs cannot be negative.');
  return problems;
}

/** Employee Master Data. Keyed by record so moving between records (or duplicating into /new) starts a fresh form. */
export function EmployeeDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <EmployeeForm key={id === 'new' ? location.key : id} />;
}

function EmployeeForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: Draft } | null)?.copyFrom;

  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? (copyFrom ?? blankEmployee()) : undefined);
  const [codeMode, setCodeMode] = useState<'auto' | 'manual'>('auto');
  const [tab, setTab] = useState<TabId>('address');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [saving, setSaving] = useState(false);

  const all = useCollection(employees);
  const vendors = useAsync(() => listPartnersByRole('vendor'), []);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getEmployee(id).then((e) => !cancelled && setDraft(e ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (draft === undefined) return <Text tone="muted" className="p-4">Loading employee…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="badge" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="Employee not found" />
        <Panel.Body>
          <Button onClick={() => navigate(EMPLOYEES_PATH)}>Back to employees</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const h = bind(draft, update);
  const beside = { orientation: 'responsive' as const };

  const people = all ?? [];
  const nameOf = (eid: string) => {
    const e = people.find((x) => x.id === eid);
    return e ? employeeName(e) : eid;
  };
  /** Employees to pick from: active ones, plus `current` even if inactive. */
  const employeeOptions = (current: string, exclude?: string): Option[] =>
    [...people]
      .filter((e) => e.id !== exclude && (e.active || e.id === current))
      .sort((a, b) => employeeName(a).localeCompare(employeeName(b)))
      .map((e) => ({ value: e.id, label: employeeName(e), text: `${e.code} ${employeeName(e)}` }));
  const vendorOptions: Option[] = (vendors ?? [])
    .filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId)
    .map((v) => ({ value: v.id, label: `${v.code} · ${v.name}`, text: `${v.code} ${v.name}` }));

  const check = () => {
    const found = validate(draft, new Date().toISOString().slice(0, 10));
    setProblems(found);
    const first = found.find((p) => p.tab !== 'header');
    if (first && first.tab !== 'header') setTab(first.tab);
    return !found.length;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!check()) return;
    setSaving(true);
    try {
      await saveEmployee({ ...draft, code: isNew && codeMode === 'auto' ? '' : draft.code });
      navigate(EMPLOYEES_PATH);
    } catch (err) {
      setProblems([{ tab: 'header', key: 'code', message: (err as Error).message }]);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
    const copy: Draft = {
      ...structuredClone(draft),
      id: undefined,
      code: '',
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
      mobilePhone: '',
      homePhone: '',
      userId: '',
      salesEmployeeId: '',
      vendorId: '',
      homeAddress: { ...draft.homeAddress, addressLine: '', block: '', city: '', zip: '', province: '', provinceCode: '', cityCode: '', barangayCode: '' },
      absences: [],
      education: [],
      reviews: [],
      previousEmployment: [],
      gender: '',
      dateOfBirth: '',
      maritalStatus: '',
      children: 0,
      idNo: '',
      passportNo: '',
      passportIssueDate: '',
      passportExpiryDate: '',
      passportIssuer: '',
      bankAccountNo: '',
      remarks: '',
    };
    navigate(`${EMPLOYEES_PATH}/new`, { state: { copyFrom: copy } });
  };
  const menu = isNew ? [] : [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }];

  const sorted = [...people].sort((a, b) => employeeName(a).localeCompare(employeeName(b)));
  const { prevId, nextId } = neighbours(sorted.map((e) => e.id), draft.id);
  const title = isNew ? 'New employee' : employeeName(draft) || draft.code;

  return (
    <Form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} noValidate>
      <Panel className="min-h-0 flex-1">
        <PanelHeader
          type="details"
          icon="badge"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32} iconVariant="outline"
          breadcrumbs={[{ label: 'Employees', href: EMPLOYEES_PATH }, { label: title }]}
          onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
          onBack={() => navigate(EMPLOYEES_PATH)}
          trailing={isNew ? undefined : <PrevNext path={EMPLOYEES_PATH} prevId={prevId} nextId={nextId} />}
          status={isNew ? undefined : draft.active ? undefined : <Badge intent="default">Inactive</Badge>}
          actions={
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(EMPLOYEES_PATH)}>
                Cancel
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Add' : 'Save'}
              </Button>
            </>
          }
        />
        {/* Side by side (lg), each column scrolls on its own; stacked, the body scrolls as one. */}
        <Panel.Body className="flex flex-col gap-2 lg:overflow-hidden!">
          <ProblemsAlert problems={problems} tabLabel={(t) => TABS.find((x) => x.value === t)?.label} onOpenTab={(t) => setTab(t)} />

          <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-1">
            <aside className="flex flex-col gap-2 lg:col-span-3 lg:min-h-0 lg:overflow-y-auto">
              <Section icon="badge" title="Employee">
                <FieldStack>
                  {isNew ? (
                    <FormField orientation="responsive" label="Numbering" tooltip="Auto assigns the next EMP-####.">
                      {(p) => (
                        <Select
                          {...p}
                          options={[
                            { value: 'auto', label: 'Auto (EMP-####)' },
                            { value: 'manual', label: 'Manual' },
                          ]}
                          value={codeMode}
                          onValueChange={(v) => setCodeMode(v as 'auto' | 'manual')}
                        />
                      )}
                    </FormField>
                  ) : null}
                  {isNew ? (
                    codeMode === 'auto' ? (
                      <ReadOnly label="Employee code" value="Assigned on save" hint="Auto: the next EMP-####." />
                    ) : (
                      h.text('code', 'Employee code', { ...beside, required: true, error: errors.code, placeholder: 'e.g. EMP-0100' })
                    )
                  ) : (
                    <ReadOnly label="Employee code" value={draft.code} hint="Locked after the employee is added." error={errors.code} />
                  )}
                  {h.text('firstName', 'First name', { ...beside, required: true, error: errors.firstName })}
                  {h.text('middleName', 'Middle name', beside)}
                  {h.text('lastName', 'Last name', beside)}
                  {h.text('externalNo', 'Ext. employee no.', { ...beside, hint: 'Number in the outside payroll system.' })}
                  {h.status('active', 'Status', { ...beside, hint: 'Inactive employees drop out of pickers.' })}
                </FieldStack>
              </Section>

              <Section icon="corporate_fare" title="Organisation">
                <FieldStack>
                  {h.text('jobTitle', 'Job title', { ...beside, placeholder: 'e.g. Store Manager, Cebu' })}
                  {h.master('positionId', 'Position', positionDef, { ...beside, clearable: true })}
                  {h.master('departmentId', 'Department', departmentDef, { ...beside, clearable: true })}
                  {h.master('branchId', 'Branch', branchDef, { ...beside, clearable: true })}
                  {h.lookup('managerId', 'Manager', employeeOptions(draft.managerId, draft.id), {
                    ...beside,
                    clearable: true,
                    placeholder: 'None',
                    error: errors.managerId,
                  })}
                  {h.master('userId', 'User code', userDef, { ...beside, clearable: true, hint: 'The login account this employee uses.' })}
                  {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, {
                    ...beside,
                    clearable: true,
                    hint: 'The Sales employees & buyers entry this employee sells or buys as.',
                  })}
                  {h.master('costCenterId', 'Cost center', costCenterDef, { ...beside, clearable: true })}
                  {h.lookup('vendorId', 'Linked vendor', vendorOptions, {
                    ...beside,
                    clearable: true,
                    placeholder: 'None',
                    hint: 'Vendor record expense claims are paid through.',
                  })}
                </FieldStack>
              </Section>

              <Section icon="call" title="Contact">
                <FieldStack>
                  {h.text('officePhone', 'Office phone', { ...beside, placeholder: '(02) 8000 0000' })}
                  {h.text('officeExt', 'Ext.', beside)}
                  {h.text('mobilePhone', 'Mobile phone', { ...beside, placeholder: '0917 000 0000' })}
                  {h.text('pager', 'Pager', beside)}
                  {h.text('homePhone', 'Home phone', beside)}
                  {h.text('fax', 'Fax', beside)}
                  {h.text('email', 'E-mail', { ...beside, error: errors.email, placeholder: 'name@company.ph' })}
                </FieldStack>
              </Section>
            </aside>

            <div className="flex min-w-0 flex-col gap-2 lg:col-span-9 lg:min-h-0 lg:overflow-y-auto">
              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as TabId)}
                items={TABS.map((t) => ({
                  value: t.value,
                  label: t.label,
                  badge: problems.some((p) => p.tab === t.value) ? '!' : undefined,
                }))}
              />
              {tab === 'address' ? (
                <AddressTab draft={draft} update={update} errors={errors} />
              ) : tab === 'membership' ? (
                <MembershipTab draft={draft} update={update} errors={errors} />
              ) : tab === 'administration' ? (
                <AdministrationTab
                  draft={draft}
                  update={update}
                  errors={errors}
                  employees={employeeOptions('', draft.id)}
                  employeeNameOf={nameOf}
                />
              ) : tab === 'personal' ? (
                <PersonalTab draft={draft} update={update} errors={errors} />
              ) : tab === 'finance' ? (
                <FinanceTab draft={draft} update={update} errors={errors} />
              ) : (
                <Section icon="notes" title="Remarks">
                  {h.area('remarks', 'Remarks', { rows: 8, placeholder: 'General comments and HR notes' })}
                </Section>
              )}
            </div>
          </div>
        </Panel.Body>
      </Panel>
    </Form>
  );
}
