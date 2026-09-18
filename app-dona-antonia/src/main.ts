import './styles/base.css';
import './styles/shell.css';

import { renderAppShell } from './app/AppShell.ts';
import { bootstrapApp } from './app/bootstrap.ts';
import { createNavigator, isAppRoute } from './app/navigation.ts';
import { detectRuntime } from './platform/runtime.ts';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('App root #app not found');
}

const appRoot = root;

const standalone =
  window.matchMedia?.('(display-mode: standalone)').matches === true
  || ('standalone' in navigator
    && (navigator as Navigator & { standalone?: boolean }).standalone === true);

appRoot.dataset.runtime = detectRuntime({ standalone });

await bootstrapApp({ root: appRoot });

const appNavigator = createNavigator();

function render(route = appNavigator.current()): void {
  appRoot.innerHTML = renderAppShell({ route, state: 'ready' });
}

appNavigator.subscribe(render);
render();

appRoot.addEventListener('click', (event) => {
  const target = event.target instanceof Element
    ? event.target.closest<HTMLElement>('[data-route-target]')
    : null;

  const route = target?.dataset.routeTarget;
  if (!route || !isAppRoute(route)) return;

  appNavigator.navigate(route);
});
