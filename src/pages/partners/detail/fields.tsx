import type { Partner } from '../../../mocks/partners';

export { Fields, Flags, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';

export type Draft = Omit<Partner, 'id'> & { id?: string };
