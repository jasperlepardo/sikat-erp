import { useState } from 'react';
import {
  Badge,
  Button,
  Icon,
  IconButton,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { MasterLookup, useCollection } from '../../../../components/form/MasterLookup';
import type { VariantAxis } from '../../../../mocks/items';
import type { VariantAttribute } from '../../../../mocks/itemMasters';
import { variantAttributes } from '../../../../services/inventoryMasters';
import { newId } from '../../../../services/useCollectionRows';
import { variantAttributeDef } from '../../../settings/masterDefs';

interface Props {
  axes: VariantAxis[];
  onChange: (axes: VariantAxis[]) => void;
  disabled?: boolean;
}

interface RowProps {
  axis: VariantAxis;
  attribute: VariantAttribute | undefined;
  /** Attributes other rows already use. */
  taken: string[];
  onUpdate: (patch: Partial<VariantAxis>) => void;
  onRemove: () => void;
  disabled?: boolean;
}

function AxisRow({ axis, attribute, taken, onUpdate, onRemove, disabled }: RowProps) {
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);

  const labelOf = (id: string) => attribute?.values.find((v) => v.id === id)?.label ?? id;

  /** Keeps the item's values in the attribute's order (Settings), so there's one order to maintain. */
  const inOrder = (ids: string[]) => {
    const rank = (id: string) => attribute?.values.findIndex((v) => v.id === id) ?? -1;
    return [...ids].sort((a, b) => rank(a) - rank(b));
  };
  const addValue = (id: string) => {
    if (!axis.valueIds.includes(id)) onUpdate({ valueIds: inOrder([...axis.valueIds, id]) });
  };

  /** Picks the typed value, adding it to the attribute's values (Settings) when it's new. */
  const commit = async () => {
    const label = input.trim();
    if (!label || !attribute) return;
    const existing = attribute.values.find((v) => v.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      if (!existing.active) await variantAttributes.save({ ...attribute, values: attribute.values.map((v) => (v.id === existing.id ? { ...v, active: true } : v)) });
      addValue(existing.id);
    } else {
      setAdding(true);
      try {
        const value = { id: newId(attribute.id), label, active: true };
        await variantAttributes.save({ ...attribute, values: [...attribute.values, value] });
        addValue(value.id);
      } finally {
        setAdding(false);
      }
    }
    setInput('');
  };

  const removeValue = (id: string) => onUpdate({ valueIds: axis.valueIds.filter((v) => v !== id) });

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--color-border-default)] text-body p-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <MasterLookup
            def={variantAttributeDef}
            fieldProps={{ 'aria-label': 'Attribute' }}
            placeholder="Pick an attribute, e.g. Color, Size, Storage"
            value={axis.attributeId}
            where={(a) => !taken.includes(a.id)}
            disabled={disabled}
            onChange={(attributeId) => onUpdate({ attributeId, valueIds: [] })}
          />
        </div>
        {!disabled && (
          <IconButton
            type="button"
            label="Remove option"
            intent="default"
            variant="ghost"
            size="medium"
            onClick={onRemove}
          >
            <Icon size={18}>close</Icon>
          </IconButton>
        )}
      </div>

      {/* Values the item offers */}
      {axis.valueIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {axis.valueIds.map((id) => (
            <Badge
              key={id}
              intent="primary"
              variant="outline"
              size="medium"
              onDismiss={disabled ? undefined : () => removeValue(id)}
              dismissLabel={`Remove ${labelOf(id)}`}
            >
              {labelOf(id)}
            </Badge>
          ))}
        </div>
      )}

      {!disabled && attribute && (
        <TextField
          aria-label={`Add ${attribute.name} value`}
          placeholder="Type a value, press Enter"
          value={input}
          disabled={adding}
          className="text-sm"
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              void commit();
            }
          }}
          trailingIcon={
            input.trim() ? (
              <button type="button" className="p-1" onClick={() => void commit()}>
                <Icon size={16}>check</Icon>
              </button>
            ) : undefined
          }
        />
      )}
      {!disabled && !attribute && (
        <Text variant="small" tone="muted">
          Pick an attribute to choose its values. Type a new name to add it to Settings › Inventory.
        </Text>
      )}
    </div>
  );
}

export function VariantAxesEditor({ axes, onChange, disabled }: Props) {
  const attributes = useCollection(variantAttributes);
  const updateAxis = (i: number, patch: Partial<VariantAxis>) =>
    onChange(axes.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const removeAxis = (i: number) => onChange(axes.filter((_, j) => j !== i));
  const addAxis = () => onChange([...axes, { attributeId: '', valueIds: [] }]);

  return (
    <div className="flex flex-col gap-2">
      {axes.length === 0 && !disabled && (
        <Text variant="small" tone="muted">
          Add options like Size or Color to generate variants.
        </Text>
      )}
      {axes.map((axis, i) => (
        <AxisRow
          key={i}
          axis={axis}
          attribute={attributes?.find((a) => a.id === axis.attributeId)}
          taken={axes.filter((_, j) => j !== i).map((a) => a.attributeId)}
          onUpdate={(patch) => updateAxis(i, patch)}
          onRemove={() => removeAxis(i)}
          disabled={disabled}
        />
      ))}
      {!disabled && axes.length < 3 && (
        <Button
          type="button"
          intent="default"
          variant="outline"
          size="medium"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={addAxis}
        >
          Add another option
        </Button>
      )}
    </div>
  );
}
