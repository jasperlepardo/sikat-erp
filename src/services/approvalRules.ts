import { SEED_APPROVAL_RULES, type ApprovalRule, type DocType } from '../mocks/approvalRules';
import type { ActivityTargetKind } from '../mocks/activities';
import { CURRENT_USER_ID } from '../mocks/common';
import { createCollection } from './store';
import { saveActivity } from './activities';
import { salesEmployees } from './partnerMasters';
import { todayISO } from './dates';

export const approvalRules = createCollection<ApprovalRule>('sikat-erp:approval-rules', SEED_APPROVAL_RULES, 'ar');

export const getApprovalRule = (docType: DocType): ApprovalRule =>
  approvalRules.snapshot().find((r) => r.id === docType) ?? { id: docType, approverId: '' };

export const approverName = (docType: DocType): string =>
  salesEmployees.snapshot().find((e) => e.id === getApprovalRule(docType).approverId)?.name ?? '';

export async function logRejection(docKind: ActivityTargetKind, docId: string, partnerId: string, reason: string) {
  if (!reason.trim()) return;
  await saveActivity({
    kind: 'note',
    subject: 'Rejected',
    notes: reason,
    date: todayISO(),
    time: '',
    dueDate: '',
    done: false,
    ownerId: CURRENT_USER_ID,
    partnerId,
    contactId: '',
    links: [{ kind: docKind, id: docId }],
    createdBy: CURRENT_USER_ID,
    createdAt: new Date().toISOString(),
  });
}
