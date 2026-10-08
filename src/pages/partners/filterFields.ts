import { LEAD_STAGES, type Partner } from '../../mocks/partners';
import { EMPTY_FILTER, oneRule, type FilterField } from '../../components/filter/engine';
import type { BuiltInView } from '../../components/filter/useListViews';
import { statusViews } from '../../components/filter/useListPresets';
import { defaultBillTo, defaultContactName, isActive } from '../../services/partners';
import {
  bpGroupDef,
  channelDef,
  currencyDef,
  industryDef,
  leadSourceDef,
  paymentTermDef,
  priceListDef,
  salesEmployeeDef,
  territoryDef,
} from '../settings/masterDefs';
import { ROLE_CONFIG, ROLE_ORDER, scopeConfig, type PartnerScope } from './roles';

const status: FilterField<Partner> = {
  key: 'status',
  label: 'Status',
  type: 'choice',
  options: [
    { value: 'Active', label: 'Active' },
    { value: 'Inactive', label: 'Inactive' },
  ],
  get: (p) => (isActive(p) ? 'Active' : 'Inactive'),
};

const roles: FilterField<Partner> = {
  key: 'roles',
  label: 'Role',
  type: 'choice',
  options: ROLE_ORDER.map((r) => ({ value: r, label: ROLE_CONFIG[r].singular })),
  get: (p) => p.roles,
};

const common = (): FilterField<Partner>[] => [
  { key: 'name', label: 'Name', type: 'text', get: (p) => p.name },
  { key: 'code', label: 'Code', type: 'text', get: (p) => p.code },
  status,
  { key: 'bpGroupId', label: 'Group', type: 'master', def: bpGroupDef, get: (p) => p.bpGroupId },
  { key: 'contact', label: 'Contact person', type: 'text', get: (p) => defaultContactName(p) },
  { key: 'city', label: 'City', type: 'text', get: (p) => defaultBillTo(p)?.city },
  { key: 'province', label: 'Province', type: 'text', get: (p) => defaultBillTo(p)?.province },
  { key: 'territory', label: 'Territory', type: 'master', def: territoryDef, get: (p) => p.territoryId },
  { key: 'salesEmployee', label: 'Sales employee', type: 'master', def: salesEmployeeDef, get: (p) => p.salesEmployeeId },
  { key: 'channel', label: 'Channel', type: 'master', def: channelDef, get: (p) => p.channelId },
  { key: 'industry', label: 'Industry', type: 'master', def: industryDef, get: (p) => p.industryId },
  { key: 'currency', label: 'Currency', type: 'master', def: currencyDef, get: (p) => p.currency },
  { key: 'tin', label: 'TIN', type: 'text', get: (p) => p.tin },
  { key: 'vatRegistered', label: 'VAT registered', type: 'boolean', get: (p) => p.vatRegistered },
];

const FIELDS: Record<PartnerScope, FilterField<Partner>[]> = {
  all: [...common(), roles],
  lead: [
    ...common(),
    { key: 'stage', label: 'Stage', type: 'choice', options: LEAD_STAGES.map((s) => ({ value: s, label: s })), get: (p) => p.leadStage ?? 'New' },
    { key: 'leadSource', label: 'Source', type: 'master', def: leadSourceDef, get: (p) => p.leadSourceId },
  ],
  customer: [
    ...common(),
    { key: 'paymentTermId', label: 'Payment terms', type: 'master', def: paymentTermDef, get: (p) => p.customerPaymentTermId },
    { key: 'priceListId', label: 'Price list', type: 'master', def: priceListDef, get: (p) => p.priceListId },
    { key: 'creditLimit', label: 'Credit limit', type: 'number', get: (p) => p.creditLimit },
    { key: 'alsoVendor', label: 'Also a vendor', type: 'boolean', get: (p) => p.roles.includes('vendor') },
  ],
  vendor: [
    ...common(),
    { key: 'paymentTermId', label: 'Payment terms', type: 'master', def: paymentTermDef, get: (p) => p.vendorPaymentTermId },
    { key: 'alsoCustomer', label: 'Also a customer', type: 'boolean', get: (p) => p.roles.includes('customer') },
  ],
};

/** Advanced-filter fields for a partner list. */
export const partnerFilterFields = (scope: PartnerScope) => FIELDS[scope];

/** Built-in presets for a partner list — what its tabs used to be. */
export function partnerViews(scope: PartnerScope): BuiltInView[] {
  const noun = scopeConfig(scope).title.toLowerCase();
  if (scope === 'lead') return statusViews(noun, LEAD_STAGES, 'stage');
  if (scope === 'all')
    return [
      { id: 'all', name: `All ${noun}`, filter: EMPTY_FILTER },
      ...ROLE_ORDER.map((r) => ({ id: r, name: ROLE_CONFIG[r].title, filter: oneRule('roles', 'is', r) })),
      { id: 'inactive', name: `Inactive ${noun}`, filter: oneRule('status', 'is', 'Inactive') },
    ];
  return statusViews(noun, ['Active', 'Inactive']);
}
