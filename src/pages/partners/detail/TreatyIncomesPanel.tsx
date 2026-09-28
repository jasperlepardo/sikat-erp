import { useState } from 'react';
import { Button, Card, Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { RowMenu } from '../../../components/form/RowMenu';
import { newTreatyIncomeEntry, type TreatyIncomeEntry } from '../../../mocks/partners';
import { TREATY_INCOME_TYPES, TREATY_RATES, type TreatyIncomeType } from '../../../mocks/taxes';
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
  onDone,
  onCancel,
}: {
  entry: TreatyIncomeEntry;
  treatyCountry: string;
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
    <Card>
      <Card.Content>
        <Fields>
          {f.pick('incomeType', 'Income type', ['', ...TREATY_INCOME_TYPES], {
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
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" size="small" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="small" intent="primary" variant="solid" onClick={() => onDone(local)}>
            Done
          </Button>
        </div>
      </Card.Content>
    </Card>
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

  const startAdd = () => {
    setEditing({ entry: newTreatyIncomeEntry(), isNew: true });
  };
  const startEdit = (e: TreatyIncomeEntry) => {
    setEditing({ entry: { ...e, attachments: [...e.attachments] }, isNew: false });
  };
  const remove = (id: string) => onChange(incomes.filter((e) => e.id !== id));
  const apply = (e: TreatyIncomeEntry, isNew: boolean) => {
    onChange(isNew ? [...incomes, e] : incomes.map((x) => (x.id === e.id ? e : x)));
    setEditing(null);
  };

  return (
    <Section
      icon="gavel"
      title={`Treaty incomes${incomes.length ? ` · ${incomes.length}` : ''}`}
      actions={
        editing ? undefined : (
          <Link leadingIcon={<Icon size={20}>add</Icon>} onClick={startAdd}>
            Add
          </Link>
        )
      }
    >
      {incomes.length ? (
        <div className="flex flex-col gap-2">
          {incomes.map((e) =>
            editing && !editing.isNew && editing.entry.id === e.id ? (
              <EntryForm
                key={e.id}
                entry={editing.entry}
                treatyCountry={treatyCountry}
                onDone={(updated) => apply(updated, false)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <List.Group key={e.id}>
                <List.Card
                  icon={<Icon size={16}>{INCOME_ICONS[e.incomeType] ?? 'receipt_long'}</Icon>}
                  title={e.incomeType || '—'}
                  fields={[
                    { label: 'Approved rate', value: e.approvedRate ? `${e.approvedRate}%` : '—' },
                    { label: 'TTRA approved', value: e.ttraApprovalDate || '' },
                    { label: 'Attachments', value: e.attachments.length ? `${e.attachments.length} file${e.attachments.length !== 1 ? 's' : ''}` : '' },
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
              </List.Group>
            ),
          )}
        </div>
      ) : (
        <Text variant="small" tone="muted">No income types added yet.</Text>
      )}
      {editing?.isNew ? (
        <EntryForm
          entry={editing.entry}
          treatyCountry={treatyCountry}
          onDone={(e) => apply(e, true)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </Section>
  );
}
