import { Badge, Combobox, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { candidatesOf, vendorOptions } from '../../shared/rfqFromPr';
import type { PrSectionProps } from './types';

/**
 * The vendors to ask for quotes. Until the buyer edits the list it shows every vendor linked to
 * the lines' items; the first edit stores an explicit set. Who gets which line is decided per
 * vendor when the request is sent out (Create purchase quotations).
 */
export function PrVendorsCard({ draft, update, m, ctx }: PrSectionProps) {
  const ids = candidatesOf(draft, m);
  const chosen = draft.candidateVendorIds.length > 0;
  const nameOf = (id: string) => m.vendors.find((v) => v.id === id)?.name ?? 'Unknown vendor';
  const set = (next: string[]) => update({ candidateVendorIds: next });

  return (
    <Section icon="storefront" title="Vendors to quote">
      <div className="flex flex-col gap-2">
        {ids.length ? (
          <div className="flex flex-wrap gap-1">
            {ids.map((id) => (
              <Badge
                key={id}
                size="medium"
                intent="default"
                variant="outline"
                {...(ctx.readOnly ? {} : { onDismiss: () => set(ids.filter((x) => x !== id)), dismissLabel: `Remove ${nameOf(id)}` })}
              >
                {nameOf(id)}
              </Badge>
            ))}
          </div>
        ) : (
          <Text variant="small" tone="muted">No vendors yet. Add one, or add lines whose items have linked vendors.</Text>
        )}
        {ctx.readOnly ? null : (
          <Combobox
            aria-label="Add a vendor to quote"
            placeholder="Add vendor"
            options={vendorOptions(m.vendors, ids)}
            value={null}
            onValueChange={(v) => v && set([...ids, v])}
          />
        )}
        <Text variant="small" tone="muted">
          {chosen ? 'Chosen for this request.' : "The vendors linked to the lines' items."} Each vendor is sent only the lines whose item it carries.
        </Text>
      </div>
    </Section>
  );
}
