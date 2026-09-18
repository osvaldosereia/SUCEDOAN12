export type NetworkState = 'online' | 'offline' | 'unknown';

export interface NavigatorNetworkLike {
  onLine: boolean;
}

export function getNetworkState(
  source: NavigatorNetworkLike | undefined =
    typeof navigator !== 'undefined' ? navigator : undefined,
): NetworkState {
  if (!source || typeof source.onLine !== 'boolean') return 'unknown';
  return source.onLine ? 'online' : 'offline';
}

export function canConfirmOrder(state: NetworkState): boolean {
  return state === 'online';
}
