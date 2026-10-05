import { Button, Icon, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { Fields, Flags, bind, type Errors } from '../../../components/form/fields';
import { MasterList, statusColumn, type ListRoute } from '../../../components/form/MasterList';
import { useCollection } from '../../../components/form/MasterLookup';
import type { PeriodVolumeDiscount, VolumeTier } from '../../../mocks/pricing';
import { itemGroups } from '../../../services/inventoryMasters';
import { listItems } from '../../../services/items';
import { bpGroups, priceLists } from '../../../services/partnerMasters';
import { listPartners } from '../../../services/partners';
import { periodVolumeDiscounts, tierLabel } from '../../../services/priceLists';
import { useAsync } from '../../../services/useAsync';
import { newId } from '../../../services/useCollectionRows';

const blank = (): PeriodVolumeDiscount => ({
  id: newId('pvd'),
  partnerScope: 'group',
  partnerId: '',
  bpGroup: '',
  itemScope: 'group',
  itemId: '',
  itemGroup: '',
  priceList: '',
  kind: 'period',
  validFrom: '',
  validTo: '',
  discountPct: 0,
  tiers: [],
  remarks: '',
  active: true,
});

const pctOk = (n: number) => n >= 0 && n <= 100;

const validity = (r: PeriodVolumeDiscount) => (!r.validFrom && !r.validTo ? 'Always' : `${r.validFrom || '…'} – ${r.validTo || '…'}`);

const sortedTiers = (tiers: VolumeTier[]) => [...tiers].sort((a, b) => a.qtyFrom - b.qtyFrom);

function validate(r: PeriodVolumeDiscount): Errors {
  const e: Errors = {};
  if (r.partnerScope === 'partner' ? !r.partnerId : !r.bpGroup) e[r.partnerScope === 'partner' ? 'partnerId' : 'bpGroup'] = 'Pick who the discount is for.';
  if (r.itemScope === 'item' ? !r.itemId : !r.itemGroup) e[r.itemScope === 'item' ? 'itemId' : 'itemGroup'] = 'Pick what the discount is on.';
  if (!r.priceList) e.priceList = 'Price list is required.';
  if (r.kind === 'period') {
    if (!r.validFrom) e.validFrom = 'Valid from is required for a period discount.';
    if (!pctOk(r.discountPct)) e.discountPct = 'Discount must be 0–100%.';
  }
  if (r.validFrom && r.validTo && r.validTo < r.validFrom) e.validTo = 'Valid to is before valid from.';
  if (r.kind === 'volume') {
    const tiers = sortedTiers(r.tiers);
    if (!tiers.length) e.tiers = 'Add at least one quantity tier.';
    else if (tiers.some((t) => !(t.qtyFrom > 0))) e.tiers = 'Qty from must be more than 0.';
    else if (tiers.some((t) => t.qtyTo !== null && t.qtyTo < t.qtyFrom)) e.tiers = 'Qty to can’t be less than qty from.';
    else if (tiers.slice(0, -1).some((t) => t.qtyTo === null)) e.tiers = 'Only the last tier can be open-ended ("and above").';
    else if (tiers.some((t, i) => i > 0 && tiers[i - 1].qtyTo! >= t.qtyFrom)) e.tiers = 'Tiers overlap: each qty from must be above the previous tier’s qty to.';
    else if (tiers.some((t) => !pctOk(t.discountPct))) e.tiers = 'Discounts must be 0–100%.';
  }
  return e;
}

/** Inventory › Price Lists › Period and Volume Discounts. */
export function PeriodVolumeDiscountsTab(route: ListRoute) {
  const rows = useCollection(periodVolumeDiscounts);
  const lists = useCollection(priceLists) ?? [];
  const groups = useCollection(bpGroups) ?? [];
  const igroups = useCollection(itemGroups) ?? [];
  const partners = useAsync(listPartners, []) ?? [];
  const items = useAsync(listItems, []) ?? [];

  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? id;
  const itemNo = (id: string) => items.find((i) => i.id === id)?.itemNo ?? id;
  const forWhom = (r: PeriodVolumeDiscount) => (r.partnerScope === 'partner' ? partnerName(r.partnerId) : `${r.bpGroup} (group)`);
  const onWhat = (r: PeriodVolumeDiscount) => (r.itemScope === 'item' ? itemNo(r.itemId) : `${r.itemGroup} (group)`);
  const discount = (r: PeriodVolumeDiscount) =>
    r.kind === 'period' ? `${r.discountPct}% for the period` : sortedTiers(r.tiers).map((t) => `${tierLabel(t)}: ${t.discountPct}%`).join(' · ');

  const keep = (current: string) => (x: { name: string; active: boolean }) => x.active || x.name === current;

  return (
    <MasterList<PeriodVolumeDiscount>
      {...route}
      icon="local_offer"
      title="Period and volume discounts"
      noun="discount"
      description="Promotions for a date range, or price breaks by line quantity, for a partner or BP group on an item or item group. Checked after special prices and before discount groups; the first match wins."
      rows={rows}
      columns={[
        { key: 'forWhom', header: 'For', cell: forWhom },
        { key: 'onWhat', header: 'On', cell: onWhat },
        { key: 'priceList', header: 'Price list', cell: (r) => r.priceList },
        { key: 'kind', header: 'Type', cell: (r) => (r.kind === 'period' ? 'Period' : 'Volume') },
        { key: 'discount', header: 'Discount', cell: discount, sortable: false },
        { key: 'validFrom', header: 'Valid', cell: validity },
        statusColumn<PeriodVolumeDiscount>(),
      ]}
      sortValue={(r, key) =>
        key === 'forWhom' ? forWhom(r).toLowerCase() : key === 'onWhat' ? onWhat(r).toLowerCase() : key === 'active' ? Number(r.active) : String(r[key as keyof PeriodVolumeDiscount] ?? '').toLowerCase()
      }
      searchText={(r) => `${forWhom(r)} ${onWhat(r)} ${r.priceList} ${r.remarks}`}
      blank={blank}
      label={(r) => `${forWhom(r)} · ${onWhat(r)}`}
      validate={validate}
      onSave={async (r) => {
        await periodVolumeDiscounts.save({
          ...r,
          // Keep only the fields the chosen scope and type use.
          partnerId: r.partnerScope === 'partner' ? r.partnerId : '',
          bpGroup: r.partnerScope === 'group' ? r.bpGroup : '',
          itemId: r.itemScope === 'item' ? r.itemId : '',
          itemGroup: r.itemScope === 'group' ? r.itemGroup : '',
          discountPct: r.kind === 'period' ? r.discountPct : 0,
          tiers: r.kind === 'volume' ? sortedTiers(r.tiers) : [],
        });
      }}
      onSetActive={async (picked, active) => {
        for (const r of picked) await periodVolumeDiscounts.save({ ...r, active });
      }}
      editor={(r, update, errors) => {
        const f = bind(r, update);
        return (
          <>
            <Fields>
              {f.choose('partnerScope', 'For', [
                { value: 'group', label: 'A business partner group' },
                { value: 'partner', label: 'One business partner' },
              ])}
              {r.partnerScope === 'partner'
                ? f.lookup('partnerId', 'Business partner', partners.map((p) => ({ value: p.id, label: p.name })), { required: true, error: errors.partnerId })
                : f.choose('bpGroup', 'BP group', groups.filter(keep(r.bpGroup)).map((g) => ({ value: g.name, label: g.name })), {
                    required: true,
                    error: errors.bpGroup,
                    hint: 'Every partner in the group gets it, including ones added later.',
                  })}
              {f.choose('itemScope', 'On', [
                { value: 'group', label: 'An item group' },
                { value: 'item', label: 'One item' },
              ])}
              {r.itemScope === 'item'
                ? f.lookup('itemId', 'Item', items.map((i) => ({ value: i.id, label: `${i.itemNo} · ${i.name}` })), { required: true, error: errors.itemId })
                : f.choose('itemGroup', 'Item group', igroups.map((g) => ({ value: g.name, label: g.name })), { required: true, error: errors.itemGroup })}
              {f.choose('priceList', 'Price list', lists.filter(keep(r.priceList)).map((l) => ({ value: l.name, label: l.name })), {
                required: true,
                error: errors.priceList,
                hint: 'The discount comes off this list’s price, and only applies on lines using it.',
              })}
              {f.choose('kind', 'Discount type', [
                { value: 'period', label: 'Period — a % off between two dates' },
                { value: 'volume', label: 'Volume — a % off by line quantity' },
              ])}
            </Fields>
            <Fields cols={3}>
              {f.date('validFrom', 'Valid from', {
                required: r.kind === 'period',
                error: errors.validFrom,
                hint: 'Checked against the document’s posting date.',
              })}
              {f.date('validTo', 'Valid to', {
                error: errors.validTo,
                hint: r.kind === 'period' ? 'Leave empty only for open-ended terms — a promotion without an end date never stops.' : 'Empty = no end date.',
              })}
              {r.kind === 'period' ? f.num('discountPct', 'Discount', { required: true, suffix: '%', error: errors.discountPct }) : null}
            </Fields>
            {r.kind === 'volume' ? <TiersEditor tiers={r.tiers} error={errors.tiers} onChange={(tiers) => update({ tiers })} /> : null}
            <Fields>{f.area('remarks', 'Remarks')}</Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}

function TiersEditor({ tiers, error, onChange }: { tiers: VolumeTier[]; error?: string; onChange: (tiers: VolumeTier[]) => void }) {
  const set = (id: string, patch: Partial<VolumeTier>) => onChange(tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const sorted = sortedTiers(tiers);
  const add = () => {
    const last = sorted[sorted.length - 1];
    const from = last ? (last.qtyTo ?? last.qtyFrom) + 1 : 1;
    // Close the previous open-ended tier so the new one continues from it.
    const closed = last && last.qtyTo === null ? tiers.map((t) => (t.id === last.id ? { ...t, qtyTo: from - 1 } : t)) : tiers;
    onChange([...closed, { id: newId('tier'), qtyFrom: from, qtyTo: null, discountPct: 0 }]);
  };
  const gaps = sorted.some((t, i) => i > 0 && sorted[i - 1].qtyTo !== null && t.qtyFrom > sorted[i - 1].qtyTo! + 1);
  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <>
      <DataTable<VolumeTier>
        icon="stacked_bar_chart"
        title="Quantity tiers"
        description="Line quantity in the item’s inventory unit — not the order total across lines. Leave the last tier’s Qty to empty for “and above”."
        rows={sorted}
        getRowId={(t) => t.id}
        noPagination
        columns={[
          {
            key: 'qtyFrom',
            header: 'Qty from',
            cell: (t) => <TextField aria-label="Qty from" type="number" min={0} className="w-28" value={String(t.qtyFrom)} onChange={(e) => set(t.id, { qtyFrom: num(e.currentTarget.value) })} />,
          },
          {
            key: 'qtyTo',
            header: 'Qty to',
            cell: (t) => (
              <TextField
                aria-label="Qty to"
                type="number"
                min={0}
                className="w-28"
                placeholder="and above"
                value={t.qtyTo === null ? '' : String(t.qtyTo)}
                onChange={(e) => set(t.id, { qtyTo: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}
              />
            ),
          },
          {
            key: 'discountPct',
            header: 'Discount',
            cell: (t) => <TextField aria-label="Discount %" type="number" min={0} max={100} suffix="%" className="w-28" value={String(t.discountPct)} onChange={(e) => set(t.id, { discountPct: num(e.currentTarget.value) })} />,
          },
        ]}
        unsortable={['qtyFrom', 'qtyTo', 'discountPct']}
        onRemove={(picked) => onChange(tiers.filter((t) => !picked.some((p) => p.id === t.id)))}
        actions={
          <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={add}>
            Add tier
          </Button>
        }
        empty={
          <Text variant="small" tone="muted">
            No tiers yet. Start from 1 — a 0% first tier is fine.
          </Text>
        }
      />
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : gaps ? (
        <Text variant="small" tone="muted">
          There’s a gap between tiers: quantities in it get no volume discount and fall through to discount groups.
        </Text>
      ) : null}
    </>
  );
}
