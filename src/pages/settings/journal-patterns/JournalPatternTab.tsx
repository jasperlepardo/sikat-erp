import { Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind } from '../../../components/form/fields';
import { MasterList, statusColumn, uniqueRequired, type ListRoute } from '../../../components/form/MasterList';
import type { JournalPattern, PatternVariable } from '../../../mocks/journalPatterns';
import { useCollectionRows, newId } from '../../../services/useCollectionRows';
import type { Collection } from '../../../services/store';
import { TemplateBuilder } from '../components/TemplateBuilder';

const blank = (): JournalPattern => ({
  id: newId('jp'),
  name: '',
  template: '',
  isDefault: false,
  active: true,
});

interface Props {
  collection: Collection<JournalPattern>;
  variables: PatternVariable[];
  docTypeLabel: string;
  sampleOverrides?: Partial<Record<string, string>>;
}

export function JournalPatternTab({ collection, variables, docTypeLabel, sampleOverrides, ...route }: Props & ListRoute) {
  const { rows, setActive } = useCollectionRows(collection);

  const onSave = async (row: JournalPattern) => {
    if (row.isDefault) {
      const all = collection.snapshot();
      for (const other of all) {
        if (other.id !== row.id && other.isDefault) {
          await collection.save({ ...other, isDefault: false });
        }
      }
    }
    await collection.save(row);
  };

  return (
    <MasterList<JournalPattern>
      {...route}
      sidePanelEdit
      icon="edit_note"
      title="Journal remark patterns"
      noun="pattern"
      description="Configure how journal remarks are generated for new documents. Variables like {entityCode} are filled in when a document is created."
      rows={rows}
      onSetActive={setActive}
      defaultSort={{ key: 'name', direction: 'asc' }}
      columns={[
        { key: 'name', header: 'Name', cell: (p) => p.name },
        {
          key: 'template',
          header: 'Template',
          cell: (p) => <span className="font-mono text-sm">{p.template}</span>,
        },
        { key: 'isDefault', header: 'Default', cell: (p) => (p.isDefault ? 'Default' : '') },
        statusColumn<JournalPattern>(),
      ]}
      searchText={(p) => `${p.name} ${p.template}`}
      blank={blank}
      label={(p) => p.name}
      validate={(p, all) => {
        const e: Record<string, string> = {};
        uniqueRequired(e, p, all, 'name', 'Name');
        if (!p.template.trim()) e.template = 'Template is required.';
        return e;
      }}
      onSave={onSave}
      editor={(p, update, errors) => {
        const f = bind(p, update);
        return (
          <FieldStack>
            {f.text('name', 'Name', { required: true, error: errors.name })}
            <Section icon="edit_note" title="Template">
              <TemplateBuilder
                template={p.template}
                variables={variables}
                docTypeLabel={docTypeLabel}
                sampleOverrides={sampleOverrides}
                onChange={(template) => update({ template })}
              />
              {errors.template && (
                <Text variant="small" tone="danger">{errors.template}</Text>
              )}
            </Section>
            {f.check('isDefault', 'Default for new documents')}
            {f.status('active', 'Status')}
          </FieldStack>
        );
      }}
    />
  );
}
