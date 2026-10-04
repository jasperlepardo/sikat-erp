import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Combobox, Icon, IconButton, Panel, PanelHeader, SidePanel, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import type { Collection } from '../../services/store';
import { MasterList, type ListRoute } from './MasterList';
import { Section, type Errors } from './fields';

export type MasterRow = { id: string; active: boolean };

/**
 * One master-data list (territories, payment terms…), defined once and used both by its
 * Settings tab (`MasterDefList`) and by the "+ Add" panel of every field that picks from it.
 */
export interface MasterDef<T extends MasterRow> {
  collection: Collection<T>;
  icon: string;
  title: string;
  /** Singular, lower case: "territory". */
  noun: string;
  description?: ReactNode;
  /** Where the list lives, for field hints: "Settings › Sales & CRM". */
  home: string;
  /** A fresh row, with the text typed into the field as its name. */
  blank: (name: string) => T;
  /** What a record stores when it picks this row (usually the name). */
  value: (row: T) => string;
  label: (row: T) => string;
  columns: TableColumn<T>[];
  searchText: (row: T) => string;
  editor: (row: T, update: (patch: Partial<T>) => void, errors: Errors, isNew: boolean) => ReactNode;
  validate: (row: T, all: T[]) => Errors;
  /** Tidy a row before it's saved (trim, upper-case codes…). */
  normalize?: (row: T) => T;
}

/** A collection's rows, reloaded whenever any screen saves to it. `undefined` while loading. */
export function useCollection<T extends { id: string }>(collection: Collection<T>) {
  const [rows, setRows] = useState<T[]>();
  useEffect(() => {
    let live = true;
    const load = () => collection.list().then((r) => live && setRows(r));
    load();
    const off = collection.subscribe(load);
    return () => {
      live = false;
      off();
    };
  }, [collection]);
  return rows;
}

/** A Settings tab for one list. */
export function MasterDefList<T extends MasterRow>({ def, ...route }: { def: MasterDef<T> } & ListRoute) {
  const rows = useCollection(def.collection);
  const save = async (row: T) => {
    await def.collection.save(def.normalize ? def.normalize(row) : row);
  };
  return (
    <MasterList<T>
      {...route}
      icon={def.icon}
      title={def.title}
      noun={def.noun}
      description={def.description}
      rows={rows}
      columns={def.columns}
      searchText={def.searchText}
      blank={() => def.blank('')}
      label={def.label}
      editor={def.editor}
      validate={def.validate}
      onSave={save}
      onSetActive={async (picked, active) => {
        for (const row of picked) await def.collection.save({ ...row, active });
      }}
    />
  );
}

/**
 * Side panel that adds one row to a list from a field. It sits in a portal with its own
 * form, so Enter saves the row instead of submitting the page behind it.
 */
export function QuickAddPanel<T extends MasterRow>({
  def,
  initial,
  onCancel,
  onSaved,
}: {
  def: MasterDef<T>;
  initial: T;
  onCancel: () => void;
  onSaved: (row: T) => void;
}) {
  const [row, setRow] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // Escape closes this panel only, not a panel it was opened from.
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
    const all = await def.collection.list();
    const found = def.validate(row, all);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      onSaved(await def.collection.save(def.normalize ? def.normalize(row) : row));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <SidePanel overlay onOverlayClick={onCancel} style={{ '--sikat-side-panel-width': '560px' } as CSSProperties}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={save} noValidate>
        <PanelHeader
          type="forms"
          icon={def.icon}
          title={`New ${def.noun}`}
          subcopy={`Adds to ${def.title} in ${def.home}.`}
          actions={
            <>
              <IconButton intent="default" variant="link" label="Close" onClick={onCancel}>
                <Icon size={20}>close</Icon>
              </IconButton>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Adding…' : 'Add'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          {Object.keys(errors).length ? (
            <Text variant="small" tone="danger">
              Fix the highlighted fields to add it.
            </Text>
          ) : null}
          <Section icon="add_circle" title="Details">
            {def.editor(row, (patch) => setRow((r) => ({ ...r, ...patch })), errors, true)}
          </Section>
        </Panel.Body>
      </form>
    </SidePanel>,
    document.body,
  );
}

export interface MasterLookupProps<T extends MasterRow> {
  def: MasterDef<T>;
  value: string;
  onChange: (value: string) => void;
  /** Only offer rows that pass (e.g. groups for the partner's roles). */
  where?: (row: T) => boolean;
  /** Fields a row added from here starts with (e.g. the group's role). */
  seed?: Partial<T>;
  /** Choices that aren't list rows, listed first (e.g. "All currencies"). */
  extra?: string[];
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Props from FormField (id, aria-*). */
  fieldProps?: object;
}

/**
 * A searchable picker over a master-data list. When nothing matches what was typed, or the
 * list is empty, it offers "+ Add" to create the entry in place; the new entry is then picked.
 * A value the record already holds stays listed even if its entry was deactivated.
 */
export function MasterLookup<T extends MasterRow>({
  def,
  value,
  onChange,
  where,
  seed,
  extra = [],
  placeholder,
  clearable,
  disabled,
  readOnly,
  fieldProps,
}: MasterLookupProps<T>) {
  const rows = useCollection(def.collection);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<T | null>(null);
  // Bumped to remount (and so close) the dropdown, since its footer has no close callback.
  const [mount, setMount] = useState(0);

  const options = [
    ...extra.map((x) => ({ value: x, label: x, text: x })),
    ...(rows ?? [])
    .filter((r) => (r.active && (!where || where(r))) || def.value(r) === value)
    .map((r) => ({ value: def.value(r), label: def.label(r), text: def.label(r) })),
  ];
  // A value saved before the list existed, or since renamed.
  if (value && rows && !options.some((o) => o.value === value)) options.push({ value, label: value, text: value });

  const typed = query.trim();
  // Typed text that is already an entry needs no "+ Add", even when other entries contain it.
  const exists = options.some((o) => o.text.toLowerCase() === typed.toLowerCase());
  const start = () => setAdding({ ...def.blank(exists ? '' : typed), ...seed });
  const addLabel = typed && !exists ? `+ Add "${typed}"` : `+ New ${def.noun}`;
  const addButton = (onClick: () => void) => (
    <button
      type="button"
      className="w-full cursor-pointer rounded-xl px-4 py-2 text-left text-sm font-medium hover:bg-[var(--color-bg-primary-subtle)]"
      style={{ color: 'var(--color-text-primary)' }}
      // Keep focus in the field so the click lands before the list closes.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {addLabel}
    </button>
  );

  return (
    <>
      <Combobox
        key={mount}
        {...fieldProps}
        options={options}
        disabled={disabled || !rows}
        readOnly={readOnly}
        placeholder={rows ? placeholder : 'Loading…'}
        clearable={clearable}
        value={value || null}
        onValueChange={(v) => {
          setQuery('');
          onChange(v ?? '');
        }}
        onQueryChange={setQuery}
        // No matches: the add line replaces "No results".
        emptyContent={(close) =>
          addButton(() => {
            close();
            start();
          })
        }
        // Matches: the add line sits under them, so an entry can be added even when the list has some.
        footer={
          typed && options.every((o) => !o.text.toLowerCase().includes(typed.toLowerCase())) ? null : (
            <div className="border-t border-[var(--color-border-default)] pt-1">
              {addButton(() => {
                setMount((m) => m + 1);
                setQuery('');
                start();
              })}
            </div>
          )
        }
      />
      {adding ? (
        <QuickAddPanel
          def={def}
          initial={adding}
          onCancel={() => setAdding(null)}
          onSaved={(row) => {
            setAdding(null);
            onChange(def.value(row));
          }}
        />
      ) : null}
    </>
  );
}
