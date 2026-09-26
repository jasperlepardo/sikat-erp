import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import type { TabProps } from './GeneralTab';

export function AttachmentsTab({ draft, update }: TabProps) {
  return (
    <AttachmentsCard
      attachments={draft.attachments}
      onChange={(attachments) => update({ attachments })}
      emptyHint="No attachments. Add contracts, BIR 2303 certificates, permits or IDs."
    />
  );
}
