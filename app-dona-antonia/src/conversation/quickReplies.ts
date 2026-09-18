import type { AppRoute } from '../app/navigation.ts';
import type { QuickReply } from './types.ts';

export const HOME_QUICK_REPLIES: QuickReply[] = [
  { id: 'baskets', label: 'Cestas' },
  { id: 'offers', label: 'Ofertas' },
  { id: 'for-you', label: 'Para Você' },
  { id: 'for-home', label: 'Para Casa' },
];

const ROUTES_BY_REPLY: Record<string, AppRoute> = {
  baskets: 'basket',
  offers: 'catalog',
  'for-you': 'catalog',
  'for-home': 'catalog',
};

export function routeForQuickReply(replyId: string): AppRoute | null {
  return ROUTES_BY_REPLY[replyId] ?? null;
}
