/**
 * The master-data lists the business partner form picks from. Each definition drives its
 * Settings tab and the "+ Add" panel of every field that uses it (components/form/MasterLookup).
 */
import { Button, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, ReadOnly, bind, type Errors } from '../../components/form/fields';
import { statusColumn, uniqueRequired } from '../../components/form/MasterList';
import type { MasterDef } from '../../components/form/MasterLookup';
import { MAX_PARTNER_PROPERTIES, type Bank, type BpGroup, type Country, type NamedEntry, PRICE_ROUNDING, type PaymentTerm, type PriceList, type Project } from '../../mocks/partnerMasters';
import { ItemPricesTable } from '../inventory/pricing/ItemPricesTable';
import { BASE_PRICE_LIST_ID, describeChain, priceChain, priceListName, roundingLabel, samplePrice } from '../../services/priceLists';
import type { Collection } from '../../services/store';
import { newId } from '../../services/useCollectionRows';
import * as lists from '../../services/partnerMasters';
import { ROLE_CONFIG, ROLE_ORDER } from '../partners/roles';
import type { Currency } from '../../mocks/currencies';
import {
  LENGTH_UNITS,
  WEIGHT_UNITS,
  blankUom,
  volumeUnit,
  type Manufacturer,
  type ShippingType,
  type UnitOfMeasure,
  type WarrantyTemplate,
} from '../../mocks/itemMasters';
import { currencies } from '../../services/masterData';
import { manufacturers, shippingTypes, unitsOfMeasure, warehouses, warrantyTemplates } from '../../services/inventoryMasters';
import { blankCurrency, validateCurrency } from './accounting-tax/CurrenciesTab';
import type { Company } from '../../mocks/companies';
import { addressSummary, blankPostalAddress } from '../../mocks/address';
import { companies, registeredOfficeOf, withRegisteredAddress } from '../../services/companies';

const SALES = 'Settings › Sales & CRM';
const BANKING = 'Settings › Banking';
const COMPANY = 'Settings › Company';


/** A list whose entries are just a name. */
function namedDef(o: {
  collection: Collection<NamedEntry>;
  idPrefix: string;
  icon: string;
  title: string;
  noun: string;
  home: string;
  description: string;
  placeholder?: string;
  /** Validation beyond "required and unique" (e.g. a size cap). */
  check?: (row: NamedEntry, all: NamedEntry[], e: Errors) => void;
}): MasterDef<NamedEntry> {
  return {
    collection: o.collection,
    icon: o.icon,
    title: o.title,
    noun: o.noun,
    home: o.home,
    description: o.description,
    blank: (name) => ({ id: newId(o.idPrefix), name, active: true }),
    value: (r) => r.id,
    label: (r) => r.name,
    columns: [{ key: 'name', header: 'Name', cell: (r) => r.name }, statusColumn<NamedEntry>()],
    searchText: (r) => r.name,
    normalize: (r) => ({ ...r, name: r.name.trim() }),
    validate: (r, all) => {
      const e: Errors = {};
      uniqueRequired(e, r, all, 'name', 'Name');
      o.check?.(r, all, e);
      return e;
    },
    editor: (r, update, errors) => {
      const f = bind(r, update);
      return (
        <FieldStack>
          {f.text('name', 'Name', { required: true, error: errors.name, placeholder: o.placeholder, })}
          {f.status('active', 'Status')}
        </FieldStack>
      );
    },
  };
}

// ── Sales & CRM ──────────────────────────────────────────────────────────────

export const bpGroupDef: MasterDef<BpGroup> = {
  collection: lists.bpGroups,
  icon: 'workspaces',
  title: 'Business partner groups',
  noun: 'partner group',
  home: SALES,
  description: 'Classify partners for reporting and filtering. Each group is for customers, vendors or leads.',
  blank: (name) => ({ id: newId('bpg'), name, role: 'customer', active: true }),
  value: (g) => g.id,
  label: (g) => g.name,
  columns: [
    { key: 'name', header: 'Group', cell: (g) => g.name },
    { key: 'role', header: 'For', cell: (g) => ROLE_CONFIG[g.role].title },
    statusColumn<BpGroup>(),
  ],
  searchText: (g) => `${g.name} ${g.role}`,
  normalize: (g) => ({ ...g, name: g.name.trim() }),
  validate: (g, all) => {
    const e: Errors = {};
    uniqueRequired(e, g, all, 'name', 'Name');
    return e;
  },
  editor: (g, update, errors, isNew) => {
    const f = bind(g, update);
    return (
      <FieldStack>
        {f.text('name', 'Name', { required: true, error: errors.name, placeholder: 'e.g. Customers – Export' })}
        {f.choose('role', 'For', ROLE_ORDER.map((r) => ({ value: r, label: ROLE_CONFIG[r].title })), {
          disabled: !isNew,
          hint: 'Which partners can be put in this group.',
        })}
        {f.status('active', 'Status')}
      </FieldStack>
    );
  },
};

export const industryDef = namedDef({
  collection: lists.industries, idPrefix: 'ind', icon: 'factory', title: 'Industries', noun: 'industry', home: SALES,
  description: 'Industry of a partner, for segmentation and reports.', placeholder: 'e.g. Hospitality',
});
export const salesEmployeeDef = namedDef({
  collection: lists.salesEmployees, idPrefix: 'emp', icon: 'badge', title: 'Sales employees & buyers', noun: 'sales employee', home: SALES,
  description: 'People assigned to partners. Defaults into documents raised for the partner.',
});
export const territoryDef = namedDef({
  collection: lists.territories, idPrefix: 'ter', icon: 'map', title: 'Territories', noun: 'territory', home: SALES,
  description: 'Sales territories, for territory-based sales reports.', placeholder: 'e.g. Central Luzon',
});
export const channelDef = namedDef({
  collection: lists.channels, idPrefix: 'chn', icon: 'alt_route', title: 'Channels', noun: 'channel', home: SALES,
  description: 'How a partner buys from you, for channel-based reports.',
});
export const leadSourceDef = namedDef({
  collection: lists.leadSources, idPrefix: 'lds', icon: 'campaign', title: 'Lead sources', noun: 'lead source', home: SALES,
  description: 'Where a lead came from.',
});
// ── Inventory › Price Lists ──────────────────────────────────────────────────

const based = (l: PriceList) => {
  if (!l.basePriceListId) return `Independent · item ${l.source === 'cost' ? 'cost' : 'SRP'}`;
  return `${priceListName(l.basePriceListId)} × ${l.factor}`;
};

const validity = (l: PriceList) =>
  !l.validFrom && !l.validTo ? 'Always' : `${l.validFrom || '…'} – ${l.validTo || '…'}`;

export const priceListDef: MasterDef<PriceList> = {
  collection: lists.priceLists,
  icon: 'sell',
  title: 'Price lists',
  noun: 'price list',
  home: 'Inventory › Price Lists',
  description:
    "Price tiers partners and document lines default to. Independent lists take the item's cost or SRP; dependent lists are another list × a factor, so repricing the base reprices the whole chain.",
  blank: (name) => ({
    id: newId('prl'),
    name,
    basePriceListId: BASE_PRICE_LIST_ID,
    factor: 1,
    source: 'srp',
    rounding: 'none',
    gross: true,
    validFrom: '',
    validTo: '',
    remarks: '',
    itemPrices: [],
    active: true,
  }),
  value: (l) => l.id,
  label: (l) => l.name,
  columns: [
    { key: 'name', header: 'Name', cell: (l) => l.name },
    { key: 'basePriceListId', header: 'Based on', cell: based },
    { key: 'rounding', header: 'Rounding', cell: (l) => (l.basePriceListId ? roundingLabel(l.rounding) : '—') },
    { key: 'gross', header: 'Prices', cell: (l) => (l.gross ? 'Gross (VAT incl.)' : 'Net of VAT') },
    { key: 'validTo', header: 'Valid', cell: validity },
    statusColumn<PriceList>(),
  ],
  searchText: (l) => `${l.name} ${priceListName(l.basePriceListId)} ${l.remarks}`,
  normalize: (l) => ({
    ...l,
    name: l.name.trim(),
    // Independent lists have no factor or rounding of their own.
    ...(l.basePriceListId ? {} : { factor: 1, rounding: 'none' as const }),
  }),
  validate: (l, all) => {
    const e: Errors = {};
    uniqueRequired(e, l, all, 'name', 'Name');
    if (l.basePriceListId) {
      if (!(l.factor > 0)) e.factor = 'Factor must be more than 0.';
      if (l.basePriceListId === l.id) e.basePriceListId = "A list can't be based on itself.";
      else if (!all.some((x) => x.id === l.basePriceListId)) e.basePriceListId = "The base list doesn't exist.";
      else if (!priceChain(l, all)) e.basePriceListId = `${priceListName(l.basePriceListId, all)} is based on this list (directly or further up), which would loop.`;
    }
    if (l.validFrom && l.validTo && l.validTo < l.validFrom) e.validTo = 'Valid to is before valid from.';
    if (l.itemPrices.some((p) => !(p.price >= 0))) e.itemPrices = "Manual prices can't be negative.";
    return e;
  },
  editor: (l, update, errors, isNew) => {
    const f = bind(l, update);
    const all = lists.priceLists.snapshot();
    const bases = all.filter((x) => x.id !== l.id && (x.active || x.id === l.basePriceListId));
    const chain = priceChain(l, all);
    const sample = samplePrice(l, all);
    return (
      <FieldStack>
        {f.text('name', 'Name', { required: true, error: errors.name, placeholder: 'e.g. Corporate' })}
        {f.choose(
          'basePriceListId',
          'Base price list',
          [{ value: '', label: 'None — independent list' }, ...bases.map((x) => ({ value: x.id, label: x.name }))],
          { error: errors.basePriceListId, hint: 'Leave empty for a list with its own prices.' },
        )}
        {l.basePriceListId ? (
          <>
            {f.num('factor', 'Factor', { required: true, error: errors.factor, hint: '1.30 = 30% markup, 0.92 = 8% off the base.' })}
            {f.choose('rounding', 'Rounding', PRICE_ROUNDING)}
          </>
        ) : (
          f.choose('source', 'Item price from', [
            { value: 'srp', label: 'Item SRP (sales price)' },
            { value: 'cost', label: 'Item cost (last purchase price)' },
          ], { hint: 'Set on the item form, Sales and Purchasing tabs.' })
        )}
        {f.date('validFrom', 'Valid from', { hint: 'Empty = no start date.' })}
        {f.date('validTo', 'Valid to', { error: errors.validTo, hint: "Documents can't pick the list outside these dates." })}
        {f.area('remarks', 'Remarks')}
        {f.check('gross', 'Gross price (VAT inclusive)')}
        {f.status('active', 'Status')}
        {chain && chain.length > 1 ? (
          <Text variant="small" tone="muted">
            {describeChain(chain)}
            {sample ? ` · e.g. ${sample}` : ''}
          </Text>
        ) : null}
        {isNew ? (
          <Text variant="small" tone="muted">
            Item prices can be set once the list is added.
          </Text>
        ) : (
          <>
            <ItemPricesTable list={l} update={update} />
            {errors.itemPrices ? <Text variant="small" tone="danger">{errors.itemPrices}</Text> : null}
          </>
        )}
      </FieldStack>
    );
  },
};
export const emailGroupDef = namedDef({
  collection: lists.emailGroups, idPrefix: 'emg', icon: 'forward_to_inbox', title: 'E-mail groups', noun: 'e-mail group', home: SALES,
  description: 'Distribution groups a contact person can belong to, for bulk mailing.',
});
export const partnerPropertyDef = namedDef({
  collection: lists.partnerProperties, idPrefix: 'bpp', icon: 'label', title: 'Partner properties', noun: 'property', home: SALES,
  description: `Yes/no tags on partners for filtering reports and marketing lists. Up to ${MAX_PARTNER_PROPERTIES}.`,
  check: (r, all, e) => {
    if (!all.some((x) => x.id === r.id) && all.length >= MAX_PARTNER_PROPERTIES) e.name = `There can be at most ${MAX_PARTNER_PROPERTIES} properties.`;
  },
});

// ── Banking ──────────────────────────────────────────────────────────────────

export const paymentTermDef: MasterDef<PaymentTerm> = {
  collection: lists.paymentTerms,
  icon: 'event_available',
  title: 'Payment terms',
  noun: 'payment term',
  home: BANKING,
  description: 'Terms partners default to. The days set the due date on documents.',
  blank: (name) => ({ id: newId('pt'), name, days: Number(/(\d+)/.exec(name)?.[1] ?? 0), active: true }),
  value: (t) => t.id,
  label: (t) => t.name,
  columns: [
    { key: 'name', header: 'Name', cell: (t) => t.name },
    { key: 'days', header: 'Due after', cell: (t) => `${t.days} day${t.days === 1 ? '' : 's'}` },
    statusColumn<PaymentTerm>(),
  ],
  searchText: (t) => t.name,
  normalize: (t) => ({ ...t, name: t.name.trim() }),
  validate: (t, all) => {
    const e: Errors = {};
    uniqueRequired(e, t, all, 'name', 'Name');
    if (t.days < 0) e.days = "Days can't be negative.";
    return e;
  },
  editor: (t, update, errors) => {
    const f = bind(t, update);
    return (
      <FieldStack>
        {f.text('name', 'Name', { required: true, error: errors.name, placeholder: 'e.g. Net 90' })}
        {f.num('days', 'Due after', { suffix: 'days', error: errors.days, hint: 'Posting date + these days = due date. 0 for COD.' })}
        {f.status('active', 'Status')}
      </FieldStack>
    );
  },
};

export const dunningTermDef = namedDef({
  collection: lists.dunningTerms, idPrefix: 'dun', icon: 'mark_email_unread', title: 'Dunning terms', noun: 'dunning term', home: BANKING,
  description: 'Schedules for dunning letters on overdue invoices.', placeholder: 'e.g. Gentle (14 / 30 / 60 days)',
});
export const holidayCalendarDef = namedDef({
  collection: lists.holidayCalendars, idPrefix: 'hol', icon: 'calendar_month', title: 'Holiday calendars', noun: 'holiday calendar', home: BANKING,
  description: 'Non-business days that due dates skip.',
});

export const bankDef: MasterDef<Bank> = {
  collection: lists.banks,
  icon: 'account_balance',
  title: 'Banks',
  noun: 'bank',
  home: BANKING,
  description: 'Banks partners hold accounts with.',
  blank: (name) => ({ id: newId('bnk'), name, swift: '', active: true }),
  value: (b) => b.id,
  label: (b) => b.name,
  columns: [
    { key: 'name', header: 'Bank', cell: (b) => b.name },
    { key: 'swift', header: 'BIC / SWIFT', cell: (b) => b.swift || '—' },
    statusColumn<Bank>(),
  ],
  searchText: (b) => `${b.name} ${b.swift}`,
  normalize: (b) => ({ ...b, name: b.name.trim(), swift: b.swift.trim().toUpperCase() }),
  validate: (b, all) => {
    const e: Errors = {};
    uniqueRequired(e, b, all, 'name', 'Name');
    if (b.swift && !/^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/.test(b.swift.trim())) e.swift = 'Use 8 or 11 letters or digits.';
    return e;
  },
  editor: (b, update, errors) => {
    const f = bind(b, update);
    return (
      <FieldStack>
        {f.text('name', 'Name', { required: true, error: errors.name })}
        {f.text('swift', 'BIC / SWIFT', { error: errors.swift, placeholder: 'e.g. BNORPHMM' })}
        {f.status('active', 'Status')}
      </FieldStack>
    );
  },
};

export const bankChargeCodeDef = namedDef({
  collection: lists.bankChargeCodes, idPrefix: 'bcc', icon: 'payments', title: 'Bank charge allocation', noun: 'bank charge code', home: BANKING,
  description: 'Who bears bank transfer charges on payment runs.',
});
export const cardBrandDef = namedDef({
  collection: lists.cardBrands, idPrefix: 'crd', icon: 'credit_card', title: 'Card brands', noun: 'card brand', home: BANKING,
  description: 'Credit card types partners pay or are paid with.',
});
export const factoringCompanyDef = namedDef({
  collection: lists.factoringCompanies, idPrefix: 'fac', icon: 'handshake', title: 'Factoring companies', noun: 'factoring company', home: BANKING,
  description: 'Third parties receivables are sold to.',
});

// ── Company ──────────────────────────────────────────────────────────────────

export const projectDef: MasterDef<Project> = {
  collection: lists.projects,
  icon: 'folder_open',
  title: 'Projects',
  noun: 'project',
  home: COMPANY,
  description: 'Projects documents can be tagged with. Partners default one onto their documents.',
  blank: (name) => {
    const all = lists.projects.snapshot();
    const next = Math.max(0, ...all.map((p) => Number(/(\d+)$/.exec(p.code)?.[1] ?? 0))) + 1;
    return { id: newId('prj'), code: `PRJ-${String(next).padStart(3, '0')}`, name, active: true };
  },
  value: (p) => p.id,
  label: (p) => `${p.code} · ${p.name}`,
  columns: [
    { key: 'code', header: 'Code', cell: (p) => p.code },
    { key: 'name', header: 'Name', cell: (p) => p.name },
    statusColumn<Project>(),
  ],
  searchText: (p) => `${p.code} ${p.name}`,
  normalize: (p) => ({ ...p, code: p.code.trim().toUpperCase(), name: p.name.trim() }),
  validate: (p, all) => {
    const e: Errors = {};
    uniqueRequired(e, p, all, 'code', 'Code');
    if (!p.name.trim()) e.name = 'Name is required.';
    return e;
  },
  editor: (p, update, errors) => {
    const f = bind(p, update);
    return (
      <FieldStack>
        {f.text('code', 'Code', { required: true, error: errors.code })}
        {f.text('name', 'Name', { required: true, error: errors.name, placeholder: 'e.g. Davao store opening' })}
        {f.status('active', 'Status')}
      </FieldStack>
    );
  },
};

export const technicianDef = namedDef({
  collection: lists.technicians, idPrefix: 'tec', icon: 'engineering', title: 'Technicians', noun: 'technician', home: COMPANY,
  description: 'Service technicians assigned to partners.',
});
export const planningGroupDef = namedDef({
  collection: lists.planningGroups, idPrefix: 'plg', icon: 'insights', title: 'Planning groups', noun: 'planning group', home: COMPANY,
  description: 'Groups for MRP and forecasting.',
});
export const companyDef: MasterDef<Company> = {
  collection: companies,
  icon: 'domain',
  title: 'Companies',
  noun: 'company',
  home: COMPANY,
  description: "Our own companies, switched in the top bar. Documents use the current company's address as ours, e.g. a service-only purchase order's Ship To.",
  blank: (name) => ({ id: newId('co'), name, registeredOffice: '', address: blankPostalAddress(), active: true }),
  value: (c) => c.id,
  label: (c) => c.name,
  columns: [
    { key: 'name', header: 'Name', cell: (c) => c.name },
    {
      key: 'address',
      header: 'Registered address',
      cell: (c) => addressSummary(withRegisteredAddress(c, warehouses.snapshot()).address) || '—',
    },
    statusColumn<Company>(),
  ],
  searchText: (c) => `${c.name} ${addressSummary(withRegisteredAddress(c, warehouses.snapshot()).address)}`,
  // Keep a copy of the registered office's address on the company.
  normalize: (c) => ({ ...withRegisteredAddress(c, warehouses.snapshot()), name: c.name.trim() }),
  validate: (c, all) => {
    const e: Errors = {};
    uniqueRequired(e, c, all, 'name', 'Name');
    return e;
  },
  editor: (c, update, errors, isNew) => {
    const f = bind(c, update);
    return (
      <>
        <FieldStack>
          {f.text('name', 'Registered name', { required: true, error: errors.name })}
          <ReadOnly
            label="Registered address"
            value={(() => {
              const office = registeredOfficeOf(c, warehouses.snapshot());
              return office ? `${office.code} · ${addressSummary(office.address)}` : '—';
            })()}
            error={errors.registeredOffice}
            hint={isNew ? 'Save the company, then pick the office under Office addresses.' : 'The office marked Registered under Office addresses.'}
          />
          {f.status('active', 'Status')}
        </FieldStack>
      </>
    );
  },
};

/** Countries are keyed by their ISO 3166-1 alpha-2 code (PH, SG…): a new country's id is set from its code on save. */
export const countryDef: MasterDef<Country> = {
  collection: lists.countries,
  icon: 'public',
  title: 'Countries',
  noun: 'country',
  home: COMPANY,
  description: "Countries on addresses, banks and items' country of origin, by ISO code.",
  blank: (name) => ({ id: '', code: '', name, active: true }),
  value: (c) => c.id,
  label: (c) => c.name,
  columns: [
    { key: 'code', header: 'Code', cell: (c) => c.code },
    { key: 'name', header: 'Name', cell: (c) => c.name },
    statusColumn<Country>(),
  ],
  searchText: (c) => `${c.code} ${c.name}`,
  normalize: (c) => {
    const code = c.code.trim().toUpperCase();
    return { ...c, id: c.id || code, code, name: c.name.trim() };
  },
  validate: (c, all) => {
    const e: Errors = {};
    uniqueRequired(e, c, all, 'code', 'ISO code');
    if (!e.code && !/^[A-Za-z]{2}$/.test(c.code.trim())) e.code = 'Enter the two-letter ISO code, e.g. PH.';
    uniqueRequired(e, c, all, 'name', 'Name');
    return e;
  },
  editor: (c, update, errors, isNew) => {
    const f = bind(c, update);
    return (
      <FieldStack>
        {f.text('code', 'ISO code', {
          required: true,
          error: errors.code,
          placeholder: 'e.g. PH',
          disabled: !isNew,
          hint: isNew ? 'ISO 3166-1 alpha-2. Addresses store it, so it can\'t change later.' : 'Addresses store this code.',
        })}
        {f.text('name', 'Name', { required: true, error: errors.name })}
        {f.status('active', 'Status')}
      </FieldStack>
    );
  },
};

// ── Lists owned by other settings pages ──────────────────────────────────────

/** For "+ Add" on currency fields; the full editor (rates, system currency) is Settings › Accounting & Tax › Currencies. */
export const currencyDef: MasterDef<Currency> = {
  collection: currencies,
  icon: 'currency_exchange',
  title: 'Currencies',
  noun: 'currency',
  home: 'Settings › Accounting & Tax',
  description: 'Currencies partners and documents can use.',
  blank: (name) => ({ ...blankCurrency(), ...(/^[A-Za-z]{3}$/.test(name) ? { code: name.toUpperCase() } : { name }) }),
  value: (c) => c.code,
  label: (c) => `${c.code} · ${c.name}`,
  columns: [
    { key: 'code', header: 'Code', cell: (c) => c.code },
    { key: 'name', header: 'Name', cell: (c) => c.name },
    statusColumn<Currency>(),
  ],
  searchText: (c) => `${c.code} ${c.name}`,
  normalize: (c) => ({ ...c, code: c.code.trim().toUpperCase(), name: c.name.trim() }),
  validate: validateCurrency,
  editor: (c, update, errors) => {
    const f = bind(c, update);
    return (
      <FieldStack>
        {f.text('code', 'Code (ISO 4217)', { required: true, error: errors.code, placeholder: 'e.g. AUD' })}
        {f.text('name', 'Name', { required: true, error: errors.name, placeholder: 'e.g. Australian dollar' })}
        {f.text('symbol', 'Symbol')}
        {f.num('decimals', 'Decimals', { error: errors.decimals })}
      </FieldStack>
    );
  },
};

// ── Inventory ────────────────────────────────────────────────────────────────

const INVENTORY = 'Settings › Inventory';
const CODE_LOCK = "Can't change once saved — items refer to it. Deactivate instead.";

export const uomDef: MasterDef<UnitOfMeasure> = {
  collection: unitsOfMeasure,
  icon: 'straighten',
  title: 'Units of measure',
  noun: 'unit of measure',
  home: INVENTORY,
  description: 'Units items are stocked, bought and sold in. Items convert purchasing and sales units to their inventory unit.',
  // A new unit's id is set from its code on save: the code is the key.
  blank: (code) => ({ ...blankUom(code), id: '' }),
  value: (u) => u.id,
  label: (u) => `${u.code} · ${u.name}`,
  columns: [
    { key: 'code', header: 'Code', cell: (u) => u.code },
    { key: 'name', header: 'Name', cell: (u) => u.name },
    {
      key: 'dimensions',
      header: 'L × W × H',
      cell: (u) => (u.length || u.width || u.height ? `${u.length} × ${u.width} × ${u.height} ${u.lengthUnit}` : '—'),
    },
    { key: 'volume', header: 'Volume', cell: (u) => (u.volume ? `${u.volume} ${volumeUnit(u.lengthUnit)}` : '—') },
    { key: 'weight', header: 'Weight', cell: (u) => (u.weight ? `${u.weight} ${u.weightUnit}` : '—') },
    statusColumn<UnitOfMeasure>(),
  ],
  searchText: (u) => `${u.code} ${u.name}`,
  normalize: (u) => ({ ...u, id: u.id || u.code.trim(), code: u.code.trim(), name: u.name.trim() }),
  validate: (u, all) => {
    const e: Errors = {};
    uniqueRequired(e, u, all, 'code', 'Code');
    if (!u.name.trim()) e.name = 'Name is required.';
    return e;
  },
  editor: (u, update, errors, isNew) => {
    const f = bind(u, update);
    const computed = Math.round(u.length * u.width * u.height * 100) / 100;
    return (
      <FieldStack>
        {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. carton', disabled: !isNew, hint: !isNew ? CODE_LOCK : undefined })}
        {f.text('name', 'Name', { required: true, error: errors.name })}
        {f.pick('lengthUnit', 'Length unit', LENGTH_UNITS)}
        {f.pick('weightUnit', 'Weight unit', WEIGHT_UNITS)}
        {f.num('length', 'Length', { suffix: u.lengthUnit })}
        {f.num('width', 'Width', { suffix: u.lengthUnit })}
        {f.num('height', 'Height', { suffix: u.lengthUnit })}
        <div>
          <Button type="button" size="small" variant="ghost" disabled={!computed} onClick={() => update({ volume: computed })}>
            Calculate volume
          </Button>
        </div>
        {f.num('volume', 'Volume', {
          suffix: volumeUnit(u.lengthUnit),
          hint: computed && computed !== u.volume ? `L × W × H = ${computed} ${volumeUnit(u.lengthUnit)}.` : 'Optional. Enter it, or calculate it from the dimensions.',
        })}
        {f.num('weight', 'Weight', { suffix: u.weightUnit, hint: 'Gross weight of one unit, with packaging.' })}
        {f.status('active', 'Status')}
      </FieldStack>
    );
  },
};

export const manufacturerDef: MasterDef<Manufacturer> = {
  collection: manufacturers,
  icon: 'factory',
  title: 'Manufacturers',
  noun: 'manufacturer',
  home: INVENTORY,
  description: 'Who makes an item — separate from the vendor you buy it from.',
  // A new manufacturer's id is set from its code on save: the code is the key.
  blank: (name) => ({ id: '', code: '', name, countryCode: 'PH', contactPerson: '', email: '', phone: '', active: true }),
  value: (m) => m.id,
  label: (m) => `${m.code} · ${m.name}`,
  columns: [
    { key: 'code', header: 'Code', cell: (m) => m.code },
    { key: 'name', header: 'Name', cell: (m) => m.name },
    { key: 'country', header: 'Country', cell: (m) => (m.countryCode ? lists.countryName(m.countryCode) : '—') },
    { key: 'contactPerson', header: 'Contact', cell: (m) => [m.contactPerson, m.email].filter(Boolean).join(' · ') || '—' },
    statusColumn<Manufacturer>(),
  ],
  searchText: (m) => `${m.code} ${m.name} ${lists.countryName(m.countryCode)} ${m.contactPerson}`,
  normalize: (m) => {
    const code = m.code.trim().toUpperCase();
    return { ...m, id: m.id || code, code, name: m.name.trim() };
  },
  validate: (m, all) => {
    const e: Errors = {};
    uniqueRequired(e, m, all, 'code', 'Code');
    if (!m.name.trim()) e.name = 'Name is required.';
    if (m.email && !/^\S+@\S+\.\S+$/.test(m.email)) e.email = 'Enter a valid email address.';
    return e;
  },
  editor: (m, update, errors, isNew) => {
    const f = bind(m, update);
    return (
      <FieldStack>
        {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. MFR-007', disabled: !isNew, hint: !isNew ? CODE_LOCK : undefined })}
        {f.text('name', 'Name', { required: true, error: errors.name })}
        {f.master('countryCode', 'Country', countryDef)}
        {f.text('contactPerson', 'Contact person')}
        {f.text('email', 'Email', { type: 'email', error: errors.email })}
        {f.text('phone', 'Phone', { type: 'tel' })}
        {f.status('active', 'Status')}
      </FieldStack>
    );
  },
};

export const warrantyTemplateDef: MasterDef<WarrantyTemplate> = {
  collection: warrantyTemplates,
  icon: 'verified_user',
  title: 'Warranty templates',
  noun: 'warranty template',
  home: INVENTORY,
  description: "Warranty terms assigned to serial-numbered items when they're sold.",
  blank: (name) => ({ id: newId('wr'), name, months: 12, coverage: 'Parts', active: true }),
  value: (w) => w.id,
  label: (w) => `${w.name} · ${w.coverage}`,
  columns: [
    { key: 'name', header: 'Name', cell: (w) => w.name },
    { key: 'months', header: 'Period', cell: (w) => `${w.months} month${w.months === 1 ? '' : 's'}` },
    { key: 'coverage', header: 'Coverage', cell: (w) => w.coverage },
    statusColumn<WarrantyTemplate>(),
  ],
  searchText: (w) => `${w.name} ${w.coverage}`,
  normalize: (w) => ({ ...w, name: w.name.trim() }),
  validate: (w, all) => {
    const e: Errors = {};
    uniqueRequired(e, w, all, 'name', 'Name');
    if (w.months <= 0) e.months = 'Enter the warranty period in months.';
    return e;
  },
  editor: (w, update, errors) => {
    const f = bind(w, update);
    return (
      <FieldStack>
        {f.text('name', 'Name', { required: true, error: errors.name })}
        {f.num('months', 'Period', { suffix: 'months', error: errors.months })}
        {f.pick('coverage', 'Coverage', ['Parts', 'Parts & labor', 'Manufacturer'])}
        {f.status('active', 'Status')}
      </FieldStack>
    );
  },
};

export const shippingTypeDef: MasterDef<ShippingType> = {
  collection: shippingTypes,
  icon: 'local_shipping',
  title: 'Shipping types',
  noun: 'shipping type',
  home: INVENTORY,
  description: 'Delivery methods defaulted from items and business partners onto documents.',
  blank: (name) => ({ id: newId('sh'), name, trackingUrl: '', active: true }),
  value: (x) => x.id,
  label: (x) => x.name,
  columns: [
    { key: 'name', header: 'Name', cell: (x) => x.name },
    { key: 'trackingUrl', header: 'Tracking page', cell: (x) => x.trackingUrl || '—' },
    statusColumn<ShippingType>(),
  ],
  searchText: (x) => x.name,
  normalize: (x) => ({ ...x, name: x.name.trim() }),
  validate: (x, all) => {
    const e: Errors = {};
    uniqueRequired(e, x, all, 'name', 'Name');
    if (x.trackingUrl && !/^https?:\/\//.test(x.trackingUrl)) e.trackingUrl = 'Start the address with https://';
    return e;
  },
  editor: (x, update, errors) => {
    const f = bind(x, update);
    return (
      <FieldStack>
        {f.text('name', 'Name', { required: true, error: errors.name })}
        {f.text('trackingUrl', 'Tracking page', { type: 'url', error: errors.trackingUrl, placeholder: 'https://' })}
        {f.status('active', 'Status')}
      </FieldStack>
    );
  },
};
