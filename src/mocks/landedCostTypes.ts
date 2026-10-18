export interface LandedCostType {
  id: string;
  name: string;
  expenseAccount: string;
  active: boolean;
}

export const SEED_LC_TYPES: LandedCostType[] = [
  { id: 'lct-001', name: 'Freight', expenseAccount: '5110', active: true },
  { id: 'lct-002', name: 'Customs Duties', expenseAccount: '5120', active: true },
  { id: 'lct-003', name: 'Insurance', expenseAccount: '5130', active: true },
  { id: 'lct-004', name: 'Brokerage', expenseAccount: '5140', active: true },
  { id: 'lct-005', name: 'Handling', expenseAccount: '5150', active: true },
];
