import type { AppRoute } from '../app/navigation.ts';
import { parseAppLink, type AppLinkOptions } from '../platform/appLinks.ts';

export type NotificationKind = 'transactional' | 'marketing';

export interface NotificationPayload {
  id: string;
  kind: NotificationKind;
  link: string;
}

export interface NotificationRouterOptions extends AppLinkOptions {
  maxRememberedIds?: number;
}

export interface NotificationRoutingResult {
  accepted: boolean;
  duplicate: boolean;
  route: AppRoute | null;
  reason?: 'invalid_id' | 'invalid_link' | 'duplicate';
}

const OPAQUE_NOTIFICATION_ID = /^TEST-NOTIFICATION-[A-Za-z0-9_-]{16,160}$/;

export function createNotificationRouter(options: NotificationRouterOptions = {}) {
  const maxRememberedIds = Math.max(1, Math.min(options.maxRememberedIds ?? 128, 512));
  const seen = new Set<string>();
  const order: string[] = [];

  function remember(id: string): void {
    seen.add(id);
    order.push(id);
    while (order.length > maxRememberedIds) {
      const oldest = order.shift();
      if (oldest) seen.delete(oldest);
    }
  }

  return {
    route(payload: NotificationPayload): NotificationRoutingResult {
      const id = payload.id.trim();
      if (!OPAQUE_NOTIFICATION_ID.test(id)) {
        return { accepted: false, duplicate: false, route: null, reason: 'invalid_id' };
      }

      if (seen.has(id)) {
        return { accepted: false, duplicate: true, route: null, reason: 'duplicate' };
      }

      const route = parseAppLink(payload.link, { allowedHosts: options.allowedHosts });
      if (route === null) {
        return { accepted: false, duplicate: false, route: null, reason: 'invalid_link' };
      }

      remember(id);
      return { accepted: true, duplicate: false, route };
    },

    reset(): void {
      seen.clear();
      order.splice(0, order.length);
    },
  };
}
