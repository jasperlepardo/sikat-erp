import { useState } from 'react';
import { Badge, Button, Icon, List, Text } from '@jasperlepardo/sikat-design-system';
import { EMAIL_GROUPS } from '../../../mocks/masters';
import { contactName, newContact, type ContactPerson } from '../../../mocks/partners';
import type { TabProps } from './GeneralTab';
import { Fields, Flags, Section, bind } from './fields';

export function ContactsTab({ draft, update }: TabProps) {
  const [selectedId, setSelectedId] = useState(draft.defaultContactId || draft.contacts[0]?.id);
  const selected = draft.contacts.find((c) => c.id === selectedId);

  const add = () => {
    const c = newContact();
    update({ contacts: [...draft.contacts, c], defaultContactId: draft.defaultContactId || c.id });
    setSelectedId(c.id);
  };
  const patch = (id: string, p: Partial<ContactPerson>) =>
    update({ contacts: draft.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const remove = (id: string) => {
    const contacts = draft.contacts.filter((c) => c.id !== id);
    update({
      contacts,
      defaultContactId: draft.defaultContactId === id ? (contacts[0]?.id ?? '') : draft.defaultContactId,
    });
    setSelectedId(contacts[0]?.id);
  };

  return (
    <div className="grid gap-2 lg:grid-cols-[320px_1fr]">
      <Section
        icon="contacts"
        title="Contact persons"
        actions={
          <Button
            type="button"
            size="small"
            variant="ghost"
            aria-label="New contact person"
            leadingIcon={<Icon size={16}>add</Icon>}
            onClick={add}
          >
            New
          </Button>
        }
      >
        {draft.contacts.length ? (
          <List.Group divider>
            {draft.contacts.map((c) => (
              <List.Item
                key={c.id}
                variant="stacked"
                title={
                  <span className={c.id === selectedId ? 'font-semibold text-primary' : undefined}>
                    {contactName(c)}
                  </span>
                }
                content={c.position || c.email || '—'}
                trailing={
                  c.id === draft.defaultContactId ? (
                    <Badge intent="primary">Default</Badge>
                  ) : !c.active ? (
                    <Badge>Inactive</Badge>
                  ) : undefined
                }
                aria-current={c.id === selectedId || undefined}
                onClick={() => setSelectedId(c.id)}
              />
            ))}
          </List.Group>
        ) : (
          <Text variant="small" tone="muted">
            No contacts yet.
          </Text>
        )}
      </Section>

      {selected ? (
        <ContactEditor
          key={selected.id}
          contact={selected}
          isDefault={selected.id === draft.defaultContactId}
          onChange={(p) => patch(selected.id, p)}
          onSetDefault={() => update({ defaultContactId: selected.id })}
          onRemove={() => remove(selected.id)}
        />
      ) : (
        <Section icon="person_add" title="No contact selected">
          <Button type="button" leadingIcon={<Icon size={20}>add</Icon>} onClick={add}>
            Add a contact person
          </Button>
        </Section>
      )}
    </div>
  );
}

function ContactEditor({
  contact,
  isDefault,
  onChange,
  onSetDefault,
  onRemove,
}: {
  contact: ContactPerson;
  isDefault: boolean;
  onChange: (p: Partial<ContactPerson>) => void;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  const f = bind(contact, onChange);
  return (
    <Section
      icon="person"
      title={contactName(contact)}
      actions={
        <div className="flex gap-1">
          <Button type="button" size="small" variant="ghost" disabled={isDefault} onClick={onSetDefault}>
            {isDefault ? 'Default contact' : 'Set as default'}
          </Button>
          <Button type="button" size="small" variant="ghost" intent="danger" onClick={onRemove}>
            Remove
          </Button>
        </div>
      }
    >
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
  );
}
