import { useEffect, useState } from 'react';
import { Button, Checkbox, Combobox, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind } from '../../../components/form/fields';
import type { PurchasingSettings } from '../../../mocks/purchaseOrders';
import { purchasingSettings } from '../../../services/purchaseOrders';
import type { ApprovalRule } from '../../../mocks/approvalRules';
import type { DocType } from '../../../mocks/approvalRules';
import { approvalRules } from '../../../services/approvalRules';
import { salesEmployees } from '../../../services/partnerMasters';
import type { NamedEntry } from '../../../mocks/partnerMasters';
import { cap } from '../../../components/form/noun';
import { AP_NOUN, APRI_NOUN, DPI_NOUN, DPR_NOUN, GR_NOUN, MEMO_NOUN, PAYMENT_NOUN, PO_NOUN, RETURN_NOUN, RFQ_NOUN } from '../../purchasing/paths';

const ROUNDING_METHODS = ['By Currency', 'No rounding'] as const;
const DUP_VENDOR_REF = ['Allow', 'Warn', 'Block'] as const;

const PURCHASING_APPROVAL_ROWS: { docType: DocType; label: string; field: keyof PurchasingSettings }[] = [
  { docType: 'RFQ', label: cap(RFQ_NOUN.one), field: 'requireRfqApproval' },
  { docType: 'PO', label: cap(PO_NOUN.one), field: 'requirePoApproval' },
  { docType: 'GRPO', label: cap(GR_NOUN.one), field: 'requireGrpoApproval' },
  { docType: 'APINV', label: cap(AP_NOUN.one), field: 'requireApInvoiceApproval' },
  { docType: 'GRET', label: cap(RETURN_NOUN.one), field: 'requireGoodsReturnApproval' },
  { docType: 'CM', label: cap(MEMO_NOUN.one), field: 'requireApCreditMemoApproval' },
  { docType: 'DPR', label: cap(DPR_NOUN.one), field: 'requireDprApproval' },
  { docType: 'PMT', label: cap(PAYMENT_NOUN.one), field: 'requireOutgoingPaymentApproval' },
  { docType: 'APRI', label: cap(APRI_NOUN.one), field: 'requireApReserveInvoiceApproval' },
  { docType: 'DPI', label: cap(DPI_NOUN.one), field: 'requireDpiApproval' },
];

export function PurchasingSettingsTab() {
  const [settings, setSettings] = useState<PurchasingSettings>();
  const [saved, setSaved] = useState<PurchasingSettings>();
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [employees, setEmployees] = useState<NamedEntry[]>([]);

  useEffect(() => {
    Promise.all([purchasingSettings.list(), approvalRules.list(), salesEmployees.list()]).then(([[s], ruleList, empList]) => {
      setSettings(s);
      setSaved(s);
      setRules(ruleList);
      setEmployees(empList.filter((e) => e.active));
    });
  }, []);

  if (!settings) return <Text tone="muted" className="p-4">Loading…</Text>;

  const f = bind(settings, (p) => setSettings({ ...settings, ...p }));
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  const ruleFor = (docType: DocType) => rules.find((r) => r.id === docType)?.approverId ?? '';
  const setApprover = async (docType: DocType, approverId: string) => {
    const updated = await approvalRules.save({ id: docType, approverId });
    setRules((prev) => prev.some((r) => r.id === docType)
      ? prev.map((r) => r.id === docType ? updated : r)
      : [...prev, updated]);
  };

  const empOptions = [{ value: '', label: '— Unassigned —' }, ...employees.map((e) => ({ value: e.id, label: e.name }))];

  return (
    <div className="grid grid-cols-12 gap-2">
      <div className="col-span-8 col-start-3 flex flex-col gap-2">
        <Section
          icon="tune"
          title="Purchasing settings"
          actions={
            <Button type="button" size="small" intent="primary" variant="solid" disabled={!dirty}
              onClick={async () => {
                const next = await purchasingSettings.save(settings);
                setSettings(next);
                setSaved(next);
              }}
            >
              Save
            </Button>
          }
        >
          <FieldStack>
            {f.pick('duplicateVendorRef', 'Duplicate vendor reference', [...DUP_VENDOR_REF], {
              hint: 'What to do when another open PO from the same vendor already has the same Vendor Ref. No.',
            })}
            {f.pick('roundingMethod', 'Rounding method', [...ROUNDING_METHODS], {
              hint: '"By Currency" shows a rounding row in the PO footer using the document currency\'s rounding rule.',
            })}
            {f.check('separateNetGrossPriceMode', 'Show separate Net / Gross price modes')}
            {f.check('manageFreightInDocuments', 'Manage freight on documents')}
            {f.check('multiLanguageSupport', 'Multi-language support')}
            {f.check('useBpCatalogNumbers', 'Use vendor catalog numbers on lines')}
          </FieldStack>
        </Section>

        <Section icon="verified" title="Approval workflow">
          <div className="overflow-hidden rounded border" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-subtle)' }}>
                  <th className="py-2 px-3 text-left font-medium">Document</th>
                  <th className="py-2 px-3 text-center font-medium w-40">Require approval</th>
                  <th className="py-2 px-3 text-left font-medium w-52">Approver</th>
                </tr>
              </thead>
              <tbody>
                {PURCHASING_APPROVAL_ROWS.map(({ docType, label, field }, i) => (
                  <tr key={docType} style={{ borderTopColor: 'var(--color-border-subtle)', borderTopWidth: i > 0 ? 1 : 0 }}>
                    <td className="py-2 px-3">{label}</td>
                    <td className="py-2 px-3 text-center">
                      <Checkbox
                        checked={Boolean(settings[field])}
                        onChange={(e) => setSettings({ ...settings, [field]: e.currentTarget.checked })}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <Combobox
                        aria-label={`Approver for ${label}`}
                        options={empOptions}
                        value={ruleFor(docType)}
                        onValueChange={(v) => setApprover(docType, v ?? '')}
                        placeholder="Unassigned"
                        className="w-full"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Text variant="small" tone="muted" className="mt-1">
            When approval is required, new documents show Submit for approval and go to the approver. The approver creates them directly.
          </Text>
          <div className="flex justify-end mt-2">
            <Button type="button" size="small" intent="primary" variant="solid" disabled={!dirty}
              onClick={async () => {
                const next = await purchasingSettings.save(settings);
                setSettings(next);
                setSaved(next);
              }}
            >
              Save
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
