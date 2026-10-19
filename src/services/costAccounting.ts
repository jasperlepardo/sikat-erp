import { SEED_DISTRIBUTION_RULES, type DistributionRule } from '../mocks/costAccounting';
import { createCollection } from './store';

// Financials › Cost Accounting (Settings › Company)
export const distributionRules = createCollection<DistributionRule>('sikat-erp:distribution-rules', SEED_DISTRIBUTION_RULES, 'ocr');
