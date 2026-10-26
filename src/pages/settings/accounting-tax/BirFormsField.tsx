import { MultiSelect } from '@jasperlepardo/sikat-design-system';
import { CtxFormField } from '../../../components/form/fields';
import { useCollection } from '../../../components/form/MasterLookup';
import { birFormNo, type BirForm, type BirFormCategory } from '../../../mocks/birForms';
import { birForms } from '../../../services/masterData';

/** "2550Q · 1600-VT" for a list of BIR form ids; ids no longer in Settings are left out. */
export const formNumbers = (ids: readonly string[], forms: readonly BirForm[]) =>
  ids.map((id) => forms.find((f) => f.id === id)).filter((f): f is BirForm => Boolean(f)).map(birFormNo).join(' · ');

/**
 * Pick one or more BIR forms (Settings › Accounting & Tax › BIR forms), stored as ids. Only active
 * forms of the given categories are offered, plus any already picked so a stale one stays visible.
 */
export function BirFormsField({
  label,
  value,
  onChange,
  categories,
  error,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (ids: string[]) => void;
  categories: BirFormCategory[];
  error?: string;
  hint?: string;
}) {
  const forms = useCollection(birForms) ?? [];
  const options = forms
    .filter((f) => value.includes(f.id) || (f.active && categories.includes(f.category)))
    .map((f) => ({ value: f.id, label: `${birFormNo(f)} · ${f.description}${f.active ? '' : ' (inactive)'}` }));
  return (
    <CtxFormField label={label} error={error} hint={hint}>
      {(p) => <MultiSelect {...p} options={options} value={value} placeholder="None" onValueChange={onChange} />}
    </CtxFormField>
  );
}
