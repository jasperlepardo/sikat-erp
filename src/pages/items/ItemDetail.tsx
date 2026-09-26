import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  Card,
  Form,
  FormField,
  Icon,
  Panel,
  PanelHeader,
  Select,
  Text,
  TextField,
  Textarea,
} from '@jasperlepardo/sikat-design-system';
import { ITEM_CATEGORIES, ITEM_UOMS, type Item } from '../../mocks/items';
import { getItem, saveItem } from '../../services/items';

type Draft = Omit<Item, 'id'> & { id?: string };

const EMPTY: Draft = {
  sku: '',
  name: '',
  category: ITEM_CATEGORIES[0],
  uom: ITEM_UOMS[0],
  onHand: 0,
  reorderLevel: 0,
  unitPrice: 0,
  status: 'Active',
  description: '',
};

const options = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

export function ItemDetail() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? EMPTY : undefined);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getItem(id).then((item) => !cancelled && setDraft(item ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (draft === undefined) return <p className="p-4 text-muted">Loading item…</p>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="inventory_2" title="Item not found" />
        <Panel.Body>
          <Button onClick={() => navigate('/items')}>Back to items</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  const num = (key: 'onHand' | 'reorderLevel' | 'unitPrice') => ({
    type: 'number',
    min: 0,
    value: String(draft[key]),
    onChange: (e: { currentTarget: HTMLInputElement }) => set(key, Number(e.currentTarget.value)),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!draft.name.trim()) next.name = 'Name is required.';
    if (!draft.sku.trim()) next.sku = 'SKU is required.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    await saveItem(draft);
    navigate('/items');
  };

  return (
    <Form className="flex-1" onSubmit={submit} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="forms"
          icon="inventory_2"
          title={isNew ? 'New item' : draft.name}
          subcopy={isNew ? 'Add a product or material to the catalog.' : draft.sku}
          status={
            isNew ? undefined : <Badge intent={draft.status === 'Active' ? 'success' : 'default'}>{draft.status}</Badge>
          }
          actions={
            <>
              <Button
                type="button"
                intent="default"
                variant="solid"
                size="extra-large"
                onClick={() => navigate('/items')}
              >
                Cancel
              </Button>
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <Card>
            <Card.Header icon={<Icon size={24}>info</Icon>}>Details</Card.Header>
            <Card.Content>
              <Form.Group>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Name" required error={errors.name}>
                    {(p) => (
                      <TextField {...p} value={draft.name} onChange={(e) => set('name', e.currentTarget.value)} />
                    )}
                  </FormField>
                  <FormField label="SKU" required error={errors.sku}>
                    {(p) => <TextField {...p} value={draft.sku} onChange={(e) => set('sku', e.currentTarget.value)} />}
                  </FormField>
                  <FormField label="Category">
                    {(p) => (
                      <Select
                        {...p}
                        options={options(ITEM_CATEGORIES)}
                        value={draft.category}
                        onValueChange={(v) => set('category', v)}
                      />
                    )}
                  </FormField>
                  <FormField label="Status">
                    {(p) => (
                      <Select
                        {...p}
                        options={options(['Active', 'Inactive'])}
                        value={draft.status}
                        onValueChange={(v) => set('status', v as Item['status'])}
                      />
                    )}
                  </FormField>
                </div>
                <FormField label="Description">
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={3}
                      value={draft.description ?? ''}
                      onChange={(e) => set('description', e.currentTarget.value)}
                    />
                  )}
                </FormField>
              </Form.Group>
            </Card.Content>
          </Card>
          <Card>
            <Card.Header icon={<Icon size={24}>warehouse</Icon>}>Stock & pricing</Card.Header>
            <Card.Content>
              <Form.Group>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Unit of measure">
                    {(p) => (
                      <Select
                        {...p}
                        options={options(ITEM_UOMS)}
                        value={draft.uom}
                        onValueChange={(v) => set('uom', v)}
                      />
                    )}
                  </FormField>
                  <FormField label="Unit price">
                    {(p) => <TextField {...p} prefix="PHP" step="0.01" {...num('unitPrice')} />}
                  </FormField>
                  <FormField label="On hand">
                    {(p) => <TextField {...p} suffix={draft.uom} {...num('onHand')} />}
                  </FormField>
                  <FormField label="Reorder level" hint="Flag as low stock at or below this quantity.">
                    {(p) => <TextField {...p} suffix={draft.uom} {...num('reorderLevel')} />}
                  </FormField>
                </div>
              </Form.Group>
              {!isNew && draft.onHand <= draft.reorderLevel ? (
                <Text variant="small" tone="danger">
                  Stock is at or below the reorder level.
                </Text>
              ) : null}
            </Card.Content>
          </Card>
        </Panel.Body>
      </Panel>
    </Form>
  );
}
