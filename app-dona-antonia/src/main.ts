import { bootstrapApp } from './app/bootstrap.ts';
import { detectRuntime } from './platform/runtime.ts';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('App root #app not found');
}

const standalone =
  window.matchMedia?.('(display-mode: standalone)').matches === true
  || ('standalone' in navigator
    && (navigator as Navigator & { standalone?: boolean }).standalone === true);

root.dataset.runtime = detectRuntime({ standalone });

void bootstrapApp({ root });
