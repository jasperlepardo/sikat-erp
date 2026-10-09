import { Select } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, StatusLabel, type StatusIntent } from './fields';

/**
 * A document's status as a dropdown, each status with its colored dot. The system sets
 * statuses, so only those in `moves` can be picked — each runs the action that gets there
 * (Add, Close, Cancel…); the rest show greyed out.
 */
export function StatusField<S extends string>({
  statuses,
  intents,
  value,
  moves = {},
  label = 'Status',
  hint,
  error,
}: {
  statuses: readonly S[];
  intents: Record<S, StatusIntent>;
  value: S;
  moves?: Partial<Record<S, () => void>>;
  label?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <CtxFormField label={label} hint={hint} error={error}>
      {(p) => (
        <Select
          {...p}
          options={statuses.map((s) => ({
            value: s,
            text: s,
            label: <StatusLabel intent={intents[s]}>{s}</StatusLabel>,
            disabled: s !== value && !moves[s],
          }))}
          value={value}
          onValueChange={(s) => s !== value && moves[s as S]?.()}
        />
      )}
    </CtxFormField>
  );
}
