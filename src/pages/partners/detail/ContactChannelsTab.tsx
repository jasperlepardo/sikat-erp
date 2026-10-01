import { useState } from 'react';
import { Button, FormField, Select, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { RowMenu } from '../../../components/form/RowMenu';
import {
  CONTACT_CHANNEL_TYPES,
  newContactChannel,
  type ContactChannelType,
  type PartnerContactChannel,
} from '../../../mocks/partners';
import { FieldStack, Section, type Draft, type Errors } from './fields';

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

/** Form error key for a channel's value. */
export const channelErrorKey = (id: string) => `channel:${id}:value`;

/** A label not used yet: the type's name, numbered if taken ("Mobile 2"). */
function freeLabel(type: ContactChannelType, channels: PartnerContactChannel[]) {
  const taken = new Set(channels.map((c) => c.label));
  if (!taken.has(type)) return type;
  let n = 2;
  while (taken.has(`${type} ${n}`)) n++;
  return `${type} ${n}`;
}

/**
 * Contact channels as fields in the side column: the label beside, the value edited in place. Add picks a type; the ⋯ menu edits the label and type, or removes.
 */
export function ContactChannelsFields({
  draft,
  update,
  errors,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: Errors;
}) {
  const channels = draft.contactChannels;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const set = (id: string, patch: Partial<PartnerContactChannel>) =>
    update({ contactChannels: channels.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const add = (type: ContactChannelType) => {
    const ch = { ...newContactChannel(type), label: freeLabel(type, channels) };
    update({ contactChannels: [...channels, ch] });
    setFocusId(ch.id);
  };

  return (
    <Section
      icon="call"
      title={`Contact channels${channels.length ? ` (${channels.length})` : ''}`}
      actions={
        <RowMenu
          text="Add"
          label="Add a contact channel"
          items={CONTACT_CHANNEL_TYPES.map((t) => ({ label: t, icon: CHANNEL_ICON[t], onSelect: () => add(t) }))}
        />
      }
    >
      {channels.length ? (
        <FieldStack>
          {channels.map((ch) =>
            ch.id === editingId ? (
              <ChannelLabelEditor
                key={ch.id}
                value={ch}
                others={channels.filter((c) => c.id !== ch.id)}
                onDone={(patch) => {
                  set(ch.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <FormField key={ch.id} orientation="vertical" label={ch.label || ch.type} error={errors[channelErrorKey(ch.id)]}>
                {(p) => (
                  // The ⋯ menu sits beside the input, not inside it. `w-full`: the field column doesn't stretch its children.
                  <div className="flex w-full items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <TextField
                        {...p}
                        type={CHANNEL_INPUT_TYPE[ch.type]}
                        placeholder={CHANNEL_PLACEHOLDER[ch.type]}
                        autoFocus={ch.id === focusId}
                        value={ch.value}
                        onChange={(e) => set(ch.id, { value: e.currentTarget.value })}
                      />
                    </div>
                    <RowMenu
                      label={`Actions for ${ch.label || ch.type}`}
                      items={[
                        { label: 'Edit label & type', icon: 'edit', onSelect: () => setEditingId(ch.id) },
                        { label: 'Remove', icon: 'delete', onSelect: () => update({ contactChannels: channels.filter((c) => c.id !== ch.id) }) },
                      ]}
                    />
                  </div>
                )}
              </FormField>
            ),
          )}
        </FieldStack>
      ) : (
        <Text variant="small" tone="muted">
          No contact channels yet.
        </Text>
      )}
    </Section>
  );
}

/** Edits one channel's label and type in place of its field. Enter or Done saves; Escape cancels. */
function ChannelLabelEditor({
  value,
  others,
  onDone,
  onCancel,
}: {
  value: PartnerContactChannel;
  others: PartnerContactChannel[];
  onDone: (patch: Pick<PartnerContactChannel, 'label' | 'type'>) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(value.label);
  const [type, setType] = useState(value.type);
  // A label still named after the old type follows the new one.
  const pickType = (next: ContactChannelType) => {
    if (label === type || label.startsWith(`${type} `)) setLabel(freeLabel(next, others));
    setType(next);
  };
  const done = () => onDone({ label: label.trim() || freeLabel(type, others), type });

  return (
    <div className="flex items-center gap-1 px-2">
      <div className="min-w-0 flex-1">
        <TextField
          aria-label="Channel label"
          placeholder="e.g. Office, Home, Direct"
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              done();
            }
            if (e.key === 'Escape') onCancel();
          }}
        />
      </div>
      <div className="w-32">
        <Select
          aria-label="Channel type"
          options={CONTACT_CHANNEL_TYPES.map((t) => ({ value: t, label: t }))}
          value={type}
          onValueChange={(v) => v && pickType(v as ContactChannelType)}
        />
      </div>
      <Button type="button" size="small" intent="primary" variant="solid" onClick={done}>
        Done
      </Button>
    </div>
  );
}
