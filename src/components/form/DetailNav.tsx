import { Button, ButtonGroup, IconButton, Panel, PanelHeader, panelHeaderIcons } from '@jasperlepardo/sikat-design-system';
import { useNavigate } from 'react-router';

/** The records either side of `key` in a list's order (ids, or document numbers once posted). */
export function neighbours(siblings: readonly string[], key: string | undefined) {
  const at = key ? siblings.indexOf(key) : -1;
  return {
    prevId: at > 0 ? siblings[at - 1] : undefined,
    nextId: at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined,
  };
}

/** Previous / Next in a detail page's header: open the record before or after this one, under `path`. */
export function PrevNext({ path, prevId, nextId }: { path: string; prevId?: string; nextId?: string }) {
  const navigate = useNavigate();
  return (
    <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
      <IconButton type="button" label="Previous" size="small" shape="pill" disabled={!prevId} onClick={() => navigate(`${path}/${prevId}`)}>
        {panelHeaderIcons.arrowUpward}
      </IconButton>
      <IconButton type="button" label="Next" size="small" shape="pill" disabled={!nextId} onClick={() => navigate(`${path}/${nextId}`)}>
        {panelHeaderIcons.arrowDownward}
      </IconButton>
    </ButtonGroup>
  );
}

/** A detail page whose record doesn't exist: say so, with a way back to the list. */
export function NotFound({ icon, title, backTo, backLabel }: { icon: string; title: string; backTo: string; backLabel: string }) {
  const navigate = useNavigate();
  return (
    <Panel className="flex-1">
      <PanelHeader icon={icon} iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title={title} />
      <Panel.Body>
        <Button onClick={() => navigate(backTo)}>{backLabel}</Button>
      </Panel.Body>
    </Panel>
  );
}
