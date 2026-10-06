import { useState } from 'react';
import {
  Button,
  Icon,
  IconButton,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import type { VariantAxis } from '../../../../mocks/items';

interface Props {
  axes: VariantAxis[];
  onChange: (axes: VariantAxis[]) => void;
  disabled?: boolean;
}

interface RowProps {
  axis: VariantAxis;
  onUpdate: (patch: Partial<VariantAxis>) => void;
  onRemove: () => void;
  disabled?: boolean;
}

function AxisRow({ axis, onUpdate, onRemove, disabled }: RowProps) {
  const [input, setInput] = useState('');

  const commit = () => {
    const v = input.trim();
    if (v && !axis.options.includes(v)) onUpdate({ options: [...axis.options, v] });
    setInput('');
  };

  const removeOption = (opt: string) => onUpdate({ options: axis.options.filter((o) => o !== opt) });

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <TextField
          aria-label="Option name"
          placeholder="e.g. Color, Size, Storage"
          value={axis.name}
          disabled={disabled}
          className="flex-1 text-sm"
          onChange={(e) => onUpdate({ name: e.currentTarget.value })}
        />
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

      {/* Option values as tags */}
      {axis.options.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {axis.options.map((opt) => (
            <span key={opt} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
              {opt}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${opt}`}
                  className="hover:text-danger leading-none"
                  onClick={() => removeOption(opt)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!disabled && (
        <TextField
          aria-label={`Add ${axis.name || 'option'} value`}
          placeholder="Type a value, press Enter"
          value={input}
          className="text-sm"
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            }
          }}
          trailingIcon={
            input.trim() ? (
              <button type="button" className="p-1" onClick={commit}>
                <Icon size={16}>check</Icon>
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

export function VariantAxesEditor({ axes, onChange, disabled }: Props) {
  const updateAxis = (i: number, patch: Partial<VariantAxis>) =>
    onChange(axes.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const removeAxis = (i: number) => onChange(axes.filter((_, j) => j !== i));
  const addAxis = () => onChange([...axes, { name: '', options: [] }]);

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
