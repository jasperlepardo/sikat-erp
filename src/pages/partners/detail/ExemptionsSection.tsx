import { useState } from 'react';
import { Badge, Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { RowMenu } from '../../../components/form/RowMenu';
import type { Attachment } from '../../../mocks/common';
import { EXEMPTION_BASES, newVatExemptionEntry, type VatExemptionEntry } from '../../../mocks/taxes';
import { EditPanel } from './EditPanel';
import { Fields, Section, bind } from './fields';

// ── Types ──────────────────────────────────────────────────────────────────

type PanelState =
  | { kind: 'exemption'; entry: VatExemptionEntry; isNew: boolean }
  | { kind: 'sworn-declaration' }
  | null;

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

function isExemptionActive(e: VatExemptionEntry, today = new Date().toISOString().slice(0, 10)) {
  return e.attachments.length > 0 && (!e.validUntil || e.validUntil >= today);
}

function exemptionBadge(e: VatExemptionEntry) {
  const active = isExemptionActive(e);
  const label = active ? 'Active' : e.attachments.length === 0 ? 'No document' : 'Expired';
  return <Badge intent={active ? 'success' : 'warning'} variant="outline">{label}</Badge>;
}

// ── VAT exemption panel form ───────────────────────────────────────────────

function ExemptionForm({
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
    <EditPanel
      icon="verified"
      title={local.type || 'VAT exemption'}
      onCancel={onCancel}
      onDone={() => onDone(local)}
    >
      <Section icon="verified" title="Exemption details">
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
          {f.date('validUntil', 'Valid until', { hint: 'Leave blank if the exemption has no expiry.' })}
        </Fields>
        <AttachmentsCard
          attachments={local.attachments}
          onChange={(attachments) => update({ attachments })}
          emptyHint="Attach the certificate or BIR ruling. The exemption applies in tax determination only once a document is uploaded."
          withDescription
        />
      </Section>
    </EditPanel>
  );
}

// ── Sworn declaration panel form ───────────────────────────────────────────

export interface SwornDeclarationState {
  swornDeclarationRef: string;
  swornDeclarationDate: string;
  swornDeclarationAttachments: Attachment[];
}

function SwornDeclarationForm({
  value,
  payee,
  onDone,
  onCancel,
}: {
  value: SwornDeclarationState;
  payee: 'Individual' | 'Corporate';
  onDone: (patch: SwornDeclarationState) => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState(value);
  const update = (patch: Partial<SwornDeclarationState>) => setLocal((prev) => ({ ...prev, ...patch }));
  const f = bind(local, update);
  return (
    <EditPanel
      icon="description"
      title="Sworn Declaration of Gross Income"
      onCancel={onCancel}
      onDone={() => onDone(local)}
    >
      <Section icon="description" title="Sworn declaration">
        <Fields>
          {f.text('swornDeclarationRef', 'Reference no.', {
            hint: 'BIR-acknowledged reference number on the sworn declaration.',
            placeholder: 'e.g. SD-2026-001',
          })}
          {f.date('swornDeclarationDate', 'Date submitted', {
            hint: 'Must be within the current calendar year; otherwise the higher withholding rate applies.',
          })}
        </Fields>
        <AttachmentsCard
          attachments={local.swornDeclarationAttachments}
          onChange={(swornDeclarationAttachments) => update({ swornDeclarationAttachments })}
          emptyHint="Attach the signed sworn declaration. Submitting this declaration means the vendor is confirming their gross income is below the withholding threshold — the lower rate applies once uploaded."
        />
        <Text variant="small" tone="muted">
          {payee === 'Individual'
            ? 'This declaration confirms gross income ≤ ₱3M — lower rate (e.g. WI010 5%) applies. Without it, or when VAT-registered, the higher rate applies.'
            : 'This declaration confirms gross income ≤ ₱720,000 — lower rate (e.g. WC010 10%) applies. Without it, the higher rate applies.'}
        </Text>
      </Section>
    </EditPanel>
  );
}

// ── ExemptionsSection ──────────────────────────────────────────────────────

export function ExemptionsSection({
  // Customer VAT exemptions
  showVatExemptions,
  exemptions,
  businessType,
  onExemptionsChange,
  // Vendor sworn declaration
  showSwornDeclaration,
  swornDeclaration,
  payee,
  onSwornDeclarationChange,
}: {
  showVatExemptions: boolean;
  exemptions: VatExemptionEntry[];
  businessType: string;
  onExemptionsChange: (exemptions: VatExemptionEntry[]) => void;
  showSwornDeclaration: boolean;
  swornDeclaration: SwornDeclarationState;
  payee: 'Individual' | 'Corporate';
  onSwornDeclarationChange: (patch: SwornDeclarationState) => void;
}) {
  const [panel, setPanel] = useState<PanelState>(null);

  if (!showVatExemptions && !showSwornDeclaration) return null;

  const { types } = exemptionConfig(businessType);
  const isCooperative = businessType === 'Cooperative';

  const openAdd = () => {
    const entry = newVatExemptionEntry();
    entry.type = types[0];
    if (isCooperative) entry.basis = 'RA 9520 — Cooperative Code';
    setPanel({ kind: 'exemption', entry, isNew: true });
  };

  const applyExemption = (e: VatExemptionEntry, isNew: boolean) => {
    onExemptionsChange(isNew ? [...exemptions, e] : exemptions.map((x) => (x.id === e.id ? e : x)));
    setPanel(null);
  };

  const removeExemption = (id: string) => onExemptionsChange(exemptions.filter((e) => e.id !== id));

  const swornActive = swornDeclaration.swornDeclarationAttachments.length > 0 &&
    (() => {
      const today = new Date().toISOString().slice(0, 10);
      const year = swornDeclaration.swornDeclarationDate?.slice(0, 4);
      return year === today.slice(0, 4);
    })();

  const totalCount = (showVatExemptions ? exemptions.length : 0) + (showSwornDeclaration ? 1 : 0);

  return (
    <>
      <Section
        icon="verified"
        title={`Exemptions${totalCount ? ` · ${totalCount}` : ''}`}
        actions={
          !panel ? (
            <div className="flex gap-3">
              {showSwornDeclaration && !swornDeclaration.swornDeclarationRef ? (
                <Link leadingIcon={<Icon size={20}>description</Icon>} onClick={() => setPanel({ kind: 'sworn-declaration' })}>
                  Record declaration
                </Link>
              ) : null}
              {showVatExemptions ? (
                <Link leadingIcon={<Icon size={20}>add</Icon>} onClick={openAdd}>
                  Add exemption
                </Link>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {showVatExemptions && exemptions.length === 0 ? (
          <Text variant="small" tone="muted">
            {businessType === 'Individual'
              ? 'Add an exemption if this customer presents a senior citizen / PWD card or BIR exemption ruling.'
              : isCooperative
                ? 'Add the CDA Certificate of Registration to activate the RA 9520 exemption.'
                : 'Add an exemption if this customer presents a PEZA / BOI zero-rating certificate or a BIR tax exemption ruling.'}
          </Text>
        ) : null}

        <List.Group>
          {showVatExemptions ? exemptions.map((e) => (
            <List.Card
              key={e.id}
              icon={<Icon size={16}>{e.type === 'Zero-rated' ? 'receipt_long' : 'gavel'}</Icon>}
              title={e.type}
              fields={[
                ...(e.basis ? [{ label: 'Basis', value: e.basis }] : []),
                ...(e.certificateRef ? [{ label: 'Certificate', value: e.certificateRef }] : []),
                ...(e.validUntil ? [{ label: 'Valid until', value: e.validUntil }] : []),
                { label: 'Documents', value: e.attachments.length ? `${e.attachments.length} file${e.attachments.length !== 1 ? 's' : ''}` : 'None — exemption inactive' },
              ].filter((f) => f.value)}
              badge={exemptionBadge(e)}
              actions={
                <RowMenu
                  label={`Actions for ${e.type} exemption`}
                  items={[
                    { label: 'Edit', icon: 'edit', onSelect: () => setPanel({ kind: 'exemption', entry: { ...e, attachments: [...e.attachments] }, isNew: false }) },
                    ...(!isCooperative ? [{ label: 'Remove', icon: 'delete', onSelect: () => removeExemption(e.id) }] : []),
                  ]}
                />
              }
            />
          )) : null}

          {showSwornDeclaration ? (
            <List.Card
              icon={<Icon size={16}>description</Icon>}
              title="Sworn Declaration of Gross Income"
              fields={
                !swornDeclaration.swornDeclarationRef
                  ? [{ label: 'Status', value: `Not yet submitted — the higher withholding rate applies until a declaration is on file.` }]
                  : [
                      { label: 'Reference', value: swornDeclaration.swornDeclarationRef },
                      ...(swornDeclaration.swornDeclarationDate ? [{ label: 'Submitted', value: swornDeclaration.swornDeclarationDate }] : []),
                      { label: 'Documents', value: swornDeclaration.swornDeclarationAttachments.length ? `${swornDeclaration.swornDeclarationAttachments.length} file${swornDeclaration.swornDeclarationAttachments.length !== 1 ? 's' : ''}` : 'None — higher rate applies' },
                    ]
              }
              badge={
                <Badge intent={swornActive ? 'success' : 'warning'} variant="outline">
                  {swornActive ? 'Active' : swornDeclaration.swornDeclarationAttachments.length === 0 ? 'No document' : 'Expired'}
                </Badge>
              }
              actions={
                swornDeclaration.swornDeclarationRef ? (
                  <RowMenu
                    label="Actions for sworn declaration"
                    items={[{ label: 'Update', icon: 'edit', onSelect: () => setPanel({ kind: 'sworn-declaration' }) }]}
                  />
                ) : null
              }
            />
          ) : null}
        </List.Group>
      </Section>

      {panel?.kind === 'exemption' ? (
        <ExemptionForm
          entry={panel.entry}
          businessType={businessType}
          locked={isCooperative}
          onDone={(e) => applyExemption(e, panel.isNew)}
          onCancel={() => setPanel(null)}
        />
      ) : null}

      {panel?.kind === 'sworn-declaration' ? (
        <SwornDeclarationForm
          value={swornDeclaration}
          payee={payee}
          onDone={(patch) => { onSwornDeclarationChange(patch); setPanel(null); }}
          onCancel={() => setPanel(null)}
        />
      ) : null}
    </>
  );
}
