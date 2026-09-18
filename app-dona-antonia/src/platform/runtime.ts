export type AppRuntime = 'web' | 'pwa' | 'android' | 'ios';

export interface RuntimeSignals {
  nativePlatform?: 'android' | 'ios' | null;
  standalone?: boolean;
}

export function detectRuntime(signals: RuntimeSignals = {}): AppRuntime {
  if (signals.nativePlatform === 'android' || signals.nativePlatform === 'ios') {
    return signals.nativePlatform;
  }

  if (signals.standalone === true) return 'pwa';

  return 'web';
}
