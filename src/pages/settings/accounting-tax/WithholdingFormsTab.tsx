import { Card, Icon, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import { EFPS_FILING_GROUPS, EFPS_FILING_NOTE, FORM_SECTIONS, type WithholdingForm } from '../../../mocks/compensation';
import { withholdingForms } from '../../../services/masterData';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

const due = (text: string) => (text ? <span className="whitespace-pre-line">{text}</span> : <span className="text-muted">—</span>);

export function WithholdingFormsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(withholdingForms);
  return (
    <MasterList<WithholdingForm>
      {...route}
      icon="description"
      title="Withholding tax forms"
      noun="withholding tax form"
      description="BIR withholding tax forms and their due dates (mode of filing and payment), as published by BIR."
      intro={
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
      }
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'form', header: 'Form', cell: (x) => <span className="whitespace-nowrap font-semibold">{x.form}</span> },
        { key: 'description', header: 'Description', cell: (x) => <span className="line-clamp-2 max-w-md whitespace-normal">{x.description}</span> },
        { key: 'section', header: 'Type', cell: (x) => x.section },
        { key: 'dueEfps', header: 'Due date · eFPS', cell: (x) => <span className="max-w-xs whitespace-normal">{due(x.dueEfps)}</span> },
        { key: 'dueManual', header: 'Due date · Manual/eBIRForms', cell: (x) => <span className="max-w-xs whitespace-normal">{due(x.dueManual)}</span> },
        {
          key: 'active',
          header: 'Status',
          cell: (x) => <TableStatus intent={x.active ? 'success' : 'default'}>{x.active ? 'Active' : 'Inactive'}</TableStatus>,
        },
      ]}
      sortValue={(x, key) => (key === 'form' ? `${FORM_SECTIONS.indexOf(x.section)}-${x.form.toLowerCase()}` : String(x[key as keyof WithholdingForm] ?? '').toLowerCase())}
      searchText={(x) => `${x.form} ${x.description} ${x.section} ${x.dueEfps} ${x.dueManual}`}
      blank={() => ({ id: newId('wf'), form: 'BIR FORM NO. ', description: '', section: 'REMITTANCE FORM', dueEfps: '', dueManual: '', active: true })}
      label={(x) => x.form}
      validate={(x, all) => {
        const e: Record<string, string> = {};
        if (!x.form.trim()) e.form = 'Form is required.';
        else if (all.some((o) => o.id !== x.id && o.form.toLowerCase() === x.form.trim().toLowerCase())) e.form = `${x.form} already exists.`;
        if (!x.description.trim()) e.description = 'Description is required.';
        return e;
      }}
      onSave={(x) => save({ ...x, form: x.form.trim() })}
      editor={(x, update, errors) => {
        const f = bind(x, update);
        return (
          <>
            <FieldStack>
              {f.text('form', 'Form', { required: true, error: errors.form })}
              {f.pick('section', 'Type', FORM_SECTIONS)}
              {f.text('description', 'Description', { required: true, error: errors.description,  })}
              {f.area('dueEfps', 'Due date · eFPS', { rows: 2 })}
              {f.area('dueManual', 'Due date · Manual/eBIRForms', { rows: 2 })}
            </FieldStack>
            {f.check('active', 'Active')}
          </>
        );
      }}
    />
  );
}
