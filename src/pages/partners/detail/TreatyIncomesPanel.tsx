import { useState } from 'react';
import { Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { RowMenu } from '../../../components/form/RowMenu';
import { newTreatyIncomeEntry, type TreatyIncomeEntry } from '../../../mocks/partners';
import { TREATY_INCOME_TYPES, TREATY_RATES, type TreatyIncomeType } from '../../../mocks/taxes';
import { EditPanel } from './EditPanel';
import { Fields, Section, bind } from './fields';

const INCOME_ICONS: Record<string, string> = {
  Dividends: 'payments',
  Interest: 'percent',
  Royalties: 'copyright',
  'Technical fees': 'engineering',
};

function EntryForm({
  entry,
  treatyCountry,
  isNew,
  onDone,
  onCancel,
}: {
  entry: TreatyIncomeEntry;
  treatyCountry: string;
  isNew: boolean;
  onDone: (e: TreatyIncomeEntry) => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState(entry);

  const update = (patch: Partial<TreatyIncomeEntry>) => {
    setLocal((prev) => {
      const next = { ...prev, ...patch };
      if (patch.incomeType !== undefined && treatyCountry) {
        const rate = TREATY_RATES[treatyCountry]?.[patch.incomeType as TreatyIncomeType];
        if (rate !== undefined) next.approvedRate = rate;
      }
      return next;
    });
  };

  const f = bind(local, update);

  return (
    <EditPanel
      icon={INCOME_ICONS[local.incomeType] ?? 'receipt_long'}
      title={isNew ? 'New treaty income' : (local.incomeType || 'Treaty income')}
      onCancel={onCancel}
      onDone={() => onDone(local)}
    >
      <Section icon="gavel" title="Treaty income details">
        <Fields>
          {f.pick('incomeType', 'Income type', [...TREATY_INCOME_TYPES], {
            clearable: true,
            placeholder: 'Select an income type',
            hint: 'Type of income being paid to this vendor.',
          })}
          {f.num('approvedRate', 'Approved rate', {
            suffix: '%',
            hint: 'Auto-filled from treaty table. Override if BIR approved a different rate.',
          })}
          {f.date('ttraApprovalDate', 'TTRA approval date', {
            hint: 'Date BIR approved BIR Form 0901 for this income type.',
          })}
        </Fields>
        <AttachmentsCard
          attachments={local.attachments}
          onChange={(attachments) => update({ attachments })}
          emptyHint="Add the TTRA approval letter, Certificate of Residence, and supporting documents."
          withDescription
        />
      </Section>
    </EditPanel>
  );
}

export function TreatyIncomesPanel({
  incomes,
  treatyCountry,
  onChange,
}: {
  incomes: TreatyIncomeEntry[];
  treatyCountry: string;
  onChange: (incomes: TreatyIncomeEntry[]) => void;
}) {
  const [editing, setEditing] = useState<{ entry: TreatyIncomeEntry; isNew: boolean } | null>(null);

  const startAdd = () => setEditing({ entry: newTreatyIncomeEntry(), isNew: true });
  const startEdit = (e: TreatyIncomeEntry) => setEditing({ entry: { ...e, attachments: [...e.attachments] }, isNew: false });
  const remove = (id: string) => onChange(incomes.filter((e) => e.id !== id));
  const apply = (e: TreatyIncomeEntry, isNew: boolean) => {
    onChange(isNew ? [...incomes, e] : incomes.map((x) => (x.id === e.id ? e : x)));
    setEditing(null);
  };

  return (
    <>
      <Section
        icon="gavel"
        title={`Treaty incomes${incomes.length ? ` (${incomes.length})` : ''}`}
        actions={
          !editing ? (
            <Link leadingIcon={<Icon size={20}>add</Icon>} onClick={startAdd}>
              Add
            </Link>
          ) : undefined
        }
      >
        {incomes.length ? (
          <List.Group>
            {incomes.map((e) => (
              <List.Card
                key={e.id}
                icon={<Icon size={16}>{INCOME_ICONS[e.incomeType] ?? 'receipt_long'}</Icon>}
                title={e.incomeType || '—'}
                fields={[
                  { label: 'Approved rate', value: e.approvedRate ? `${e.approvedRate}%` : '—' },
                  { label: 'TTRA approved', value: e.ttraApprovalDate || '' },
                  { label: 'Documents', value: e.attachments.length ? `${e.attachments.length} file${e.attachments.length !== 1 ? 's' : ''}` : '' },
                ].filter((f) => f.value)}
                actions={
                  <RowMenu
                    label={`Actions for ${e.incomeType || 'entry'}`}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => startEdit(e) },
                      { label: 'Remove', icon: 'delete', onSelect: () => remove(e.id) },
                    ]}
                  />
                }
              />
            ))}
          </List.Group>
        ) : (
          <Text variant="small" tone="muted">No income types added yet.</Text>
        )}
      </Section>

      {editing ? (
        <EntryForm
          entry={editing.entry}
          treatyCountry={treatyCountry}
          isNew={editing.isNew}
          onDone={(e) => apply(e, editing.isNew)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
