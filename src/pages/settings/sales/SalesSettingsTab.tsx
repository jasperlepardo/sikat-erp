import { useEffect, useState } from 'react';
import { Button, Checkbox, Combobox, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../components/form/fields';
import { type SalesSettings } from '../../../mocks/salesOrders';
import { salesSettings } from '../../../services/salesOrders';
import type { ApprovalRule, DocType } from '../../../mocks/approvalRules';
import { approvalRules } from '../../../services/approvalRules';
import { salesEmployees } from '../../../services/partnerMasters';
import type { NamedEntry } from '../../../mocks/partnerMasters';

const SALES_APPROVAL_ROWS: { docType: DocType; label: string; field: keyof SalesSettings }[] = [
  { docType: 'QT', label: 'Sales Quotation', field: 'requireQuotationApproval' },
  { docType: 'SO', label: 'Sales Order', field: 'requireSoApproval' },
  { docType: 'DN', label: 'Delivery', field: 'requireDeliveryApproval' },
  { docType: 'ARINV', label: 'A/R Invoice', field: 'requireArInvoiceApproval' },
  { docType: 'SR', label: 'Sales Return', field: 'requireSalesReturnApproval' },
  { docType: 'ARCM', label: 'A/R Credit Memo', field: 'requireArCreditMemoApproval' },
  { docType: 'RC', label: 'Incoming Payment', field: 'requireIncomingPaymentApproval' },
];

export function SalesSettingsTab() {
  const [settings, setSettings] = useState<SalesSettings>();
  const [saved, setSaved] = useState<SalesSettings>();
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [employees, setEmployees] = useState<NamedEntry[]>([]);

  useEffect(() => {
    Promise.all([salesSettings.list(), approvalRules.list(), salesEmployees.list()]).then(([[s], ruleList, empList]) => {
      setSettings(s);
      setSaved(s);
      setRules(ruleList);
      setEmployees(empList.filter((e) => e.active));
    });
  }, []);

  if (!settings) return <Text tone="muted" className="p-4">Loading…</Text>;

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
                {SALES_APPROVAL_ROWS.map(({ docType, label, field }, i) => (
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
            When approval is required, clicking Add saves a draft. Use the status field to submit for approval.
          </Text>
          <div className="flex justify-end mt-2">
            <Button type="button" size="small" intent="primary" variant="solid" disabled={!dirty}
              onClick={async () => {
                const next = await salesSettings.save(settings);
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
