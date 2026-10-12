import { AddressFields } from '../../../components/form/AddressFields';
import { Section } from '../../../components/form/fields';
import type { TabProps } from './types';

/** Work and home addresses. */
export function AddressTab({ draft, update }: TabProps) {
  return (
    <>
      <Section icon="business" title="Work address">
        <AddressFields value={draft.workAddress} onChange={(p) => update({ workAddress: { ...draft.workAddress, ...p } })} />
      </Section>
      <Section icon="home" title="Home address">
        <AddressFields value={draft.homeAddress} onChange={(p) => update({ homeAddress: { ...draft.homeAddress, ...p } })} />
      </Section>
    </>
  );
}
