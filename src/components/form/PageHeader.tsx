// The one place the design system's PanelHeader is used: everything else renders PageHeader.
// eslint-disable-next-line no-restricted-imports
import { Button, Icon, PanelHeader, type PanelHeaderProps } from '@jasperlepardo/sikat-design-system';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { cap, type Noun } from './noun';

/** A list above this record in the breadcrumbs: a document's list (by its noun) or any labelled page. */
export type ParentLink = { noun: Noun; to: string } | { label: string; to: string };

type Base = Omit<
  PanelHeaderProps,
  | 'title' | 'type' | 'iconIntent' | 'iconShape' | 'iconSize' | 'iconVariant'
  | 'breadcrumbs' | 'onBreadcrumbNavigate' | 'onBack' | 'operations' | 'trailing'
> & {
  /** Back, when the page has no `parent` or goes somewhere else than the nearest one. */
  onBack?: () => void;
  /** A list page's one action: "New <noun>", opening `${to}/new`. */
  create?: { noun: Noun; to: string };
};

export type PageHeaderProps = Base &
  (
    | { parent?: undefined; title?: ReactNode }
    /** A detail page: breadcrumbs [...parents, title], and Back opens the nearest parent. */
    | { parent: ParentLink | ParentLink[]; title: string }
  );

const labelOf = (link: ParentLink) => ('noun' in link ? cap(link.noun.many) : link.label);

/**
 * The top bar of every page and side panel, in the house style: the icon look is fixed, buttons go in
 * `actions` only, and a detail page names its list with `parent` instead of hand-built breadcrumbs.
 */
export function PageHeader({ parent, title, onBack, create, actions, ...rest }: PageHeaderProps) {
  const navigate = useNavigate();
  const parents = parent ? (Array.isArray(parent) ? parent : [parent]) : [];
  const nearest = parents[parents.length - 1];
  const createButton = create ? (
    <Button
      type="button"
      intent="primary"
      variant="solid"
      shape="pill"
      leadingIcon={<Icon size={20}>add</Icon>}
      onClick={() => navigate(`${create.to}/new`)}
    >
      New {create.noun.one}
    </Button>
  ) : null;
  return (
    <PanelHeader
      {...rest}
      iconIntent="default"
      iconShape="rounded"
      iconSize={32}
      iconVariant="outline"
      title={nearest ? undefined : title}
      breadcrumbs={nearest ? [...parents.map((p) => ({ label: labelOf(p), href: p.to })), { label: title as string }] : undefined}
      onBreadcrumbNavigate={(item, e) => {
        e.preventDefault();
        navigate(item.href!);
      }}
      onBack={onBack ?? (nearest ? () => navigate(nearest.to) : undefined)}
      actions={
        actions != null && createButton ? (
          <>
            {actions}
            {createButton}
          </>
        ) : (actions ?? createButton ?? undefined)
      }
    />
  );
}
