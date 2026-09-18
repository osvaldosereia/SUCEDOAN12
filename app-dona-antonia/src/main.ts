import './styles/base.css';
import './styles/shell.css';

import { renderAppShell } from './app/AppShell.ts';
import { bootstrapApp } from './app/bootstrap.ts';
import { createNavigator, isAppRoute } from './app/navigation.ts';
import { HOME_QUICK_REPLIES, routeForQuickReply } from './conversation/quickReplies.ts';
import { renderConversation } from './conversation/renderer.ts';
import { createConversationStore } from './conversation/store.ts';
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
const conversation = createConversationStore();
let conversationHtml = renderConversation(conversation.getSnapshot());

function render(route = appNavigator.current()): void {
  appRoot.innerHTML = renderAppShell({
    route,
    state: 'ready',
    conversationHtml,
  });
}

appNavigator.subscribe(render);
conversation.subscribe((snapshot) => {
  conversationHtml = renderConversation(snapshot);
  render();
});

render();

void conversation.assistantSay('Olá! Como posso ajudar?', {
  replies: HOME_QUICK_REPLIES,
});

const FOLLOW_UP_BY_REPLY: Record<string, string> = {
  baskets: 'Certo. Vou te mostrar as cestas.',
  offers: 'Certo. Vou te mostrar as ofertas.',
  'for-you': 'Certo. Vou abrir as opções para você.',
  'for-home': 'Certo. Vou abrir as opções para casa.',
};

appRoot.addEventListener('click', (event) => {
  const element = event.target instanceof Element ? event.target : null;
  if (!element) return;

  const replyTarget = element.closest<HTMLElement>('[data-conversation-reply]');
  const replyId = replyTarget?.dataset.conversationReply;

  if (replyId) {
    const route = routeForQuickReply(replyId);
    if (!route || !conversation.userDecision(replyId)) return;

    appNavigator.navigate(route);
    void conversation.assistantSay(FOLLOW_UP_BY_REPLY[replyId] ?? 'Vamos continuar.');
    return;
  }

  const routeTarget = element.closest<HTMLElement>('[data-route-target]');
  const route = routeTarget?.dataset.routeTarget;
  if (!route || !isAppRoute(route)) return;

  appNavigator.navigate(route);
});
