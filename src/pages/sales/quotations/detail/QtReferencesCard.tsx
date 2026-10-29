import { FieldStack, Section, bind } from '../../../../components/form/fields';
import type { QtTabProps } from './types';

/** Indicator and Order number live in the customer slide-over ("Order details"); only the tax ID is here. */
export function QtReferencesCard({ draft, update, ctx }: QtTabProps) {
  const f = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="description" title="References">
        <FieldStack>
          {f.text('federalTaxId', 'Federal tax ID', { hint: "Defaults to the customer's TIN." })}
        </FieldStack>
      </Section>
    </fieldset>
  );
}
