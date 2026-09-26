import { Card, Icon, Panel, PanelHeader, Text } from '@jasperlepardo/sikat-design-system';
import { isLowStock, isValidToday, listItems, stockTotals } from '../services/items';
import { useAsync } from '../services/useAsync';
import { formatAmount } from '../services/format';

export function Home() {
  const items = useAsync(listItems, []);
  const active = items?.filter((i) => i.inventoryItem && isValidToday(i)) ?? [];
  const stats = [
    { label: 'Stocked items', value: items ? String(active.length) : '—', icon: 'inventory_2' },
    { label: 'Low or out of stock', value: items ? String(active.filter(isLowStock).length) : '—', icon: 'warning' },
    {
      label: 'Inventory value at cost (PHP)',
      value: items ? formatAmount(active.reduce((sum, i) => sum + stockTotals(i).inStock * i.itemCost, 0)) : '—',
      icon: 'payments',
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader icon="home" title="Home" subcopy="Welcome back. Here's what's happening today." />
      <Panel.Body>
        <div className="grid gap-2 md:grid-cols-3">
          {stats.map((s) => (
            <Card key={s.label}>
              <Card.Header icon={<Icon size={24}>{s.icon}</Icon>}>{s.label}</Card.Header>
              <Card.Content>
                <Text variant="display">{s.value}</Text>
              </Card.Content>
            </Card>
          ))}
        </div>
      </Panel.Body>
    </Panel>
  );
}
