import { useState } from 'react';
import { Alert, Card, Icon, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, ReadOnly, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import { BIR_FORM_CATEGORIES, EFPS_FILING_GROUPS, EFPS_FILING_NOTE, type BirForm } from '../../../mocks/birForms';
import { birForms } from '../../../services/masterData';
import { blockedDeactivation, describeTaxUsage, loadTaxUsage } from '../../../services/taxUsage';
import { useAsync } from '../../../services/useAsync';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

const due = (text: string) => (text ? <span className="whitespace-pre-line">{text}</span> : <span className="text-muted">—</span>);

/** BIR forms and returns: what tax codes (BIR return) and withholding taxes (BIR forms) are filed on. */
export function BirFormsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(birForms);
  const usage = useAsync(loadTaxUsage, [rows]);
  const usedBy = (x: BirForm) => usage?.forms.get(x.id);
  const [notice, setNotice] = useState<string>();
  // Forms a tax code or withholding tax files on can't be deactivated.
  const setActiveChecked = async (picked: BirForm[], active: boolean) => {
    const { allowed, notice: n } = blockedDeactivation(picked, active, usedBy, (x) => x.form);
    await setActive(allowed, active);
    setNotice(n);
  };
  return (
    <MasterList<BirForm>
      {...route}
      icon="description"
      title="BIR forms"
      noun="BIR form"
      description="Every BIR form and return in BIR's own categories, with its due dates (eFPS and manual/eBIRForms) as of 2026. Tax codes pick their BIR return here, and withholding taxes their forms; added documents record the return on each line. Each form names where its due date was checked — confirm on bir.gov.ph before relying on one."
      intro={
        <>
        {notice ? <Alert intent="warning" variant="outline" title="Some forms are in use">{notice}</Alert> : null}
        <Card>
          <Card.Header icon={<Icon size={24}>event</Icon>}>Schedule of staggered filing — filing via eFPS</Card.Header>
          <Card.Content>
            <ul className="list-disc pl-5 text-sm">
              {EFPS_FILING_GROUPS.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            <Text variant="small" tone="muted">
              {EFPS_FILING_NOTE}
            </Text>
          </Card.Content>
        </Card>
        </>
      }
      rows={rows}
      onSetActive={setActiveChecked}
      columns={[
        { key: 'form', header: 'Form', cell: (x) => <span className="whitespace-nowrap font-semibold">{x.form}</span> },
        { key: 'description', header: 'Description', cell: (x) => <span className="line-clamp-2 max-w-md whitespace-normal">{x.description}</span> },
        { key: 'category', header: 'Category', cell: (x) => <span className="whitespace-normal">{x.category}</span> },
        { key: 'dueEfps', header: 'Due date · eFPS', cell: (x) => <span className="max-w-xs whitespace-normal">{due(x.dueEfps)}</span> },
        { key: 'dueManual', header: 'Due date · Manual/eBIRForms', cell: (x) => <span className="max-w-xs whitespace-normal">{due(x.dueManual)}</span> },
        {
          key: 'usedBy',
          header: 'Used by',
          sortable: false,
          cell: (x) => {
            const u = describeTaxUsage(usedBy(x));
            return u ? <span className="max-w-xs whitespace-normal text-sm">{u}</span> : <span className="text-muted">—</span>;
          },
        },
        {
          key: 'active',
          header: 'Status',
          cell: (x) => <TableStatus intent={x.active ? 'success' : 'default'}>{x.active ? 'Active' : 'Inactive'}</TableStatus>,
        },
      ]}
      sortValue={(x, key) => (key === 'form' ? `${BIR_FORM_CATEGORIES.indexOf(x.category)}-${x.form.toLowerCase()}` : String(x[key as keyof BirForm] ?? '').toLowerCase())}
      searchText={(x) => `${x.form} ${x.description} ${x.category} ${x.dueEfps} ${x.dueManual} ${x.note}`}
      blank={() => ({ id: newId('wf'), form: '', description: '', category: 'Payment/Remittance Forms', dueEfps: '', dueManual: '', note: '', source: '', active: true })}
      label={(x) => x.form}
      validate={(x, all) => {
        const e: Record<string, string> = {};
        if (!x.form.trim()) e.form = 'Form is required.';
        else if (all.some((o) => o.id !== x.id && o.form.toLowerCase() === x.form.trim().toLowerCase())) e.form = `${x.form} already exists.`;
        if (!x.description.trim()) e.description = 'Description is required.';
        if (!x.active && usage) {
          const u = describeTaxUsage(usedBy(x));
          if (u) e.active = `Still used by ${u}.`;
        }
        return e;
      }}
      onSave={(x) => save({ ...x, form: x.form.trim() })}
      editor={(x, update, errors, isNew) => {
        const f = bind(x, update);
        return (
          <>
            <FieldStack>
              {f.text('form', 'Form no.', { required: true, error: errors.form, placeholder: 'e.g. 2550Q' })}
              {f.pick('category', 'Category', BIR_FORM_CATEGORIES)}
              {f.text('description', 'Description', { required: true, error: errors.description,  })}
              {f.area('dueEfps', 'Due date · eFPS', { rows: 2 })}
              {f.area('dueManual', 'Due date · Manual/eBIRForms', { rows: 2 })}
              {f.area('note', 'Legal basis / notes', { rows: 2 })}
              {f.text('source', 'Source', { hint: 'Where the due date was checked.' })}
              {f.status('active', 'Status', { error: errors.active })}
              {isNew ? null : <ReadOnly label="Used by" value={describeTaxUsage(usedBy(x)) || 'Not used yet.'} />}
            </FieldStack>
          </>
        );
      }}
    />
  );
}
