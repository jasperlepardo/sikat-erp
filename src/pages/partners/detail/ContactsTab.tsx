import { useState } from 'react';
import { Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { RowMenu } from '../../../components/form/RowMenu';
import { countryDef, emailGroupDef } from '../../settings/masterDefs';
import { contactName, newContact, type ContactPerson } from '../../../mocks/partners';
import { EditPanel } from './EditPanel';
import { Fields, Flags, Section, bind, type Draft, DefaultFlags, useDefaultPicks, type DefaultPicks, type DefaultRole } from './fields';

/** Contact persons as cards in the side column; adding and editing happen in `ContactPanel`. */
export function ContactsCards({
  draft,
  update,
  onOpen,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onOpen: (contact: ContactPerson, isNew: boolean) => void;
}) {
  const remove = (id: string) => {
    const contacts = draft.contacts.filter((c) => c.id !== id);
    update({
      contacts,
      defaultContactId: draft.defaultContactId === id ? (contacts[0]?.id ?? '') : draft.defaultContactId,
    });
  };

  return (
    <Section
      icon="contacts"
      title={`Contact persons${draft.contacts.length ? ` (${draft.contacts.length})` : ''}`}
      actions={
        <Link
          aria-label="New contact person"
          leadingIcon={<Icon size={20}>add</Icon>}
          onClick={() => onOpen(newContact(), true)}
        >
          New
        </Link>
      }
    >
      {draft.contacts.length ? (
        <List.Group>
          {draft.contacts.map((c) => {
            const isDefault = c.id === draft.defaultContactId;
            return (
              <List.Card
                key={c.id}
                title={contactName(c)}
                icon={<Icon size={16}>person</Icon>}
                badge={isDefault ? <Icon size={12}>star</Icon> : undefined}
                fields={[
                  { label: 'Position', value: c.position },
                  { label: 'Email', value: c.email },
                  { label: 'Phone', value: c.mobile || c.tel1 },
                  { label: 'Status', value: isDefault ? 'Default contact' : c.active ? '' : 'Inactive' },
                ].filter((x) => x.value)}
                actions={
                  <RowMenu
                    label={`Actions for ${contactName(c)}`}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => onOpen(c, false) },
                      { label: 'Set as default', icon: 'star', disabled: isDefault, onSelect: () => update({ defaultContactId: c.id }) },
                      { label: 'Remove', icon: 'delete', onSelect: () => remove(c.id) },
                    ]}
                  />
                }
              />
            );
          })}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">
          No contacts yet.
        </Text>
      )}
    </Section>
  );
}

/** Add or edit one contact person in a side panel. */
export function ContactPanel({
  value,
  isNew,
  defaults,
  onDone,
  onCancel,
}: {
  value: ContactPerson;
  isNew: boolean;
  /** Defaults this contact can hold (default contact person). */
  defaults: DefaultRole[];
  onDone: (contact: ContactPerson, picks: DefaultPicks) => void;
  onCancel: () => void;
}) {
  const [contact, setContact] = useState(value);
  const [picks, setPicks] = useDefaultPicks(defaults);
  const f = bind(contact, (p: Partial<ContactPerson>) => setContact((c) => ({ ...c, ...p })));
  return (
    <EditPanel
      icon="person"
      title={isNew ? 'New contact person' : contactName(value)}
      onCancel={onCancel}
      onDone={() => onDone(contact, picks)}
    >
      <Section icon="person" title="Contact person">
        <Fields cols={3}>
          {f.text('firstName', 'First name', { placeholder: 'e.g. Maria' })}
          {f.text('middleName', 'Middle name', { placeholder: 'e.g. Santos' })}
          {f.text('lastName', 'Last name', { placeholder: 'e.g. Dela Cruz' })}
        </Fields>
        <Fields>
          {f.text('title', 'Title', { placeholder: 'Engr., Atty., Ms.' })}
          {f.text('position', 'Position', { placeholder: 'e.g. Purchasing manager' })}
          {f.text('email', 'Email', { placeholder: 'name@company.com', type: 'email', hint: 'Used when this contact is picked on a document.' })}
          {f.master('emailGroup', 'Email group', emailGroupDef, { clearable: true })}
          {f.text('tel1', 'Telephone 1', { placeholder: 'e.g. (02) 8123 4567', type: 'tel' })}
          {f.text('tel2', 'Telephone 2', { placeholder: 'e.g. (02) 8123 4567', type: 'tel' })}
          {f.text('mobile', 'Mobile phone', { placeholder: 'e.g. 0917 123 4567', type: 'tel' })}
          {f.text('fax', 'Fax', { placeholder: 'e.g. (02) 8123 4568', type: 'tel' })}
          {f.text('pager', 'Pager', { hint: 'Kept for older records; rarely used.' })}
          {f.master('birthCountry', 'Country of birth', countryDef, { clearable: true })}
          {f.text('portalPassword', 'Portal password', { type: 'password', placeholder: 'Not set', hint: 'This contact’s own portal login.' })}
          {f.text('address', 'Address', { placeholder: 'Street, barangay, city', className: 'md:col-span-2' })}
          {f.text('remarks1', 'Remarks 1', { placeholder: 'Add a note' })}
          {f.text('remarks2', 'Remarks 2', { placeholder: 'Add a note' })}
          {f.status('active', 'Status')}
        </Fields>
        <Flags>
          {f.check('eDocRecipient', 'E-document recipient')}
          {f.check('blockMarketing', 'Block sending marketing content')}
        </Flags>
      </Section>
      <Section icon="star" title="Defaults">
        <DefaultFlags roles={defaults} picks={picks} onChange={setPicks} />
      </Section>
    </EditPanel>
  );
}
