import { useState } from 'react';
import { Alert, TableStatus } from '@jasperlepardo/sikat-design-system';
import { FieldStack, ReadOnly, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import type { AtcRecord } from '../../../mocks/taxes';
import type { Collection } from '../../../services/store';
import { blockedDeactivation, describeTaxUsage, loadTaxUsage } from '../../../services/taxUsage';
import { useAsync } from '../../../services/useAsync';
import { useCollectionRows } from '../../../services/useCollectionRows';

// The id is set from the code on save: the code is the key tax codes store.
const blank = (): AtcRecord => ({ id: '', code: '', category: '', coverage: '', description: '', rate: 0, note: '', active: true });

/**
 * A BIR ATC catalog as master data: the list a tax code's ATC is picked from. Shared by the
 * Value-added tax and Percentage tax tabs.
 */
export function AtcCatalogTab({
  route,
  collection,
  icon,
  title,
  noun,
  description,
  placeholder,
}: {
  route: ListRoute;
  collection: Collection<AtcRecord>;
  icon: string;
  title: string;
  noun: string;
  description: string;
  placeholder: string;
}) {
  const { rows, save, setActive } = useCollectionRows(collection);
  const usage = useAsync(loadTaxUsage, [rows]);
  const usedBy = (a: AtcRecord) => usage?.atcs.get(a.code);
  const [notice, setNotice] = useState<string>();

  // ATCs a tax code, withholding group or tax rule uses can't be deactivated.
  const setActiveChecked = async (picked: AtcRecord[], active: boolean) => {
    const { allowed, notice: n } = blockedDeactivation(picked, active, usedBy, (a) => a.code);
    await setActive(allowed, active);
    setNotice(n);
  };

  return (
    <MasterList<AtcRecord>
      {...route}
      icon={icon}
      title={title}
      noun={noun}
      description={description}
      intro={notice ? <Alert intent="warning" variant="outline" title="Some ATCs are in use">{notice}</Alert> : undefined}
      rows={rows}
      onSetActive={setActiveChecked}
      columns={[
        { key: 'code', header: 'Code', cell: (a) => <span className="whitespace-nowrap font-semibold">{a.code}</span> },
        { key: 'category', header: 'Category', cell: (a) => <span className="max-w-xs whitespace-normal">{a.category}</span> },
        { key: 'coverage', header: 'Coverage', cell: (a) => (a.coverage ? <span className="whitespace-normal">{a.coverage}</span> : <span className="text-muted">—</span>) },
        { key: 'description', header: 'Description', cell: (a) => <span className="max-w-md whitespace-normal">{a.description}</span> },
        { key: 'rate', header: 'BIR rate', align: 'end', cell: (a) => `${a.rate}%` },
        {
          key: 'usedBy',
          header: 'Used by',
          sortable: false,
          cell: (a) => {
            const u = describeTaxUsage(usedBy(a));
            return u ? <span className="max-w-xs whitespace-normal text-sm">{u}</span> : <span className="text-muted">—</span>;
          },
        },
        {
          key: 'active',
          header: 'Status',
          cell: (a) => <TableStatus intent={a.active ? 'success' : 'default'}>{a.active ? 'Active' : 'Inactive'}</TableStatus>,
        },
      ]}
      searchText={(a) => `${a.code} ${a.category} ${a.coverage} ${a.description}`}
      blank={blank}
      label={(a) => a.code}
      validate={(a, all) => {
        const e: Record<string, string> = {};
        const code = a.code.trim().toUpperCase();
        if (!code) e.code = 'Code is required.';
        else if (all.some((x) => x.id !== a.id && x.code.toUpperCase() === code)) e.code = `${code} already exists.`;
        if (!a.description.trim()) e.description = 'Description is required.';
        if (a.rate < 0) e.rate = "Rate can't be negative.";
        if (!a.active && a.id && usage) {
          const u = describeTaxUsage(usedBy(a));
          if (u) e.active = `Still used by ${u}.`;
        }
        return e;
      }}
      onSave={(a) => save({ ...a, id: a.id || a.code.trim().toUpperCase(), code: a.code.trim().toUpperCase() })}
      editor={(a, update, errors, isNew) => {
        const f = bind(a, update);
        return (
          <FieldStack>
            {f.text('code', 'ATC', {
              required: true,
              error: errors.code,
              placeholder,
              disabled: !isNew,
              hint: !isNew ? "Can't change once saved — tax codes store it." : undefined,
            })}
            {f.text('category', 'Category', { hint: 'Nature of sale, industry or NIRC section, as BIR groups it.' })}
            {f.text('coverage', 'Coverage')}
            {f.area('description', 'Description', { rows: 2, required: true, error: errors.description })}
            {f.num('rate', 'BIR rate', { suffix: '%', error: errors.rate, hint: "BIR's published rate, for reference. A document charges its tax code's rate (Tax codes tab)." })}
            {f.area('note', 'Notes', { rows: 2 })}
            {isNew ? null : <ReadOnly label="Used by" value={describeTaxUsage(usedBy(a)) || 'Not used yet.'} />}
            {errors.active ? <ReadOnly label="Status" value={errors.active} /> : null}
          </FieldStack>
        );
      }}
    />
  );
}
