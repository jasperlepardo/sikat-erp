import { useState } from 'react';
import { Badge, Button, Card, Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { RowMenu } from '../../../components/form/RowMenu';
import { EXEMPTION_BASES, newVatExemptionEntry, type VatExemptionEntry } from '../../../mocks/taxes';
import { Fields, Section, bind } from './fields';

function exemptionConfig(businessType: string) {
  if (businessType === 'Individual') {
    return {
      types: ['Exempt entity'] as VatExemptionEntry['type'][],
      bases: EXEMPTION_BASES.filter((b) => b === 'RA 9994 / RA 10754 — Senior citizen / PWD' || b === 'Sec. 109 NIRC — BIR tax exemption ruling'),
    };
  }
  if (businessType === 'Cooperative') {
    return {
      types: ['Exempt entity'] as VatExemptionEntry['type'][],
      bases: EXEMPTION_BASES.filter((b) => b === 'RA 9520 — Cooperative Code'),
    };
  }
  return {
    types: ['Zero-rated', 'Exempt entity'] as VatExemptionEntry['type'][],
    bases: EXEMPTION_BASES.filter((b) => b !== 'RA 9520 — Cooperative Code' && b !== 'RA 9994 / RA 10754 — Senior citizen / PWD'),
  };
}

function EntryForm({
  entry,
  businessType,
  locked,
  onDone,
  onCancel,
}: {
  entry: VatExemptionEntry;
  businessType: string;
  locked: boolean;
  onDone: (e: VatExemptionEntry) => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState(entry);
  const update = (patch: Partial<VatExemptionEntry>) => setLocal((prev) => ({ ...prev, ...patch }));
  const f = bind(local, update);
  const { types, bases } = exemptionConfig(businessType);

  return (
    <Card>
      <Card.Content>
        <Fields>
          {types.length > 1
            ? f.choose('type', 'Exemption type', types.map((t) => ({ value: t, label: t })), { disabled: locked })
            : null}
          {f.text('certificateRef', 'Certificate / registration no.', {
            placeholder: local.type === 'Zero-rated' ? 'e.g. PEZA-REE-2024-0183' : 'e.g. BIR ruling no.',
          })}
          {local.type === 'Exempt entity'
            ? f.pick('basis', 'Legal basis', ['', ...bases], {
                hint: 'Legal ground for the VAT exemption.',
                disabled: locked,
              })
            : null}
          {f.date('validUntil', 'Valid until', {
            hint: 'Leave blank if the exemption has no expiry.',
          })}
        </Fields>
        <AttachmentsCard
          attachments={local.attachments}
          onChange={(attachments) => update({ attachments })}
          emptyHint="Attach the certificate or BIR ruling. The exemption applies in tax determination only once a document is uploaded."
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

export function VatExemptionsPanel({
  exemptions,
  businessType,
  onChange,
}: {
  exemptions: VatExemptionEntry[];
  businessType: string;
  onChange: (exemptions: VatExemptionEntry[]) => void;
}) {
  const [editing, setEditing] = useState<{ entry: VatExemptionEntry; isNew: boolean } | null>(null);

  const isCooperative = businessType === 'Cooperative';
  const { types } = exemptionConfig(businessType);

  const startAdd = () => {
    const entry = newVatExemptionEntry();
    entry.type = types[0];
    if (isCooperative) entry.basis = 'RA 9520 — Cooperative Code';
    setEditing({ entry, isNew: true });
  };

  const startEdit = (e: VatExemptionEntry) =>
    setEditing({ entry: { ...e, attachments: [...e.attachments] }, isNew: false });

  const remove = (id: string) => onChange(exemptions.filter((e) => e.id !== id));

  const apply = (e: VatExemptionEntry, isNew: boolean) => {
    onChange(isNew ? [...exemptions, e] : exemptions.map((x) => (x.id === e.id ? e : x)));
    setEditing(null);
  };

  const isActive = (e: VatExemptionEntry, today = new Date().toISOString().slice(0, 10)) =>
    e.attachments.length > 0 && (!e.validUntil || e.validUntil >= today);

  return (
    <Section
      icon="verified"
      title={`VAT exemptions${exemptions.length ? ` · ${exemptions.length}` : ''}`}
      actions={
        editing ? undefined : (
          <Link leadingIcon={<Icon size={20}>add</Icon>} onClick={startAdd}>
            Add
          </Link>
        )
      }
    >
      {exemptions.length ? (
        <div className="flex flex-col gap-2">
          {exemptions.map((e) =>
            editing && !editing.isNew && editing.entry.id === e.id ? (
              <EntryForm
                key={e.id}
                entry={editing.entry}
                businessType={businessType}
                locked={isCooperative}
                onDone={(updated) => apply(updated, false)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <List.Group key={e.id}>
                <List.Card
                  icon={<Icon size={16}>{e.type === 'Zero-rated' ? 'receipt_long' : 'gavel'}</Icon>}
                  title={e.type}
                  fields={[
                    ...(e.basis ? [{ label: 'Basis', value: e.basis }] : []),
                    ...(e.certificateRef ? [{ label: 'Certificate', value: e.certificateRef }] : []),
                    ...(e.validUntil ? [{ label: 'Valid until', value: e.validUntil }] : []),
                    { label: 'Documents', value: e.attachments.length ? `${e.attachments.length} file${e.attachments.length !== 1 ? 's' : ''}` : 'None — exemption inactive' },
                  ].filter((f) => f.value)}
                  badge={
                    <Badge intent={isActive(e) ? 'success' : 'warning'} variant="outline">
                      {isActive(e) ? 'Active' : e.attachments.length === 0 ? 'No document' : 'Expired'}
                    </Badge>
                  }
                  actions={
                    <RowMenu
                      label={`Actions for ${e.type} exemption`}
                      items={[
                        { label: 'Edit', icon: 'edit', onSelect: () => startEdit(e) },
                        ...(!isCooperative ? [{ label: 'Remove', icon: 'delete', onSelect: () => remove(e.id) }] : []),
                      ]}
                    />
                  }
                />
              </List.Group>
            ),
          )}
        </div>
      ) : (
        <Text variant="small" tone="muted">
          {businessType === 'Individual'
            ? 'Add an exemption if this customer presents a senior citizen / PWD card or BIR exemption ruling.'
            : isCooperative
              ? 'Add the CDA Certificate of Registration to activate the RA 9520 exemption.'
              : 'Add an exemption if this customer presents a PEZA / BOI zero-rating certificate or a BIR tax exemption ruling.'}
        </Text>
      )}
      {editing?.isNew ? (
        <EntryForm
          entry={editing.entry}
          businessType={businessType}
          locked={isCooperative}
          onDone={(e) => apply(e, true)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </Section>
  );
}
