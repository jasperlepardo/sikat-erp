import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, FormField, Icon, IconButton, Panel, PanelHeader, SidePanel, Text, Textarea } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind, type Errors } from '../form/fields';
import { formatFilter, parseFilter } from './aip160';
import { FilterRules } from './FilterBar';
import { newRule, type FilterField, type FilterGroup } from './engine';

/**
 * Side panel to name a filter preset and set its rules — for a new preset and for editing
 * one. Portaled with its own form, so Enter saves the preset, not the page behind it.
 */
export function PresetPanel<T>({
  title,
  fields,
  initial,
  takenNames,
  onCancel,
  onSave,
}: {
  title: string;
  fields: FilterField<T>[];
  initial: { name: string; filter: FilterGroup };
  /** Names already used in this list (excluding the preset being edited). */
  takenNames: string[];
  onCancel: () => void;
  onSave: (name: string, filter: FilterGroup) => Promise<unknown>;
}) {
  // Starting from an unfiltered view, open with one row to fill in.
  const [draft, setDraft] = useState(() =>
    initial.filter.rules.length ? initial : { ...initial, filter: { ...initial.filter, rules: [newRule(fields[0])] } },
  );
  const [errors, setErrors] = useState<Errors>({});
  // The rules as AIP-160 text. Typing here rebuilds the rules; while the text doesn't parse,
  // the rules keep their last good state and the field shows why.
  const [expression, setExpression] = useState<{ text: string; error?: string } | null>(null);
  const setFilter = (filter: FilterGroup) => {
    setExpression(null);
    setDraft((d) => ({ ...d, filter }));
  };
  const editExpression = (text: string) => {
    const parsed = parseFilter(text, fields);
    setExpression({ text, error: parsed.ok ? undefined : parsed.error });
    if (parsed.ok) setDraft((d) => ({ ...d, filter: parsed.filter }));
  };
  const [saving, setSaving] = useState(false);

  // Escape closes this panel only, not the page behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const name = draft.name.trim();
    const found: Errors = {};
    if (expression?.error) found.expression = 'Fix the filter expression, or clear it.';
    if (!name) found.name = 'Name the preset.';
    else if (takenNames.some((n) => n.toLocaleLowerCase() === name.toLocaleLowerCase()))
      found.name = 'Another preset already has this name.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await onSave(name, draft.filter);
    } finally {
      setSaving(false);
    }
  };

  const f = bind(draft, (patch) => setDraft((d) => ({ ...d, ...patch })));

  return createPortal(
    <SidePanel overlay onOverlayClick={onCancel} style={{ '--sikat-side-panel-width': '880px' } as CSSProperties}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={save} noValidate>
        <PanelHeader
          type="forms"
          icon="filter_list"
          title={title}
          actions={
            <>
              <IconButton intent="default" variant="link" label="Close" onClick={onCancel}>
                <Icon size={20}>close</Icon>
              </IconButton>
              <Button type="button" intent="default" variant="solid" size="large" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" intent="primary" variant="solid" size="large" disabled={saving}>
                {saving ? 'Saving…' : 'Save preset'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          {Object.keys(errors).length ? (
            <Text variant="small" tone="danger">
              Fix the highlighted fields to save it.
            </Text>
          ) : null}
          <Section icon="badge" title="Preset">
            <FieldStack>{f.text('name', 'Name', { required: true, error: errors.name, placeholder: 'e.g. High credit customers' })}</FieldStack>
          </Section>
          <Section icon="filter_list" title="Filters">
            <FilterRules fields={fields} value={draft.filter} onChange={setFilter} />
          </Section>
          <Section icon="code" title="Filter expression">
            <FormField
              label="AIP-160 filter"
              error={expression?.error}
              hint={
                expression?.error
                  ? undefined
                  : 'Same filters as text — edit either one. e.g. status = "Open" AND total >= 1000'
              }
            >
              {(p) => (
                <Textarea
                  {...p}
                  rows={3}
                  spellCheck={false}
                  className="font-mono"
                  value={expression?.text ?? formatFilter(draft.filter, fields)}
                  onChange={(e) => editExpression(e.currentTarget.value)}
                />
              )}
            </FormField>
          </Section>
        </Panel.Body>
      </form>
    </SidePanel>,
    document.body,
  );
}
