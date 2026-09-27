/**
 * A basic chart of accounts for a Philippine VAT-registered retailer (the Apple
 * Premium Reseller demo). Laid out like SAP B1: drawers (Assets … Income tax) hold
 * title accounts, which hold the active accounts documents post to.
 *
 * Codes and names match the accounts the rest of the app already posts to (item
 * groups, tax codes, business partners), so those dropdowns read from here.
 */

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
}

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
      id: `acct-${code}`,
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
    });
    children.forEach((c) => walk(c, code));
  };
  walk(root, '');
  return out;
}

export const SEED_ACCOUNTS: Account[] = [
  ...drawer('Assets', ['1000', 'Assets', [
    ['1010', 'Cash and Cash Equivalents', [
      ['1011', 'Cash on Hand – Petty Cash', ['cash']],
      ['1012', 'Cash on Hand – Store Collections', ['cash']],
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
      ['2030', 'Accrued Expenses'],
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
    ]],
    ['6195', 'Selling and Administrative', [
      ['6200', 'Advertising and Promotions'],
      ['6210', 'Delivery and Freight-out'],
      ['6220', 'Card and E-wallet Fees'],
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
  | 'revenue'
  | 'receivable'
  | 'payable'
  | 'downPaymentClearing'
  | 'downPaymentInterim'
  | 'tax';

export const ACCOUNT_ROLES: Record<AccountRole, { what: string; fits: (a: Account, all: Account[]) => boolean }> = {
  inventory: { what: 'an inventory account (under 1300 Inventories)', fits: (a, all) => isUnder(a, '1300', all) },
  cogs: { what: 'a cost of sales account', fits: (a) => a.drawer === 'Cost of sales' },
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
