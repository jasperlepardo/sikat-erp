import { useNavigate } from 'react-router';
import { Badge, Icon, List, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from './fields';
import { listBlanketAgreements, baNumber, baTotals } from '../../../services/blanketAgreements';
import { useAsync } from '../../../services/useAsync';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { BA_LIST_PATH, BA_STATUS_INTENT } from '../../sales/agreements/BlanketAgreementList';

/**
 * Shows open blanket agreements for a customer in the Partner detail side column.
 * Read-only; clicking an agreement opens it.
 */
export function AgreementsSection({ partnerId }: { partnerId: string }) {
  const navigate = useNavigate();
  const allAgreements = useAsync(listBlanketAgreements, []);
  const agreements = (allAgreements ?? []).filter((ba) => ba.customerId === partnerId);

  return (
    <Section
      icon="description"
      title={`Agreements${agreements.length ? ` (${agreements.length})` : ''}`}
    >
      {agreements.length ? (
        <List.Group>
          {agreements.map((ba) => {
            const totals = baTotals(ba);
            const period =
              ba.startDate
                ? formatDate(ba.startDate) + (ba.endDate ? ' – ' + formatDate(ba.endDate) : '')
                : '';
            return (
              <List.Card
                key={ba.id}
                title={ba.docNum ? baNumber(ba) : 'Draft'}
                icon={<Icon size={16}>description</Icon>}
                badge={<Badge intent={BA_STATUS_INTENT[ba.status]} size="small">{ba.status}</Badge>}
                fields={[
                  ...(period ? [{ label: 'Period', value: period }] : []),
                  { label: 'Total', value: 'PHP ' + formatAmount(totals.plannedTotal) },
                ]}
                onClick={() => navigate(BA_LIST_PATH + '/' + (ba.docNum ? baNumber(ba) : ba.id))}
              />
            );
          })}
        </List.Group>
      ) : (
        <Text tone="muted">No agreements.</Text>
      )}
    </Section>
  );
}
