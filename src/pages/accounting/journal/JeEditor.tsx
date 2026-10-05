/**
 * The journal entry form's header sections and rows grid, shared by Journal Entries and the
 * entries inside a Journal Voucher (same fields; a voucher only differs in when it posts).
 */
import { useRef, type ReactNode } from 'react';
import {
  Button,
  Combobox,
  DatePicker,
  FormField,
  Icon,
  Select,
  Text,
  TextField,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { Fields, Flags, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { accountLabel, type Account } from '../../../mocks/chartOfAccounts';
import {
  CLOSED_THROUGH,
  FISCAL_YEAR_END,
  JE_SERIES,
  ORIGIN_LABEL,
  TRANS_CODES,
  TRANS_CODE_LABEL,
  newJeLine,
  type JeLine,
  type JournalEntry,
} from '../../../mocks/journalEntries';
import type { Partner } from '../../../mocks/partners';
import { BLANKET_AGREEMENTS, INDICATORS } from '../../../mocks/purchaseOrders';
import type { TaxCode } from '../../../mocks/taxes';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { controlAccountOf, jeTotals, lineProblems, parseJeRows, postingPeriodProblem, rowAccount } from '../../../services/journalEntries';
import { readXlsxText } from '../../../services/xlsx';
import { projectDef } from '../../settings/masterDefs';

/** An entry's fields, posted or not (status aside: a voucher entry has its own). */
export type JeDraft = Omit<JournalEntry, 'id' | 'status'>;

export interface JeMasters {
  accounts: Account[];
  partners: Partner[];
  codes: TaxCode[];
}

const num = (v: string) => (v === '' ? 0 : Number(v));

/**
 * What must hold for an entry to post: an open period, a valid reversal, rows that can post,
 * and debits = credits. `d.lines` should already include any Automatic Tax rows.
 */
export function jeProblems(d: JeDraft, m: JeMasters): Problem<'contents'>[] {
  const { problems, need } = problemCollector<'contents'>();
  const period = postingPeriodProblem(d.postingDate, d.period13);
  need(!period, 'header', 'postingDate', period ?? '');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(d.dueDate, 'header', 'dueDate', 'Due date is required.');
  if (d.reverse) {
    need(d.reversalDate && d.reversalDate > d.postingDate, 'header', 'reversalDate', 'Reversal date must be after the posting date.');
    const rev = d.reversalDate ? postingPeriodProblem(d.reversalDate) : undefined;
    need(!rev, 'header', 'reversalDate', `Reversal: ${rev}`);
  }
  const rows = d.lines.filter((l) => !l.taxOf);
  need(rows.length >= 2, 'contents', 'lines', 'An entry needs at least two rows.');
  for (const p of lineProblems(d.lines, m.accounts, m.partners, d.postingDate, true)) need(false, 'contents', p.key, p.message);
  const t = jeTotals(d.lines);
  need(!t.difference, 'contents', 'lines', `Debits and credits differ by ${formatAmount(Math.abs(t.difference))} — they must be equal.`);
  return problems;
}

/** The rows an entry posts: Automatic Tax rows included, empty rows dropped. */
export const rowsToPost = (lines: JeLine[]) => lines.filter((l) => l.taxOf || l.account || l.partnerId || l.debit || l.credit);

export const nextDayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Document, References and Options. `documentTop` adds fields above Number (e.g. Voucher No.). */
export function JeHeaderSections({
  draft,
  update,
  errors,
  readOnly,
  documentTop,
  transNoHint = 'Internal transaction number.',
}: {
  draft: JeDraft;
  update: (patch: Partial<JeDraft>) => void;
  errors: Errors;
  readOnly: boolean;
  documentTop?: ReactNode;
  transNoHint?: string;
}) {
  const h = bind(draft, update);
  const manual = draft.origin === 'JE';
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
      <Section icon="tag" title="Document">
        <Fields>
          {documentTop}
          <FormField label="Number" tooltip={readOnly ? undefined : 'Assigned from the series when the entry is added. Permanent.'}>
            {(p) => (
              <div className="flex gap-1">
                <Select aria-label="Series" className="w-32" disabled={readOnly} options={JE_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                <TextField {...p} className="flex-1" readOnly placeholder="Next number" value={draft.number ? String(draft.number) : ''} />
              </div>
            )}
          </FormField>
          <ReadOnly label="Trans. No." value={draft.transNo ? String(draft.transNo) : '—'} hint={transNoHint} />
          {h.date('postingDate', 'Posting date', {
            required: true,
            error: errors.postingDate,
            hint: `The period it hits. Open: ${formatDate(nextDayOf(CLOSED_THROUGH))} – ${formatDate(FISCAL_YEAR_END)}.`,
          })}
          {h.date('dueDate', 'Due date', { required: true, error: errors.dueDate, hint: 'For rows on a business partner.' })}
          {h.date('documentDate', 'Doc. date', { required: true, error: errors.documentDate })}
          <ReadOnly
            label="Origin"
            value={manual ? 'JE · this entry' : `${draft.origin} · ${ORIGIN_LABEL[draft.origin]} ${draft.originNo}`}
            hint={manual ? 'A manual entry is its own origin.' : undefined}
          />
        </Fields>
      </Section>

      <Section icon="bookmark" title="References">
        <Fields>
          {h.text('ref1', 'Ref. 1')}
          {h.text('ref2', 'Ref. 2')}
          {h.text('ref3', 'Ref. 3')}
          {h.choose('transCode', 'Trans. code', TRANS_CODES.map((c) => ({ value: c, label: TRANS_CODE_LABEL[c] })))}
          {h.choose('indicator', 'Indicator', INDICATORS.map((v) => ({ value: v, label: v })))}
          {h.master('project', 'Project', projectDef, { clearable: true })}
          {h.choose('blanketAgreement', 'Blanket agreement', [{ value: '', label: '— None —' }, ...BLANKET_AGREEMENTS.map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` }))])}
        </Fields>
      </Section>

      <Section icon="tune" title="Options">
        <Flags>
          {h.check('reverse', 'Reverse')}
          {h.check('period13', 'Adj. Trans. (Period 13)')}
          {h.check('automaticTax', 'Automatic tax')}
          {h.check('revaluationReporting', 'Revaluation reporting exch. rate')}
        </Flags>
        <Fields cols={1}>
          {draft.reverse
            ? h.date('reversalDate', 'Reversal date', {
                required: true,
                error: errors.reversalDate,
                hint: 'Adding posts the reversing entry too, dated this day.',
              })
            : null}
          <Text variant="small" tone="muted">
            {draft.period13 ? `Year-end adjustment: dated ${formatDate(FISCAL_YEAR_END)}. ` : ''}
            {draft.automaticTax
              ? 'Each tax code on a row adds a tax row to the code’s account. Deferred tax and withholding tax aren’t managed here.'
              : 'Automatic tax adds tax rows from each row’s tax code.'}
          </Text>
        </Fields>
      </Section>
    </div>
  );
}

/**
 * The debit / credit rows. `lines` is what to show (with Automatic Tax rows); edits go to
 * `draft.lines`. `balanceRule` ends the description while debits and credits differ.
 */
export function JeRowsTable({
  draft,
  update,
  errors,
  readOnly,
  m,
  lines,
  onNotice,
  balanceRule = 'must be zero to add',
}: {
  draft: JeDraft;
  update: (patch: Partial<JeDraft>) => void;
  errors: Errors;
  readOnly: boolean;
  m: JeMasters;
  lines: JeLine[];
  /** Import from Excel's result (or failure), for the form to show. */
  onNotice: (message: string) => void;
  balanceRule?: string;
}) {
  const file = useRef<HTMLInputElement>(null);
  const totals = jeTotals(lines);
  const patchLine = (lid: string, p: Partial<JeLine>) => update({ lines: draft.lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) });

  const importRows = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = /\.xlsx$/i.test(f.name) ? await readXlsxText(f) : await f.text();
      const { lines: rows, skipped } = parseJeRows(text);
      if (!rows.length) return onNotice('No rows found — the file needs columns Account, Debit, Credit and (optionally) Remarks.');
      update({ lines: [...draft.lines.filter((l) => l.account || l.partnerId || l.debit || l.credit), ...rows] });
      onNotice(`Imported ${rows.length} row${rows.length === 1 ? '' : 's'} from ${f.name}${skipped ? `; skipped ${skipped} without an account code (e.g. the header)` : ''}.`);
    } catch (err) {
      onNotice((err as Error).message);
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  // G/L accounts and business partners in one picker, as SAP's "G/L Acct/BP Code".
  const postable = m.accounts.filter((a) => !a.title && a.active && !a.control);
  const targetOptions = (l: JeLine) => [
    ...postable.map((a) => ({ value: `acct:${a.code}`, label: accountLabel(a), subLabel: 'G/L account', subLabelPlacement: 'top' as const, text: `${a.code} ${a.name}` })),
    ...m.partners.map((p) => ({ value: `bp:${p.id}`, label: p.name, subLabel: `${p.code} · business partner`, subLabelPlacement: 'top' as const, text: `${p.code} ${p.name}` })),
    // A row's current value stays pickable even if it no longer fits (e.g. an account since deactivated).
    ...(l.account && !l.partnerId && !postable.some((a) => a.code === l.account) ? [{ value: `acct:${l.account}`, label: `${l.account} (can't post)`, text: l.account }] : []),
  ];
  const targetOf = (l: JeLine) => (l.partnerId && !l.account ? `bp:${l.partnerId}` : l.account ? `acct:${l.account}` : null);
  const setTarget = (l: JeLine, v: string | null) => {
    if (!v) return patchLine(l.id, { account: '', partnerId: '' });
    if (v.startsWith('bp:')) return patchLine(l.id, { account: '', partnerId: v.slice(3), dueDate: l.dueDate || draft.dueDate });
    patchLine(l.id, { account: v.slice(5), partnerId: '' });
  };
  const nameOf = (l: JeLine) => {
    if (l.partnerId) return m.partners.find((p) => p.id === l.partnerId)?.name ?? l.partnerId;
    return m.accounts.find((a) => a.code === l.account)?.name ?? '';
  };
  const err = (l: JeLine, f: string) => errors[`line:${l.id}:${f}`];
  const editable = (l: JeLine) => !readOnly && !l.taxOf;

  const columns: TableColumn<JeLine>[] = [
    {
      key: 'target',
      header: 'G/L Acct/BP Code',
      cell: (l) =>
        editable(l) ? (
          <div className="w-64">
            <Combobox aria-label="G/L account or BP code" placeholder="Account or partner" options={targetOptions(l)} value={targetOf(l)} invalid={Boolean(err(l, 'account'))} onValueChange={(v) => setTarget(l, v)} />
          </div>
        ) : (
          <div className="flex flex-col">
            <Text variant="caption">{l.partnerId ? m.partners.find((p) => p.id === l.partnerId)?.code ?? l.partnerId : l.account}</Text>
            {l.taxOf ? <Text variant="small" tone="muted">Automatic tax</Text> : null}
          </div>
        ),
    },
    { key: 'name', header: 'G/L Acct/BP Name', cell: (l) => <Text variant="small">{nameOf(l)}</Text> },
    {
      key: 'control',
      header: 'Control acct',
      cell: (l) => {
        if (!l.partnerId) return null;
        const p = m.partners.find((x) => x.id === l.partnerId);
        return <Text variant="small" tone="muted">{rowAccount(l, m.partners) || (p ? controlAccountOf(p) : '')}</Text>;
      },
    },
    {
      key: 'debit',
      header: 'Debit',
      cell: (l) =>
        editable(l) ? (
          <TextField aria-label="Debit" type="number" min={0} className="w-36" invalid={Boolean(err(l, 'amount'))} value={l.debit ? String(l.debit) : ''} onChange={(e) => patchLine(l.id, { debit: num(e.currentTarget.value), credit: num(e.currentTarget.value) ? 0 : l.credit })} />
        ) : (
          <span className="tabular-nums">{l.debit ? formatAmount(l.debit) : ''}</span>
        ),
    },
    {
      key: 'credit',
      header: 'Credit',
      cell: (l) =>
        editable(l) ? (
          <TextField aria-label="Credit" type="number" min={0} className="w-36" invalid={Boolean(err(l, 'amount'))} value={l.credit ? String(l.credit) : ''} onChange={(e) => patchLine(l.id, { credit: num(e.currentTarget.value), debit: num(e.currentTarget.value) ? 0 : l.debit })} />
        ) : (
          <span className="tabular-nums">{l.credit ? formatAmount(l.credit) : ''}</span>
        ),
    },
    ...(draft.automaticTax
      ? [
          {
            key: 'taxCode',
            header: 'Tax code',
            cell: (l: JeLine) =>
              editable(l) ? (
                <div className="w-28">
                  <Combobox aria-label="Tax code" clearable options={m.codes.filter((c) => c.active).map((c) => ({ value: c.code, label: c.code }))} value={l.taxCode || null} onValueChange={(v) => patchLine(l.id, { taxCode: v ?? '' })} />
                </div>
              ) : (
                <Text variant="small">{l.taxOf ?? l.taxCode}</Text>
              ),
          },
        ]
      : []),
    {
      key: 'dueDate',
      header: 'Due date',
      cell: (l) =>
        l.partnerId ? (
          editable(l) ? (
            <DatePicker aria-label="Row due date" className="w-fit" value={l.dueDate || null} onValueChange={(v) => patchLine(l.id, { dueDate: v ?? '' })} />
          ) : (
            <Text variant="small">{l.dueDate ? formatDate(l.dueDate) : ''}</Text>
          )
        ) : null,
    },
    {
      key: 'remarks',
      header: 'Remarks',
      cell: (l) =>
        editable(l) ? (
          <TextField aria-label="Row remarks" className="w-56" value={l.remarks} onChange={(e) => patchLine(l.id, { remarks: e.currentTarget.value })} />
        ) : (
          <Text variant="small">{l.remarks}</Text>
        ),
    },
  ];

  return (
    <DataTable
      variant="card"
      noPagination
      icon="table_rows"
      title="Contents"
      description={
        errors.lines ??
        `Debit PHP ${formatAmount(totals.debit)} · Credit PHP ${formatAmount(totals.credit)}${totals.difference ? ` · Difference PHP ${formatAmount(Math.abs(totals.difference))} — ${balanceRule}` : ' · balanced'}. A business partner row posts to its control account.`
      }
      rows={lines}
      getRowId={(l) => l.id}
      columns={columns}
      unsortable={columns.map((c) => c.key)}
      onRemove={readOnly ? undefined : (picked) => update({ lines: draft.lines.filter((l) => !picked.includes(l)) })}
      actions={
        readOnly ? null : (
          <div className="flex items-center gap-1">
            <input ref={file} type="file" accept=".xlsx,.txt,.tsv,.csv" className="hidden" onChange={(e) => importRows(e.currentTarget.files?.[0])} />
            <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>upload_file</Icon>} onClick={() => file.current?.click()}>
              Import from Excel
            </Button>
            <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ lines: [...draft.lines, newJeLine({ debit: totals.difference < 0 ? -totals.difference : 0, credit: totals.difference > 0 ? totals.difference : 0 })] })}>
              Add row
            </Button>
          </div>
        )
      }
      empty={
        <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
          No rows yet.
        </Text>
      }
    />
  );
}
