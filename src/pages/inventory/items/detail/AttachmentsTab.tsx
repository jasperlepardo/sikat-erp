import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import type { TabProps } from './types';

export function AttachmentsTab({ draft, update }: TabProps) {
  return (
    <AttachmentsCard
      withDescription
      attachments={draft.attachments}
      onChange={(attachments) => update({ attachments })}
      emptyHint="No attachments. Add data sheets, drawings, safety data sheets (SDS) or certificates."
    />
  );
}
