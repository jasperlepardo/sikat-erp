import { Avatar } from '@jasperlepardo/sikat-design-system';
import type { Partner } from '../mocks/partners';
import { initialsOf } from '../services/format';

/** Business types that are a person, not an organisation. */
const PERSON_TYPES = new Set(['Individual', 'Sole proprietorship']);

/** A business partner's initials in a circle; falls back to a person or building icon. */
export function PartnerAvatar({ partner, size }: { partner: Pick<Partner, 'name' | 'businessType'>; size: number }) {
  return (
    <Avatar
      initials={initialsOf(partner.name)}
      icon={PERSON_TYPES.has(partner.businessType) ? 'person' : 'business'}
      size={size}
    />
  );
}
