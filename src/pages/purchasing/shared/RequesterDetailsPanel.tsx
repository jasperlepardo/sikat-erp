import { useNavigate } from 'react-router';
import { Checkbox, Icon, IconButton, Panel, SidePanel } from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../components/form/PageHeader';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../components/form/fields';
import type { Employee } from '../../../mocks/employees';
import { employeeName } from '../../../services/employees';
import { nameIn } from '../../../services/partnerMasters';
import { branches, departments } from '../../../services/peopleMasters';

/** The draft fields every requester document shares. */
interface RequesterDraftBase {
  branchId: string;
  departmentId: string;
  notifyOnPo: boolean;
  notifyEmail: string;
}

interface RequesterDetailsPanelProps<D extends RequesterDraftBase> {
  draft: D;
  update: (patch: Partial<D>) => void;
  requester: Employee | undefined;
  /** The whole panel is read-only (document closed/cancelled). */
  readOnly: boolean;
  open: boolean;
  onClose: () => void;
}

/** The requester side panel on a document: the requester's branch and department, and PO/receipt notifications. */
export function RequesterDetailsPanel<D extends RequesterDraftBase>({ draft, update, requester, readOnly, open, onClose }: RequesterDetailsPanelProps<D>) {
  const navigate = useNavigate();
  // Bind the shared notification fields through the base type.
  const h = bind<RequesterDraftBase>(draft, update as (patch: Partial<RequesterDraftBase>) => void);

  if (!open || !requester) return null;

  return (
    <SidePanel overlay onOverlayClick={onClose}>
      <PageHeader
        variant="plain"
        icon="person"
        title={employeeName(requester)}
        actions={
          <>
            <IconButton type="button" intent="default" variant="link" label={`Open employee ${requester.code}`} onClick={() => navigate(`/people/employees/${requester.id}`)}>
              <Icon size={20}>open_in_new</Icon>
            </IconButton>
            <IconButton type="button" intent="default" variant="link" label="Close" onClick={onClose}>
              <Icon size={20}>close</Icon>
            </IconButton>
          </>
        }
      />
      <Panel.Body>
        <fieldset disabled={readOnly} className="contents">
          <Section icon="badge" title="Requester">
            <Fields cols={1}>
              <ReadOnly label="Branch" value={draft.branchId ? nameIn(branches, draft.branchId) : '—'} hint="The requester's branch." />
              <ReadOnly label="Department" value={draft.departmentId ? nameIn(departments, draft.departmentId) : '—'} hint="The requester's department. Charge costs to another department on the lines." />
            </Fields>
          </Section>
          <Section icon="notifications" title="Notifications">
            <Fields cols={1}>
              <Flags>
                <Checkbox
                  checked={draft.notifyOnPo}
                  onChange={(e) => {
                    const notifyOnPo = e.currentTarget.checked;
                    update({ notifyOnPo, ...(notifyOnPo && !draft.notifyEmail ? { notifyEmail: requester.email } : {}) } as Partial<D>);
                  }}
                >
                  Send e-mail when PO or goods receipt is added
                </Checkbox>
              </Flags>
              {draft.notifyOnPo ? h.text('notifyEmail', 'Email address', { hint: "Notification email. Defaults to the requester's email." }) : null}
            </Fields>
          </Section>
        </fieldset>
      </Panel.Body>
    </SidePanel>
  );
}
