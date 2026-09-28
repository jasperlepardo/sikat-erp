import { useState } from 'react';
import { Button, Icon, List, Text } from '@jasperlepardo/sikat-design-system';
import { RowMenu } from '../../../components/form/RowMenu';
import { EMAIL_GROUPS } from '../../../mocks/masters';
import { contactName, newContact, type ContactPerson } from '../../../mocks/partners';
import { EditPanel } from './EditPanel';
import { Fields, Flags, Section, bind, type Draft } from './fields';

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
      title={`Contact persons${draft.contacts.length ? ` · ${draft.contacts.length}` : ''}`}
      actions={
        <Button
          type="button"
          size="small"
          variant="ghost"
          aria-label="New contact person"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={() => onOpen(newContact(), true)}
        >
          New
        </Button>
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
  onDone,
  onCancel,
}: {
  value: ContactPerson;
  isNew: boolean;
  onDone: (contact: ContactPerson) => void;
  onCancel: () => void;
}) {
  const [contact, setContact] = useState(value);
  const f = bind(contact, (p: Partial<ContactPerson>) => setContact((c) => ({ ...c, ...p })));
  return (
    <EditPanel
      icon="person"
      title={isNew ? 'New contact person' : contactName(value)}
      onCancel={onCancel}
      onDone={() => onDone(contact)}
    >
      <Section icon="person" title="Contact person">
        <Fields cols={3}>
          {f.text('firstName', 'First name')}
          {f.text('middleName', 'Middle name')}
          {f.text('lastName', 'Last name')}
        </Fields>
        <Fields>
          {f.text('title', 'Title', { placeholder: 'Engr., Atty., Ms.' })}
          {f.text('position', 'Position')}
          {f.text('email', 'Email', { type: 'email', hint: 'Used when this contact is picked on a document.' })}
          {f.pick('emailGroup', 'Email group', EMAIL_GROUPS)}
          {f.text('tel1', 'Telephone 1', { type: 'tel' })}
          {f.text('tel2', 'Telephone 2', { type: 'tel' })}
          {f.text('mobile', 'Mobile phone', { type: 'tel' })}
          {f.text('fax', 'Fax', { type: 'tel' })}
          {f.text('address', 'Address', { className: 'md:col-span-2' })}
          {f.text('remarks1', 'Remarks 1')}
          {f.text('remarks2', 'Remarks 2')}
        </Fields>
        <Flags>
          {f.check('active', 'Active')}
          {f.check('eDocRecipient', 'E-document recipient')}
          {f.check('blockMarketing', 'Block sending marketing content')}
        </Flags>
      </Section>
    </EditPanel>
  );
}
