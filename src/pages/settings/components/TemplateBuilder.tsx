import { useRef } from 'react';
import { Button, Text, Textarea } from '@jasperlepardo/sikat-design-system';
import type { PatternVariable } from '../../../mocks/journalPatterns';

const SAMPLE: Record<string, string> = {
  docType: 'Purchase Invoice',
  docNo: 'PI-2026-00015',
  postingDate: '2026-10-12',
  documentDate: '2026-10-12',
  series: 'Default',
  entityCode: 'BP-001',
  entityName: 'ABC Supplies',
  currency: 'PHP',
  projectCode: 'PROJ-001',
  salesEmployee: 'Juan dela Cruz',
  contactName: 'Maria Santos',
  fromWarehouse: 'WH-001',
  toWarehouse: 'WH-CGK',
  reference: 'REF-001',
  paymentMethod: 'BANK',
  accountCode: '1130',
  remarks: 'Purchase of office chairs',
};

interface Props {
  template: string;
  variables: PatternVariable[];
  docTypeLabel?: string;
  sampleOverrides?: Partial<Record<string, string>>;
  onChange: (template: string) => void;
}

export function TemplateBuilder({ template, variables, docTypeLabel, sampleOverrides, onChange }: Props) {
  const sample: Record<string, string> = {
    ...SAMPLE,
    ...(docTypeLabel ? { docType: docTypeLabel } : {}),
    ...sampleOverrides,
  };
  const wrapperRef = useRef<HTMLDivElement>(null);

  const insertVariable = (key: string) => {
    const token = `{${key}}`;
    const el = wrapperRef.current?.querySelector('textarea') ?? null;
    const pos = el ? el.selectionStart : template.length;
    const next = template.slice(0, pos) + token + template.slice(pos);
    onChange(next);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(pos + token.length, pos + token.length);
      }
    });
  };

  const preview = template
    .replace(/\{(\w+)\}/g, (_, key) => sample[key] ?? `{${key}}`)
    .split(/\s+[–\-]\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' – ');

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapperRef}>
        <Textarea
          aria-label="Journal remark template"
          rows={2}
          value={template}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Text variant="small" tone="muted" className="shrink-0">Insert:</Text>
        {variables.map((v) => (
          <Button
            key={v.key}
            type="button"
            size="small"
            intent="white"
            variant="solid"
            title={v.description}
            onClick={() => insertVariable(v.key)}
          >
            {v.label}
          </Button>
        ))}
      </div>
      {template && (
        <Text variant="small" tone="muted">
          Preview: <strong>{preview}</strong>
        </Text>
      )}
    </div>
  );
}
