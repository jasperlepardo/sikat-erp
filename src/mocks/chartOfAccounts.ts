/**
 * A basic chart of accounts for a Philippine VAT-registered retailer (the Apple
 * Premium Reseller demo). Laid out like SAP B1: drawers (Assets … Income tax) hold
 * title accounts, which hold the active accounts documents post to.
 *
 * Codes and names match the accounts the rest of the app already posts to (item
 * groups, tax codes, business partners), so those dropdowns read from here.
 */

import { ruleId, type AccountDimension } from './costAccounting';

export type Drawer =
  | 'Assets'
  | 'Liabilities'
  | 'Equity'
  | 'Revenue'
  | 'Cost of sales'
  | 'Operating expenses'
  | 'Other income'
  | 'Other expenses'
  | 'Income tax';
export const DRAWERS: Drawer[] = [
  'Assets', 'Liabilities', 'Equity', 'Revenue', 'Cost of sales', 'Operating expenses', 'Other income', 'Other expenses', 'Income tax',
];

/** Debit-normal drawers; the rest are credit-normal. Contra accounts flip it. */
const DEBIT_DRAWERS: Drawer[] = ['Assets', 'Cost of sales', 'Operating expenses', 'Other expenses', 'Income tax'];

/** What statement the drawer rolls up to. */
export const statementOf = (d: Drawer) =>
  ['Assets', 'Liabilities', 'Equity'].includes(d) ? 'Balance sheet' : 'Income statement';

/** A G/L account, keyed by its number: `id` is always `code` (1310…), which every posting, item group, tax code and partner stores. */
export interface Account {
  id: string;
  code: string;
  name: string;
  drawer: Drawer;
  /** Code of the title account this sits under; '' for a drawer's top title. */
  parentCode: string;
  /** Title accounts group others and can't be posted to. */
  title: boolean;
  /** Offsets its drawer's normal balance (accumulated depreciation, allowances, returns). */
  contra: boolean;
  /** Control accounts (AR, AP) only take postings through business partners. */
  control: boolean;
  /** Cash and bank accounts (cash flow, bank reconciliation). */
  cash: boolean;
  /** 'All currencies' or a single currency code. */
  currency: string;
  active: boolean;
  remarks: string;
  /** Alternate code for external reporting and consolidation. */
  externalCode: string;
  /** Name in a second language, for translated reports. */
  foreignName: string;
  /** Code used in official electronic exports (e.g. BIR alphalists). */
  exportCode: string;

  // Reporting
  /** SAP account type: Sales (revenue), Expenditure (costs), Other (balance sheet). */
  accountType: AccountType;
  /** Balance sheet accounts: current or non-current. '' for income statement and equity. */
  classification: Classification;
  /** Where movements show on the cash flow statement; '' = not shown (cash itself, retained earnings). */
  cashFlow: CashFlowCategory;
  /** Line the account rolls up to on the financial statements. */
  statementLine: string;
  /** Postings must name a cash flow line item. */
  cashFlowRelevant: boolean;
  /** Cash flow forecasting group ('' = none). */
  planningLevel: PlanningLevel;

  // Posting controls
  /** Only documents post here (e.g. inventory, AR/AP, VAT) — no manual journal entries. */
  blockManualPosting: boolean;
  /** Postings dated outside this window are refused ('' = open-ended). */
  validFrom: string;
  validTo: string;
  /** Cost accounting dimensions: which a posting must fill in, and the rule proposed for each. */
  dimensions: AccountDimension[];
  /** Postings must name a project; `defaultProjectId` is proposed ('' = none). */
  projectRequired: boolean;
  defaultProjectId: string;
  /** Refuse postings that take the balance outside minBalance…maxBalance (debit positive). */
  balanceRange: boolean;
  minBalance: number;
  maxBalance: number;
  /** Only cost accounting adjustments post here — no documents or ordinary journal entries. */
  costAccountingOnly: boolean;
  /** Only users with access to confidential accounts see balances and postings. */
  confidential: boolean;

  // Period-end and tax
  /** Revalued at period-end for exchange rate changes (foreign currency accounts). */
  revalue: boolean;
  /** Balances are adjusted for inflation indexing. */
  indexed: boolean;
  /** Reconciled against bank statements. */
  reconcile: boolean;
  /** Tax code proposed on manual postings ('' = not VAT-relevant). */
  defaultTaxCode: string;
  /** Withholding group (code) for purchases costed here when the item has none ('' = none). */
  defaultWithholdingGroup: string;
}

export type AccountType = 'Sales' | 'Expenditure' | 'Other';
export const ACCOUNT_TYPES: AccountType[] = ['Sales', 'Expenditure', 'Other'];
type Classification = '' | 'Current' | 'Non-current';
export type CashFlowCategory = '' | 'Operating' | 'Investing' | 'Financing';
export const CASH_FLOW_CATEGORIES: CashFlowCategory[] = ['', 'Operating', 'Investing', 'Financing'];
export type PlanningLevel = '' | 'Cash and bank' | 'Receivables' | 'Payables' | 'Expenses' | 'Other';
export const PLANNING_LEVELS: PlanningLevel[] = ['', 'Cash and bank', 'Receivables', 'Payables', 'Expenses', 'Other'];

/**
 * Financial statement lines, in statement order — a PFRS for SMEs-style layout
 * (not an official template); edit to match your auditor's format.
 */
export const STATEMENT_LINES: Record<Drawer, string[]> = {
  Assets: [
    'Cash and cash equivalents',
    'Trade and other receivables',
    'Inventories',
    'Prepayments and other current assets',
    'Property and equipment',
    'Deferred tax assets',
    'Other non-current assets',
  ],
  Liabilities: ['Trade and other payables', 'Contract liabilities', 'Income tax payable', 'Borrowings', 'Deferred tax liabilities'],
  Equity: ['Share capital', 'Additional paid-in capital', 'Retained earnings'],
  Revenue: ['Revenue'],
  'Cost of sales': ['Cost of sales'],
  'Operating expenses': ['Selling and administrative expenses'],
  'Other income': ['Other income'],
  'Other expenses': ['Finance costs', 'Other expenses'],
  'Income tax': ['Income tax expense'],
};

export const defaultAccountType = (d: Drawer): AccountType =>
  d === 'Revenue' || d === 'Other income' ? 'Sales' : ['Assets', 'Liabilities', 'Equity'].includes(d) ? 'Other' : 'Expenditure';

export const normalBalance = (a: Pick<Account, 'drawer' | 'contra'>) =>
  DEBIT_DRAWERS.includes(a.drawer) !== a.contra ? 'Debit' : 'Credit';

/** "1310 Inventory – Merchandise" — how documents and settings refer to an account. */
export const accountLabel = (a: Pick<Account, 'code' | 'name'>) => `${a.code} ${a.name}`;

type Flag = 'contra' | 'control' | 'cash' | 'usd';
type Node = [code: string, name: string, children?: Node[] | Flag[]];

/** Flatten a drawer's tree: nodes with children are titles; leaves are active accounts. */
function drawer(drawerName: Drawer, root: Node): Account[] {
  const out: Account[] = [];
  const walk = ([code, name, rest = []]: Node, parentCode: string) => {
    const children = rest.filter((x): x is Node => Array.isArray(x));
    const flags = rest.filter((x): x is Flag => typeof x === 'string');
    const title = children.length > 0 || parentCode === '';
    out.push({
      id: code,
      code,
      name,
      drawer: drawerName,
      parentCode,
      title,
      contra: flags.includes('contra'),
      control: flags.includes('control'),
      cash: flags.includes('cash'),
      currency: flags.includes('usd') ? 'USD' : title ? 'All currencies' : 'PHP',
      active: true,
      remarks: '',
      externalCode: '',
      foreignName: '',
      exportCode: '',
      accountType: defaultAccountType(drawerName),
      classification: '',
      cashFlow: '',
      statementLine: '',
      cashFlowRelevant: false,
      planningLevel: '',
      blockManualPosting: false,
      validFrom: '',
      validTo: '',
      dimensions: [],
      projectRequired: false,
      defaultProjectId: '',
      balanceRange: false,
      minBalance: 0,
      maxBalance: 0,
      costAccountingOnly: false,
      confidential: false,
      revalue: false,
      indexed: false,
      reconcile: false,
      defaultTaxCode: '',
      defaultWithholdingGroup: '',
    });
    children.forEach((c) => walk(c, code));
  };
  walk(root, '');
  return out;
}

const CHART: Account[] = [
  ...drawer('Assets', ['1000', 'Assets', [
    ['1010', 'Cash and Cash Equivalents', [
      ['1011', 'Cash on Hand – Petty Cash', ['cash']],
      ['1012', 'Cash on Hand – Store Collections', ['cash']],
      ['1013', 'Cash in E-wallet – GCash', ['cash']],
      ['1015', 'Cash in Bank – BDO Unibank', ['cash']],
      ['1016', 'Cash in Bank – BPI', ['cash']],
      ['1017', 'Cash in Bank – UnionBank', ['cash']],
      ['1018', 'Cash in Bank – BDO Unibank (USD)', ['cash', 'usd']],
    ]],
    ['1100', 'Receivables', [
      ['1120', 'Accounts Receivable – Trade', ['control']],
      ['1125', 'Accounts Receivable – Related Parties', ['control']],
      ['1130', 'Card and E-wallet Settlements Receivable'],
      ['1140', 'Other Receivables'],
      ['1150', 'Advances to Suppliers'],
      ['1160', 'Allowance for Doubtful Accounts', ['contra']],
    ]],
    ['1300', 'Inventories', [
      ['1310', 'Inventory – Merchandise'],
      ['1320', 'Inventory – Raw Materials'],
      ['1330', 'Inventory – Finished Goods'],
      ['1340', 'Goods in Transit'],
      ['1350', 'Allowance for Inventory Obsolescence', ['contra']],
    ]],
    ['1400', 'Tax Credits and Prepayments', [
      ['1410', 'Input VAT'],
      ['1415', 'Deferred Input VAT – Capital Goods (pre-2022 balances)'],
      ['1420', 'Input VAT – Importation'],
      ['1430', 'Creditable Withholding VAT'],
      ['1440', 'Creditable Withholding Tax'],
      ['1450', 'Prepaid Expenses'],
      ['1460', 'Prepaid Income Tax'],
    ]],
    ['1500', 'Property and Equipment', [
      ['1510', 'Furniture and Fixtures'],
      ['1511', 'Accumulated Depreciation – Furniture and Fixtures', ['contra']],
      ['1520', 'Leasehold Improvements'],
      ['1521', 'Accumulated Depreciation – Leasehold Improvements', ['contra']],
      ['1530', 'IT and Office Equipment'],
      ['1531', 'Accumulated Depreciation – IT and Office Equipment', ['contra']],
      ['1540', 'Transportation Equipment'],
      ['1541', 'Accumulated Depreciation – Transportation Equipment', ['contra']],
    ]],
    ['1600', 'Other Non-current Assets', [
      ['1610', 'Rental Deposits'],
      ['1620', 'Deferred Tax Asset'],
    ]],
  ]]),

  ...drawer('Liabilities', ['2000', 'Liabilities', [
    ['2005', 'Payables', [
      ['2010', 'Accounts Payable – Trade', ['control']],
      ['2015', 'Accounts Payable – Import', ['control']],
      ['2020', 'Accounts Payable – Non-trade'],
      ['2025', 'Goods Received Not Invoiced'],
      ['2030', 'Accrued Expenses'],
      ['2035', 'Corporate Credit Card Payable'],
    ]],
    ['2100', 'Deposits and Unearned Revenue', [
      ['2150', 'Customer Down Payments'],
      ['2155', 'Down Payments – Interim'],
      ['2160', 'Gift Certificates Outstanding'],
    ]],
    ['2300', 'Taxes Payable', [
      ['2310', 'Output VAT Payable'],
      ['2320', 'Percentage Tax Payable'],
      ['2330', 'VAT Withheld Payable'],
      ['2340', 'Expanded Withholding Tax Payable'],
      ['2345', 'Final Withholding Tax Payable'],
      ['2350', 'Withholding Tax on Compensation Payable'],
      ['2360', 'Income Tax Payable'],
    ]],
    ['2400', 'Payroll Liabilities', [
      ['2410', 'Salaries and Wages Payable'],
      ['2420', 'SSS Contributions Payable'],
      ['2430', 'PhilHealth Contributions Payable'],
      ['2440', 'Pag-IBIG Contributions Payable'],
    ]],
    ['2500', 'Borrowings', [
      ['2510', 'Loans Payable – Current'],
      ['2520', 'Loans Payable – Non-current'],
    ]],
    ['2600', 'Other Non-current Liabilities', [
      ['2610', 'Deferred Tax Liability'],
    ]],
  ]]),

  ...drawer('Equity', ['3000', 'Equity', [
    ['3010', 'Share Capital'],
    ['3020', 'Additional Paid-in Capital'],
    ['3100', 'Retained Earnings'],
    ['3110', 'Dividends Declared', ['contra']],
  ]]),

  ...drawer('Revenue', ['4000', 'Revenue', [
    ['4010', 'Sales – Merchandise'],
    ['4020', 'Sales – Manufactured'],
    ['4030', 'Service Revenue'],
    ['4040', 'Sales Returns and Allowances', ['contra']],
    ['4050', 'Sales Discounts', ['contra']],
  ]]),

  ...drawer('Cost of sales', ['5000', 'Cost of Sales', [
    ['5010', 'COGS – Merchandise'],
    ['5020', 'COGS – Manufactured'],
    ['5030', 'Cost of Services'],
    ['5040', 'Freight-in'],
    ['5050', 'Inventory Adjustments and Shrinkage'],
    ['5060', 'Purchase Discounts', ['contra']],
  ]]),

  ...drawer('Operating expenses', ['6000', 'Operating Expenses', [
    ['6005', 'Personnel', [
      ['6010', 'Salaries and Wages'],
      ['6020', '13th Month Pay and Other Benefits'],
      ['6030', 'SSS, PhilHealth and Pag-IBIG Contributions'],
      ['6040', 'Employee Benefits'],
    ]],
    ['6095', 'Occupancy', [
      ['6100', 'Rent – Store Space'],
      ['6110', 'Utilities'],
      ['6120', 'Repairs and Maintenance'],
      ['6130', 'Security Services'],
    ]],
    ['6195', 'Selling and Administrative', [
      ['6200', 'Advertising and Promotions'],
      ['6210', 'Delivery and Freight-out'],
      ['6220', 'Card and E-wallet Fees'],
      ['6225', 'Bank Charges'],
      ['6230', 'Store Supplies'],
      ['6240', 'Communication'],
      ['6250', 'Professional Fees'],
      ['6260', 'Software and Cloud Subscriptions'],
      ['6270', 'Transportation and Travel'],
      ['6280', 'Representation and Entertainment'],
      ['6290', 'Insurance'],
      ['6300', 'Taxes and Licenses'],
      ['6310', 'Depreciation Expense'],
      ['6320', 'Bad Debts Expense'],
      ['6390', 'Miscellaneous Expense'],
    ]],
  ]]),

  ...drawer('Other income', ['7000', 'Other Income', [
    ['7010', 'Interest Income'],
    ['7020', 'Foreign Exchange Gain'],
    ['7030', 'Other Income'],
  ]]),

  ...drawer('Other expenses', ['8000', 'Other Expenses', [
    ['8010', 'Interest Expense'],
    ['8020', 'Foreign Exchange Loss'],
    ['8030', 'Bank Charges'],
  ]]),

  ...drawer('Income tax', ['9000', 'Income Tax Expense', [
    ['9010', 'Provision for Income Tax – Current'],
    ['9020', 'Provision for Income Tax – Deferred'],
  ]]),
];

/** First match wins: [title or account code the account sits under (or is), value]. */
type Rule<T> = [under: string, value: T][];

const STATEMENT_LINE_RULES: Rule<string> = [
  ['1010', 'Cash and cash equivalents'], ['1100', 'Trade and other receivables'], ['1300', 'Inventories'],
  ['1400', 'Prepayments and other current assets'], ['1500', 'Property and equipment'], ['1620', 'Deferred tax assets'],
  ['1600', 'Other non-current assets'],
  ['2100', 'Contract liabilities'], ['2360', 'Income tax payable'], ['2500', 'Borrowings'], ['2610', 'Deferred tax liabilities'],
  ['2000', 'Trade and other payables'],
  ['3010', 'Share capital'], ['3020', 'Additional paid-in capital'], ['3000', 'Retained earnings'],
  ['4000', 'Revenue'], ['5000', 'Cost of sales'], ['6000', 'Selling and administrative expenses'], ['7000', 'Other income'],
  ['8010', 'Finance costs'], ['8000', 'Other expenses'], ['9000', 'Income tax expense'],
];
const NON_CURRENT: string[] = ['1500', '1600', '2520', '2600'];
const CASH_FLOW_RULES: Rule<CashFlowCategory> = [
  ['1010', ''], ['1500', 'Investing'], ['2500', 'Financing'], ['3010', 'Financing'], ['3020', 'Financing'], ['3110', 'Financing'],
  ['3100', ''], ['1000', 'Operating'], ['2000', 'Operating'],
  // Income statement accounts reach cash flow through net income (indirect method).
  ['4000', 'Operating'], ['5000', 'Operating'], ['6000', 'Operating'], ['7000', 'Operating'], ['8000', 'Operating'], ['9000', 'Operating'],
];
/** Posted by documents only: control accounts, inventory and the VAT accounts tax codes post to. */
const DOCUMENT_ONLY = ['1300', '1410', '1420', '1430', '2310', '2320', '2330'];
const CONFIDENTIAL = ['6005', '2410'];
/** Tax code proposed on manual postings. */
const DEFAULT_TAX: Rule<string> = [
  ['4010', 'OVAT'], ['4030', 'OVAT'],
  // Store supplies are goods; freight and the operating expenses below are services.
  ['6230', 'IVAT'],
  ['5040', 'IVAT-S'],
  ['6100', 'IVAT-S'], ['6110', 'IVAT-S'], ['6120', 'IVAT-S'], ['6130', 'IVAT-S'], ['6200', 'IVAT-S'], ['6210', 'IVAT-S'], ['6240', 'IVAT-S'],
  ['6250', 'IVAT-S'], ['6260', 'IVAT-S'], ['6270', 'IVAT-S'],
];

/**
 * Sales and cost of sales are tagged by business unit (retail unless picked) and product;
 * operating expenses by office (head office unless picked) and department.
 */
const DIMENSIONS_BY_DRAWER: Partial<Record<Drawer, AccountDimension[]>> = {
  Revenue: [{ dimension: 1, required: true, defaultRuleId: ruleId('RETAIL') }, { dimension: 2, required: true, defaultRuleId: '' }],
  'Cost of sales': [{ dimension: 1, required: true, defaultRuleId: ruleId('RETAIL') }, { dimension: 2, required: true, defaultRuleId: '' }],
  'Operating expenses': [{ dimension: 3, required: true, defaultRuleId: ruleId('HO') }, { dimension: 4, required: true, defaultRuleId: '' }],
};
/** Store fit-outs are capitalised project by project. */
const PROJECT_REQUIRED = ['1520'];
/** Petty cash is a store float: never overdrawn, never above ₱100,000. */
const balanceRangeOf = (code: string): Pick<Account, 'balanceRange' | 'minBalance' | 'maxBalance'> =>
  code === '1011' ? { balanceRange: true, minBalance: 0, maxBalance: 100000 } : { balanceRange: false, minBalance: 0, maxBalance: 0 };

/** The chart with reporting, posting and period-end settings filled in by rule. */
export const SEED_ACCOUNTS: Account[] = CHART.map((a) => {
  const within = (code: string) => a.code === code || isUnder(a, code, CHART);
  const pick = <T,>(rules: Rule<T>, fallback: T) => rules.find(([code]) => within(code))?.[1] ?? fallback;
  const balanceSheet = ['Assets', 'Liabilities'].includes(a.drawer);
  if (a.title) return { ...a, statementLine: '', cashFlow: '' as const };
  return {
    ...a,
    classification: balanceSheet ? (NON_CURRENT.some(within) ? 'Non-current' : 'Current') : '',
    cashFlow: a.cash ? '' : pick(CASH_FLOW_RULES, ''),
    statementLine: pick(STATEMENT_LINE_RULES, ''),
    cashFlowRelevant: a.cash,
    planningLevel: a.cash ? 'Cash and bank' : a.control ? (a.drawer === 'Assets' ? 'Receivables' : 'Payables') : a.drawer === 'Operating expenses' ? 'Expenses' : '',
    blockManualPosting: a.control || DOCUMENT_ONLY.some(within),
    dimensions: DIMENSIONS_BY_DRAWER[a.drawer] ?? [],
    projectRequired: PROJECT_REQUIRED.includes(a.code),
    ...balanceRangeOf(a.code),
    confidential: CONFIDENTIAL.some(within),
    revalue: a.currency !== 'PHP' && a.currency !== 'All currencies',
    reconcile: a.cash && a.name.startsWith('Cash in Bank'),
    defaultTaxCode: pick(DEFAULT_TAX, ''),
    defaultWithholdingGroup: '',
  };
});

/** Whether `a` sits anywhere below the title account `titleCode`. */
export function isUnder(a: Account, titleCode: string, all: Account[]) {
  let parent = a.parentCode;
  for (let i = 0; parent && i < 10; i++) {
    if (parent === titleCode) return true;
    parent = all.find((x) => x.code === parent)?.parentCode ?? '';
  }
  return false;
}

/** The G/L account fields other records have, and which accounts fit each. */
export type AccountRole =
  | 'inventory'
  | 'cogs'
  | 'expense'
  | 'revenue'
  | 'receivable'
  | 'payable'
  | 'downPaymentClearing'
  | 'downPaymentInterim'
  | 'tax'
  | 'cash'
  | 'general';

const ACCOUNT_ROLES: Record<AccountRole, { what: string; fits: (a: Account, all: Account[]) => boolean }> = {
  inventory: { what: 'an inventory account (under 1300 Inventories)', fits: (a, all) => isUnder(a, '1300', all) },
  cogs: { what: 'a cost of sales account', fits: (a) => a.drawer === 'Cost of sales' },
  // What a non-stock purchase costs to: cost of sales when it's resold (setup, delivery), an
  // operating or other expense when the business uses it (rent, security, audit, interest).
  expense: {
    what: 'a cost of sales or expense account',
    fits: (a) => a.drawer === 'Cost of sales' || a.drawer === 'Operating expenses' || a.drawer === 'Other expenses',
  },
  revenue: {
    what: 'a revenue account (or unearned revenue under 2100)',
    fits: (a, all) => a.drawer === 'Revenue' || isUnder(a, '2100', all),
  },
  receivable: { what: 'a receivable control account', fits: (a) => a.control && a.drawer === 'Assets' },
  payable: { what: 'a payable control account', fits: (a) => a.control && a.drawer === 'Liabilities' },
  downPaymentClearing: {
    what: 'a down payment account (under 1100 Receivables or 2100 Deposits)',
    fits: (a, all) => !a.control && (isUnder(a, '1100', all) || isUnder(a, '2100', all)),
  },
  downPaymentInterim: { what: 'a deposit account (under 2100)', fits: (a, all) => isUnder(a, '2100', all) },
  cash: { what: 'a cash or bank account', fits: (a) => a.cash },
  general: { what: 'an account that isn’t a control account (control accounts post through partners)', fits: (a) => !a.control },
  tax: {
    what: 'a tax account (under 1400 Tax credits or 2300 Taxes payable)',
    fits: (a, all) => isUnder(a, '1400', all) || isUnder(a, '2300', all),
  },
};

/** Active postable accounts that fit a role; contra accounts (allowances, returns) never do. */
export const fitsRole = (a: Account, role: AccountRole, all: Account[]) => !a.contra && ACCOUNT_ROLES[role].fits(a, all);

/** "1310 Inventory – Merchandise" for a stored account code; flags codes missing from the chart. */
export function accountText(code: string, all: Account[] | undefined) {
  if (!code) return '—';
  const a = all?.find((x) => x.code === code);
  if (!all) return code;
  return a ? `${accountLabel(a)}${a.active ? '' : ' (inactive)'}` : `${code} (not in the chart of accounts)`;
}

/** Old seeds stored "1310 Inventory – Merchandise" / "— None —"; records now store the code. */
export const toAccountCode = (value: string) => (!value || value.startsWith('—') ? '' : value.split(' ')[0]);

/**
 * Why `code` can't be used for `role`, or undefined when it can. Blank is a
 * problem only when `required`.
 */
export function accountProblem(code: string, role: AccountRole, all: Account[], required = false): string | undefined {
  if (!code) return required ? 'Pick an account.' : undefined;
  const a = all.find((x) => x.code === code);
  if (!a) return `${code} isn’t in the chart of accounts — pick another.`;
  if (!a.active) return `${accountLabel(a)} is inactive — pick an active account.`;
  if (a.title) return `${accountLabel(a)} is a title account — pick an account under it.`;
  if (!fitsRole(a, role, all)) return `${accountLabel(a)} isn’t ${ACCOUNT_ROLES[role].what}.`;
  return undefined;
}
