import { Alert } from '@jasperlepardo/sikat-design-system';

export interface Problem<Tab extends string = string> {
  /** The tab holding the field, or 'header' for the always-visible header card. */
  tab: Tab | 'header';
  key: string;
  message: string;
}

/** "Fix N fields to save", with a link to the tab holding each problem. */
export function ProblemsAlert<Tab extends string>({
  problems,
  tabLabel,
  onOpenTab,
}: {
  problems: Problem<Tab>[];
  tabLabel: (tab: Tab) => string | undefined;
  onOpenTab: (tab: Tab) => void;
}) {
  if (!problems.length) return null;
  return (
    <Alert
      intent="danger"
      variant="outline"
      title={`Fix ${problems.length} field${problems.length === 1 ? '' : 's'} to save`}
    >
      <ul className="list-disc pl-5">
        {problems.map((p) => (
          <li key={p.key}>
            {p.message}
            {p.tab !== 'header' ? (
              <>
                {' '}
                <button type="button" className="text-primary underline" onClick={() => onOpenTab(p.tab as Tab)}>
                  {tabLabel(p.tab as Tab)}
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

/** Collects problems: `need(ok, tab, key, message)` records one when `ok` is falsy. */
export function problemCollector<Tab extends string>() {
  const problems: Problem<Tab>[] = [];
  const need = (ok: unknown, tab: Tab | 'header', key: string, message: string) => {
    if (!ok) problems.push({ tab, key, message });
  };
  return { problems, need };
}
