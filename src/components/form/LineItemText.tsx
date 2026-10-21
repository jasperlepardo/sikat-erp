import { Text } from '@jasperlepardo/sikat-design-system';

/**
 * A document line's item: Item No. over its description. For a variant the description is the
 * full configuration ("MacBook Air 13-inch (M5), M5 10C CPU/8C GPU, 16GB, 512GB, Midnight"), which
 * already starts with the family name, so the line's `name` isn't shown — only used when a line
 * has no description.
 */
export function LineItemText({ itemNo, description, name }: { itemNo: string; description: string; name?: string }) {
  return (
    <div className="flex flex-col">
      <Text variant="caption" className="wrap-break-word">{itemNo}</Text>
      <Text variant="small" className="wrap-break-word">{description || name}</Text>
    </div>
  );
}
