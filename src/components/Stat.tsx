import { Card, Icon, Text } from '@jasperlepardo/sikat-design-system';

/** A labelled figure in a card (a stand-in until the design system has a Stat tile). */
export function Stat({ icon, label, value, sub }: { icon: string; label: string; value: string; sub: string }) {
  return (
    <Card>
      <Card.Header icon={<Icon size={24}>{icon}</Icon>}>{label}</Card.Header>
      <Card.Content>
        <div className="flex flex-col gap-0.5">
          <Text variant="h3" as="p">{value}</Text>
          <Text variant="small" tone="muted">{sub}</Text>
        </div>
      </Card.Content>
    </Card>
  );
}
