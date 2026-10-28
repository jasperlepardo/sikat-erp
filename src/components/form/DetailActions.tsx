import { Button, type ButtonProps } from '@jasperlepardo/sikat-design-system';
import { useNavigate } from 'react-router';
import { PrevNext } from './DetailNav';
import { MoreMenu, type MoreMenuItem } from './MoreMenu';
import type { Noun } from './noun';

/**
 * Where a record stands, for its header buttons:
 * - `draft`: new or not yet posted: Save as draft · Submit for approval or Create <noun>;
 * - `pending`: awaiting approval: Reject · Approve for the approver, read-only for anyone else;
 * - `open`: posted and still editable: Save changes;
 * - `readonly`: closed, cancelled, or awaiting someone else's approval: no Cancel and no primary — except
 *   Save changes when `remarksOnly` (a closed document whose remarks can still change).
 */
export type DetailMode = 'draft' | 'pending' | 'open' | 'readonly';

/** Which mode a document with the five standard statuses is in. */
export const docMode = (status: string, { canApprove = true } = {}): DetailMode =>
  status === 'Draft' ? 'draft'
  : status === 'Not Confirmed' ? (canApprove ? 'pending' : 'readonly')
  : status === 'Closed' || status === 'Cancelled' ? 'readonly'
  : 'open';

interface DetailActionsProps {
  noun: Noun;
  /** Cancel goes back here. */
  listPath: string;
  mode: DetailMode;
  /** In `draft`: the primary submits for approval instead of creating. */
  needsApproval?: boolean;
  busy?: boolean;
  /** In `draft`: shows Save as draft. Omit for records without a draft step. */
  onDraft?: () => void;
  /** The primary in `draft` / `open`. Omit to make it the form's submit button. */
  onSubmit?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  /** In `readonly`: remarks and attachments can still change, so Save changes stays. */
  remarksOnly?: boolean;
  /** Replaces the primary's label (a journal voucher posts). */
  primaryLabel?: string;
  /** Replaces the primary's busy label ("Posting…"). */
  busyLabel?: string;
  /** The one secondary button, in place of Save as draft (a stock count's Create inventory posting). */
  secondary?: { label: string; onClick: () => void; disabled?: boolean };
  /** The ⋯ items, in the standard order: Create … · Pay · Duplicate · Recall · Close · Cancel … · Open …. */
  menu?: MoreMenuItem[];
  /** Previous / Next; omit on a new record. */
  prevNext?: { path: string; prevId?: string; nextId?: string };
  /** Set by the header (it sizes everything in `actions`); passed on to each button. */
  size?: ButtonProps['size'];
}

/**
 * A detail page's header buttons, left to right: Cancel · secondary · ⋯ · primary · Previous/Next.
 * The labels follow the record's state, so every document reads the same.
 */
export function DetailActions({
  noun, listPath, mode, needsApproval = false, busy = false, onDraft, onSubmit, onApprove, onReject, remarksOnly = false,
  primaryLabel, busyLabel, secondary, menu = [], prevNext, size,
}: DetailActionsProps) {
  const navigate = useNavigate();
  const button = { variant: 'solid', size, shape: 'pill', disabled: busy } as const;

  const primary =
    mode === 'draft'
      ? { label: primaryLabel ?? (needsApproval ? 'Submit for approval' : `Create ${noun.one}`), busy: needsApproval ? 'Submitting…' : 'Creating…', run: onSubmit }
      : mode === 'open' || (mode === 'readonly' && remarksOnly)
        ? { label: primaryLabel ?? 'Save changes', busy: 'Saving…', run: onSubmit }
        : mode === 'pending' && onApprove
          ? { label: 'Approve', busy: 'Approving…', run: onApprove }
          : null;

  const second =
    secondary ??
    (mode === 'draft' && onDraft ? { label: 'Save as draft', onClick: onDraft }
    : mode === 'pending' && onReject ? { label: 'Reject', onClick: onReject }
    : null);

  return (
    <>
      {mode === 'draft' || mode === 'open' ? (
        <Button {...button} type="button" intent="white" disabled={false} onClick={() => navigate(listPath)}>
          Cancel
        </Button>
      ) : null}
      {second ? (
        <Button {...button} type="button" intent="white" disabled={busy || second.disabled} onClick={second.onClick}>
          {second.label}
        </Button>
      ) : null}
      {menu.length ? <MoreMenu items={menu} button={size ? { size } : undefined} /> : null}
      {primary ? (
        <Button {...button} intent="primary" type={primary.run ? 'button' : 'submit'} onClick={primary.run}>
          {busy ? (busyLabel ?? primary.busy) : primary.label}
        </Button>
      ) : null}
      {prevNext ? <PrevNext {...prevNext} /> : null}
    </>
  );
}
