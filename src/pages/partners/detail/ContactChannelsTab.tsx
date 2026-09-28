import { useState } from 'react';
import { Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { RowMenu } from '../../../components/form/RowMenu';
import {
  CONTACT_CHANNEL_TYPES,
  newContactChannel,
  type ContactChannelType,
  type PartnerContactChannel,
} from '../../../mocks/partners';
import { EditPanel } from './EditPanel';
import { Fields, Section, bind, type Draft, type Errors } from './fields';

const CHANNEL_ICON: Record<ContactChannelType, string> = {
  Phone: 'phone',
  Mobile: 'smartphone',
  WhatsApp: 'chat',
  Viber: 'call',
  Email: 'mail',
  Fax: 'fax',
  Website: 'language',
  Other: 'contact_phone',
};

export const CHANNEL_INPUT_TYPE: Record<ContactChannelType, string> = {
  Phone: 'tel', Mobile: 'tel', WhatsApp: 'tel', Viber: 'tel',
  Email: 'email', Fax: 'tel', Website: 'url', Other: 'text',
};

export const CHANNEL_PLACEHOLDER: Record<ContactChannelType, string> = {
  Phone: '+63 2 8000 0000', Mobile: '+63 917 000 0000', WhatsApp: '+63 917 000 0000',
  Viber: '+63 917 000 0000', Email: 'name@company.ph', Fax: '+63 2 8000 0000',
  Website: 'https://', Other: '',
};

/** Contact channel cards shown in the side column. */
export function ContactChannelsCards({
  draft,
  update,
  onOpen,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onOpen: (channel: PartnerContactChannel, isNew: boolean) => void;
}) {
  const remove = (id: string) =>
    update({ contactChannels: draft.contactChannels.filter((c) => c.id !== id) });

  return (
    <Section
      icon="call"
      title={`Contact channels${draft.contactChannels.length ? ` · ${draft.contactChannels.length}` : ''}`}
      actions={
        <Link
          aria-label="New contact channel"
          leadingIcon={<Icon size={20}>add</Icon>}
          onClick={() => onOpen(newContactChannel(), true)}
        >
          New
        </Link>
      }
    >
      {draft.contactChannels.length ? (
        <List.Group>
          {draft.contactChannels.map((ch) => (
            <List.Card
              key={ch.id}
              title={ch.label}
              icon={<Icon size={16}>{CHANNEL_ICON[ch.type]}</Icon>}
              fields={[{ label: ch.type, value: ch.value }].filter((x) => x.value)}
              actions={
                <RowMenu
                  label={`Actions for ${ch.label}`}
                  items={[
                    { label: 'Edit', icon: 'edit', onSelect: () => onOpen(ch, false) },
                    { label: 'Remove', icon: 'delete', onSelect: () => remove(ch.id) },
                  ]}
                />
              }
            />
          ))}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">
          No contact channels yet.
        </Text>
      )}
    </Section>
  );
}

/** Add or edit one contact channel in a side panel. */
export function ContactChannelPanel({
  value,
  isNew,
  onDone,
  onCancel,
}: {
  value: PartnerContactChannel;
  isNew: boolean;
  onDone: (channel: PartnerContactChannel) => void;
  onCancel: () => void;
}) {
  const [channel, setChannel] = useState(value);
  const [errors, setErrors] = useState<Errors>({});

  const f = bind(channel, (p: Partial<PartnerContactChannel>) => {
    setChannel((c) => {
      const next = { ...c, ...p };
      // Auto-update label when type changes if label still matches the old type name
      if (p.type && c.label === c.type) next.label = p.type;
      return next;
    });
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in p))));
  });

  const done = () => {
    const found: Errors = {};
    if (!channel.value.trim()) found.value = 'Enter a value.';
    setErrors(found);
    if (!Object.keys(found).length) onDone(channel);
  };

  return (
    <EditPanel
      icon={CHANNEL_ICON[channel.type]}
      title={isNew ? 'New contact channel' : channel.label}
      onCancel={onCancel}
      onDone={done}
    >
      <Section icon="call" title="Contact channel">
        <Fields>
          {f.pick('type', 'Type', [...CONTACT_CHANNEL_TYPES])}
          {f.text('label', 'Label', { placeholder: 'e.g. Office, Home, Direct' })}
          {f.text('value', 'Value', {
            type: CHANNEL_INPUT_TYPE[channel.type],
            placeholder: CHANNEL_PLACEHOLDER[channel.type],
            required: true,
            error: errors.value,
          })}
        </Fields>
      </Section>
    </EditPanel>
  );
}
