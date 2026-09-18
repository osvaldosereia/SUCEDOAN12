# App Dona Antônia — Plano de Implementação em Rodadas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir e homologar o App Dona Antônia para PWA, Android e iOS de forma totalmente isolada do `comprar/` atual, conectando produção somente após gate final explícito.

**Architecture:** O aplicativo nasce em `app-dona-antonia/`, com front próprio, Capacitor 8, adapters por plataforma e backend de homologação isolado. O `comprar/` atual é somente referência funcional durante todo o desenvolvimento. Nenhum código, service worker, rota pública, trigger, push, pedido real ou integração externa de produção será ativado antes do gate final.

**Tech Stack:** Node 22+, Vite, TypeScript, HTML/CSS, Capacitor 8, Vitest, Playwright, Supabase PostgreSQL/Edge Functions/Vault em homologação, Firebase Cloud Messaging para push, APNs via FCM no iOS.

**Spec:** `docs/superpowers/specs/2026-09-18-app-dona-antonia-ios-android-design.md`

## Global Constraints

- Todo código novo do app fica em `app-dona-antonia/`.
- `comprar/` não pode ser modificado antes do gate final.
- Nenhuma rota pública aponta para o app antes da homologação integral.
- Todas as integrações externas e flags nascem OFF.
- Nenhum cliente real recebe push, mensagem ou link do app durante desenvolvimento.
- Nenhum pedido real é criado pelo app antes do teste controlado do gate final.
- Nenhuma service role ou segredo entra no cliente.
- Dados pessoais não aparecem em URL, analytics ou logs.
- Sessão persistente nativa não usa `localStorage`.
- WhatsApp é opcional; o app precisa funcionar sem ele.
- Não pedir geolocalização no V1.
- Não usar Apple IAP nem Google Play Billing para os produtos físicos.
- Não usar login social no V1.
- Não usar SDK de anúncios, IDFA ou tracking cross-app.
- Android de publicação deve usar target API 36+.
- O app de produção empacota seus próprios assets; não é apenas uma URL remota.
- Cada rodada deve terminar com testes verdes, revisão e commit próprio.
- Qualquer rodada que descubra risco de interferência no `comprar/` deve parar antes da escrita.

---

# Visão geral das rodadas

| Rodada | Tema | Estado esperado ao terminar |
|---|---|---|
| 0 | Blindagem e governança | projeto impossível de confundir com produção |
| 1 | Fundação técnica | app local inicia isolado |
| 2 | Sistema visual e shell | estrutura mobile-first pronta |
| 3 | Motor conversacional | conversa determinística com fixtures |
| 4 | Catálogo | busca/categorias com dados fictícios |
| 5 | Cestas | escolha e composição fictícia |
| 6 | Carrinho | adicionar/remover/quantidades |
| 7 | Checkout isolado | fluxo completo sem pedido real |
| 8 | Pedido e acompanhamento fictício | status navegável |
| 9 | PWA | instalação em homologação |
| 10 | Android | shell Capacitor Android |
| 11 | iOS | shell Capacitor iOS |
| 12 | Sessão segura | Keychain/Keystore |
| 13 | Backend Supabase de homologação | APIs próprias e isoladas |
| 14 | Identificação/pairing | cliente de teste verificado |
| 15 | Deep links | links de homologação |
| 16 | Push transacional | notificações só de teste |
| 17 | Foto e áudio | mídia nativa segura |
| 18 | Histórico e recompra | cliente verificado em homologação |
| 19 | Privacidade | direitos e preferências |
| 20 | Offline e recuperação | falhas previsíveis |
| 21 | Métricas e observabilidade | telemetria sem PII |
| 22 | Segurança e hardening | suíte de abuso/regressão |
| 23 | Acessibilidade e UX final | experiência pronta |
| 24 | Loja e beta | builds/review profile |
| 25 | Gate de produção | integração controlada, só com autorização |
| 26 | Publicação e pós-lançamento | rollout, monitoramento e rollback |

---

## Rodada 0 — Blindagem e governança do projeto

**Objetivo:** transformar o isolamento em regra verificável por código, não apenas documentação.

**Files:**
- Create: `app-dona-antonia/README.md`
- Create: `app-dona-antonia/.env.example`
- Create: `app-dona-antonia/scripts/verify-isolation.mjs`
- Create: `app-dona-antonia/scripts/test-no-production-effects.mjs`
- Create: `app-dona-antonia/tests/isolation/isolation.test.mjs`
- Modify: `app-dona-antonia/PROJECT-STATUS.md`

**Interfaces:**
- Produces: comando `npm run verify:isolation`.
- Produces: lista explícita de hosts/rotas proibidos durante homologação.
- Consumes: nenhuma API real.

- [ ] Criar teste que falha se arquivos do projeto referenciarem diretamente `/comprar/` como destino de build.
- [ ] Criar teste que falha se aparecerem chaves `service_role`, tokens reais, endpoints Bling/Meta ou executores reais.
- [ ] Criar teste que falha se houver configuração `mobile_app_enabled=true`.
- [ ] Criar allowlist apenas para localhost, fixtures e host de homologação.
- [ ] Rodar `node app-dona-antonia/scripts/verify-isolation.mjs`.
- [ ] Rodar `node app-dona-antonia/scripts/test-no-production-effects.mjs`.
- [ ] Confirmar por diff que nenhum arquivo em `comprar/` mudou.
- [ ] Commit: `chore(app): enforce isolated development guardrails`.

**Gate:** nenhuma rodada seguinte começa se o isolamento não estiver automatizado.

---

## Rodada 1 — Fundação técnica isolada

**Objetivo:** criar um aplicativo web local compilável sem copiar o Comprar atual.

**Files:**
- Create: `app-dona-antonia/package.json`
- Create: `app-dona-antonia/tsconfig.json`
- Create: `app-dona-antonia/vite.config.ts`
- Create: `app-dona-antonia/index.html`
- Create: `app-dona-antonia/src/main.ts`
- Create: `app-dona-antonia/src/app/bootstrap.ts`
- Create: `app-dona-antonia/src/platform/runtime.ts`
- Test: `app-dona-antonia/tests/unit/runtime.test.ts`

**Interfaces:**
- Produces: `detectRuntime(): 'web'|'pwa'|'android'|'ios'`.
- Produces: `bootstrapApp(): Promise<void>`.

- [ ] Escrever teste de `detectRuntime` para web padrão.
- [ ] Implementar detecção sem importar Capacitor quando não necessário.
- [ ] Criar bootstrap mínimo com tela "App Dona Antônia — Homologação".
- [ ] Configurar scripts `dev`, `build`, `test`, `verify:isolation`.
- [ ] Rodar `npm test`.
- [ ] Rodar `npm run build`.
- [ ] Rodar isolamento.
- [ ] Commit: `feat(app): scaffold isolated customer application`.

**Gate:** build local funciona e não acessa nenhuma API.

---

## Rodada 2 — Sistema visual e shell mobile-first

**Objetivo:** criar a base visual própria do aplicativo.

**Files:**
- Create: `app-dona-antonia/src/app/AppShell.ts`
- Create: `app-dona-antonia/src/app/navigation.ts`
- Create: `app-dona-antonia/src/styles/tokens.css`
- Create: `app-dona-antonia/src/styles/base.css`
- Create: `app-dona-antonia/src/styles/shell.css`
- Test: `app-dona-antonia/tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: `navigate(route: AppRoute): void`.
- Produces: rotas `home|catalog|basket|cart|checkout|order|privacy`.

- [ ] Testar viewport 320, 390, 430 e 768 px.
- [ ] Criar topbar, área de conversa, área de ferramenta e barra de pedido.
- [ ] Garantir safe-area CSS.
- [ ] Garantir teclado sem cobrir ação principal.
- [ ] Criar estados de loading, empty, error e offline.
- [ ] Rodar Playwright em Chromium mobile emulado.
- [ ] Commit: `feat(app): add mobile-first application shell`.

**Gate:** nenhum conteúdo comercial ainda; somente shell.

---

## Rodada 3 — Motor conversacional determinístico

**Objetivo:** reproduzir o princípio "Ana fala → cliente escolhe → próxima ferramenta" sem IA e sem backend.

**Files:**
- Create: `app-dona-antonia/src/conversation/types.ts`
- Create: `app-dona-antonia/src/conversation/store.ts`
- Create: `app-dona-antonia/src/conversation/renderer.ts`
- Create: `app-dona-antonia/src/conversation/quickReplies.ts`
- Create: `app-dona-antonia/tests/unit/conversation.test.ts`

**Interfaces:**
- Produces: `ConversationMessage`, `QuickReply`, `ConversationStore`.
- Produces: `assistantSay(text)`, `userDecision(text)`, `setReplies(replies)`.

- [ ] Testar ordenação das mensagens.
- [ ] Testar bloqueio de duplo clique.
- [ ] Testar remoção das respostas rápidas depois da escolha.
- [ ] Implementar indicador "Ana está digitando..." apenas local.
- [ ] Implementar atraso configurável 450–850 ms em modo demo e zero em testes.
- [ ] Rodar testes unitários e E2E.
- [ ] Commit: `feat(app): add deterministic conversation engine`.

**Gate:** conversa funciona integralmente com dados locais.

---

## Rodada 4 — Catálogo fictício e navegação

**Objetivo:** criar experiência de produtos com fixtures, sem ler Supabase.

**Files:**
- Create: `app-dona-antonia/tests/fixtures/products.json`
- Create: `app-dona-antonia/src/catalog/types.ts`
- Create: `app-dona-antonia/src/catalog/catalogRepository.ts`
- Create: `app-dona-antonia/src/catalog/catalogFixtureRepository.ts`
- Create: `app-dona-antonia/src/catalog/catalogView.ts`
- Test: `app-dona-antonia/tests/unit/catalog.test.ts`

**Interfaces:**
- Produces: `CatalogRepository.search(filters): Promise<Product[]>`.
- Produces: categorias `Ofertas|Para Você|Para Casa`.

- [ ] Criar no mínimo 24 produtos fictícios cobrindo categorias/subcategorias/ofertas.
- [ ] Testar busca por nome.
- [ ] Testar categoria/subcategoria.
- [ ] Testar preço promocional.
- [ ] Implementar cards e detalhe de produto.
- [ ] Implementar paginação/virtualização simples sem scroll infinito agressivo.
- [ ] Commit: `feat(app): add isolated catalog experience`.

**Gate:** nenhuma URL de imagem ou produto aponta para produção.

---

## Rodada 5 — Cestas básicas fictícias

**Objetivo:** implementar escolha, composição e personalização de cesta usando fixtures.

**Files:**
- Create: `app-dona-antonia/tests/fixtures/baskets.json`
- Create: `app-dona-antonia/src/baskets/types.ts`
- Create: `app-dona-antonia/src/baskets/basketRepository.ts`
- Create: `app-dona-antonia/src/baskets/basketFixtureRepository.ts`
- Create: `app-dona-antonia/src/baskets/basketFlow.ts`
- Test: `app-dona-antonia/tests/unit/baskets.test.ts`

**Interfaces:**
- Produces: `BasketRepository.list()`.
- Produces: `BasketSelection`.

- [ ] Testar escolha de cesta.
- [ ] Testar exibição de composição.
- [ ] Testar confirmação conversacional.
- [ ] Testar opções pós-cesta: ofertas, outros produtos, revisar pedido.
- [ ] Garantir que oferta não abra automaticamente.
- [ ] Commit: `feat(app): add basket selection flow`.

**Gate:** fluxo equivalente ao conceito do Comprar, mas sem reutilizar arquivos do Comprar.

---

## Rodada 6 — Carrinho e regras locais

**Objetivo:** centralizar estado do pedido local e operações de quantidade.

**Files:**
- Create: `app-dona-antonia/src/cart/types.ts`
- Create: `app-dona-antonia/src/cart/cartStore.ts`
- Create: `app-dona-antonia/src/cart/cartMath.ts`
- Test: `app-dona-antonia/tests/unit/cart.test.ts`

**Interfaces:**
- Produces: `CartStore.add`, `remove`, `setQuantity`, `clear`.
- Produces: `calculateCartTotal(cart)`.

- [ ] Testar adição repetida.
- [ ] Testar remoção.
- [ ] Testar zero/negativo bloqueado.
- [ ] Testar oferta vs preço normal.
- [ ] Testar cesta + extras.
- [ ] Implementar barra fixa "Ver pedido".
- [ ] Commit: `feat(app): add deterministic cart state`.

**Gate:** cálculo de homologação é determinístico e coberto por teste.

---

## Rodada 7 — Checkout completo, ainda fictício

**Objetivo:** testar toda a UX de fechamento sem gravar pedido.

**Files:**
- Create: `app-dona-antonia/src/checkout/types.ts`
- Create: `app-dona-antonia/src/checkout/checkoutFlow.ts`
- Create: `app-dona-antonia/src/checkout/checkoutFixtureGateway.ts`
- Create: `app-dona-antonia/tests/e2e/checkout.spec.ts`

**Interfaces:**
- Produces: `CheckoutGateway.confirm(payload): Promise<CheckoutResult>`.
- Fixture gateway sempre retorna ID iniciado por `TEST-`.

- [ ] Testar cliente visitante.
- [ ] Testar endereço.
- [ ] Testar formas de pagamento permitidas.
- [ ] Testar revisão final.
- [ ] Testar carrinho vazio.
- [ ] Testar pedido fictício marcado visualmente "Homologação".
- [ ] Proibir qualquer POST externo via teste de rede.
- [ ] Commit: `feat(app): add fully isolated checkout flow`.

**Gate:** fluxo do início ao "pedido confirmado" funciona sem rede.

---

## Rodada 8 — Acompanhamento de pedido fictício

**Objetivo:** criar a experiência que diferencia o app de um site simples.

**Files:**
- Create: `app-dona-antonia/src/orders/types.ts`
- Create: `app-dona-antonia/src/orders/orderRepository.ts`
- Create: `app-dona-antonia/src/orders/orderFixtureRepository.ts`
- Create: `app-dona-antonia/src/orders/orderTrackingView.ts`
- Test: `app-dona-antonia/tests/unit/orders.test.ts`

**Interfaces:**
- Produces status `confirmed|separating|ready|on_route|delivered|cancelled`.

- [ ] Testar transições válidas.
- [ ] Testar estados desconhecidos.
- [ ] Criar timeline visual.
- [ ] Criar CTA de suporte sem abrir WhatsApp automaticamente.
- [ ] Criar atualização simulada de status em modo demo.
- [ ] Commit: `feat(app): add order tracking experience`.

**Gate:** acompanhamento funciona totalmente com fixture.

---

## Rodada 9 — PWA isolada de homologação

**Objetivo:** tornar o novo app instalável sem tocar no escopo `/comprar/`.

**Files:**
- Create: `app-dona-antonia/public/manifest.webmanifest`
- Create: `app-dona-antonia/src/platform/serviceWorker.ts`
- Create: `app-dona-antonia/public/sw.js`
- Test: `app-dona-antonia/tests/e2e/pwa.spec.ts`

**Interfaces:**
- Produces instalação PWA apenas no ambiente do app.

- [ ] Testar manifesto.
- [ ] Cachear somente assets estáticos.
- [ ] Proibir cache de POST.
- [ ] Proibir cache de URLs com parâmetros de sessão.
- [ ] Criar tela offline.
- [ ] Testar atualização de versão.
- [ ] Confirmar que nenhum service worker controla `/comprar/`.
- [ ] Commit: `feat(app): add isolated PWA support`.

**Gate:** PWA permanece sem link público de produção.

---

## Rodada 10 — Shell Capacitor Android

**Objetivo:** gerar primeiro aplicativo Android de homologação.

**Files:**
- Create: `app-dona-antonia/capacitor.config.ts`
- Create: `app-dona-antonia/android/**`
- Modify: `app-dona-antonia/package.json`

**Interfaces:**
- Produces runtime `android`.
- Application ID de trabalho: `br.com.donaantonia.app`.

- [ ] Instalar dependências Capacitor 8.
- [ ] Adicionar plataforma Android.
- [ ] Configurar assets locais.
- [ ] Configurar target API 36+.
- [ ] Configurar navegação externa no browser do sistema.
- [ ] Validar safe areas e teclado.
- [ ] Gerar APK debug.
- [ ] Rodar smoke test em emulador/aparelho.
- [ ] Commit: `feat(app): add Android Capacitor shell`.

**Gate:** APK só de homologação; não publicar Play Console.

---

## Rodada 11 — Shell Capacitor iOS

**Objetivo:** gerar primeiro aplicativo iOS de homologação.

**Files:**
- Create: `app-dona-antonia/ios/**`
- Modify: `app-dona-antonia/capacitor.config.ts`

**Interfaces:**
- Produces runtime `ios`.

- [ ] Adicionar plataforma iOS.
- [ ] Configurar bundle ID.
- [ ] Configurar safe areas.
- [ ] Configurar ATS apenas para HTTPS necessário.
- [ ] Garantir links externos fora do WebView quando apropriado.
- [ ] Build em simulador.
- [ ] Build em iPhone real quando ambiente Apple estiver disponível.
- [ ] Commit: `feat(app): add iOS Capacitor shell`.

**Gate:** sem TestFlight ainda.

---

## Rodada 12 — Sessão segura nativa

**Objetivo:** criar armazenamento seguro antes de existir identidade real.

**Files:**
- Create: `app-dona-antonia/src/customer/secureSession.ts`
- Create: `app-dona-antonia/native/secure-session/**`
- Test: `app-dona-antonia/tests/unit/secureSession.test.ts`

**Interfaces:**
- `secureSession.get(): Promise<string|null>`
- `secureSession.set(token: string): Promise<void>`
- `secureSession.clear(): Promise<void>`

- [ ] Implementar adapter memória para testes.
- [ ] Implementar Keychain no iOS.
- [ ] Implementar Keystore/armazenamento criptografado no Android.
- [ ] Testar clear/revogação.
- [ ] Testar que token não aparece em localStorage.
- [ ] Testar que token não aparece em logs.
- [ ] Commit: `feat(app): add native secure session storage`.

**Gate:** identidade real ainda não ativada.

---

## Rodada 13 — Backend Supabase exclusivo de homologação

**Objetivo:** substituir fixtures gradualmente por APIs próprias de homologação.

**Files:**
- Create: `supabase/migrations/<timestamp>_customer_app_homologation_foundation.sql`
- Create: `supabase/functions/customer-app-hml-bootstrap-v1/index.ts`
- Create: `supabase/functions/customer-app-hml-catalog-v1/index.ts`
- Create: `supabase/functions/customer-app-hml-checkout-v1/index.ts`
- Create: `app-dona-antonia/src/platform/apiClient.ts`
- Test: `app-dona-antonia/tests/contract/hml-api.test.ts`

**Interfaces:**
- APIs com prefixo/ambiente explícito de homologação.
- Nenhuma função chama Bling, Meta, PapoAI ou logística.

- [ ] Criar configuração global `enabled=false`.
- [ ] Criar tabelas/estruturas dedicadas de teste ou usar projeto Supabase separado.
- [ ] Criar seeds sintéticos.
- [ ] Criar RLS.
- [ ] Criar rate limits.
- [ ] Criar contratos de catálogo/checkout fictício.
- [ ] Testar que IDs reais de produção não são aceitos.
- [ ] Commit: `feat(app): add isolated Supabase homologation backend`.

**Gate:** nenhuma tabela operacional real recebe escrita.

---

## Rodada 14 — Identificação e pairing seguro em homologação

**Objetivo:** provar o modelo de reconhecimento sem expor clientes reais.

**Files:**
- Create: `app-dona-antonia/src/customer/pairing.ts`
- Create: `supabase/functions/customer-app-hml-pairing-v1/index.ts`
- Create: `app-dona-antonia/tests/contract/pairing.test.ts`

**Interfaces:**
- `createPairingChallenge(): PairingChallenge`
- `pollPairing(challengeId, deviceSecret): PairingState`

- [ ] Criar código humano de curta duração.
- [ ] Criar segredo de dispositivo >=128 bits.
- [ ] TTL de 10 minutos.
- [ ] Uso único.
- [ ] Rate limit.
- [ ] Testar replay.
- [ ] Testar código correto + segredo errado.
- [ ] Inicialmente simular confirmação do WhatsApp por endpoint/admin de homologação.
- [ ] Somente depois testar webhook de homologação, sem contato real.
- [ ] Commit: `feat(app): add secure homologation pairing`.

**Gate:** integração PapoAI/Meta real continua OFF.

---

## Rodada 15 — Deep links de homologação

**Objetivo:** validar roteamento antes de usar o domínio público.

**Files:**
- Create: `app-dona-antonia/src/platform/appLinks.ts`
- Modify: Android intent filters.
- Modify: iOS Associated Domains apenas para host de homologação.
- Test: `app-dona-antonia/tests/unit/appLinks.test.ts`

**Interfaces:**
- `parseAppLink(url): AppRoute | null`.

- [ ] Testar oferta.
- [ ] Testar cesta.
- [ ] Testar pedido com token opaco.
- [ ] Rejeitar telefone/CPF/endereço em query.
- [ ] Testar fallback para home.
- [ ] Validar links Android/iOS em ambiente de teste.
- [ ] Commit: `feat(app): add homologation deep links`.

**Gate:** não publicar `assetlinks.json`/AASA de produção ainda.

---

## Rodada 16 — Push transacional de homologação

**Objetivo:** validar push de ponta a ponta sem atingir clientes.

**Files:**
- Create: `app-dona-antonia/src/notifications/pushClient.ts`
- Create: `supabase/functions/customer-app-hml-push-register-v1/index.ts`
- Create: `supabase/functions/customer-app-hml-notification-dispatch-v1/index.ts`
- Test: `app-dona-antonia/tests/contract/push.test.ts`

**Interfaces:**
- `registerPushToken(token, platform)`
- `setNotificationPreference(kind, enabled)`

- [ ] Configurar projeto FCM de homologação.
- [ ] Configurar APNs de homologação/desenvolvimento.
- [ ] Registrar somente dispositivos de teste.
- [ ] Enviar push "Seu pedido de teste teve uma atualização".
- [ ] Abrir pedido fictício ao tocar.
- [ ] Invalidar token morto.
- [ ] Garantir que marketing continua OFF.
- [ ] Commit: `feat(app): add homologation transactional push`.

**Gate:** nenhum token de cliente real no banco do app.

---

## Rodada 17 — Foto, seletor e áudio

**Objetivo:** validar recursos multimodais nativos com permissões mínimas.

**Files:**
- Create: `app-dona-antonia/src/platform/media.ts`
- Create: `app-dona-antonia/src/conversation/mediaComposer.ts`
- Test: `app-dona-antonia/tests/unit/media.test.ts`

**Interfaces:**
- `pickPhoto()`
- `takePhoto()`
- `recordAudio()`
- `cancelRecording()`

- [ ] Android usa Photo Picker, sem acesso amplo à galeria.
- [ ] Câmera solicitada somente ao tocar.
- [ ] Microfone solicitado somente ao gravar.
- [ ] Implementar cancelamento.
- [ ] Limitar tamanho/duração.
- [ ] Remover EXIF desnecessário quando viável.
- [ ] Upload apenas para storage de homologação.
- [ ] Commit: `feat(app): add privacy-safe media capture`.

**Gate:** storage de produção não é utilizado.

---

## Rodada 18 — Cliente verificado, histórico e recompra

**Objetivo:** demonstrar utilidade nativa para cliente autenticado de teste.

**Files:**
- Create: `app-dona-antonia/src/customer/customerProfile.ts`
- Create: `app-dona-antonia/src/orders/purchaseHistory.ts`
- Create: `app-dona-antonia/src/orders/reorder.ts`
- Test: `app-dona-antonia/tests/unit/reorder.test.ts`

**Interfaces:**
- `loadPurchaseHistory()`
- `prepareReorder(orderId)`

- [ ] Não carregar histórico sem sessão segura.
- [ ] Recalcular preços usando catálogo atual de homologação.
- [ ] Detectar indisponíveis.
- [ ] Exigir confirmação antes de montar carrinho.
- [ ] Criar home "Olá, Maria" somente depois de sessão validada.
- [ ] Commit: `feat(app): add verified customer history and reorder`.

**Gate:** somente clientes sintéticos.

---

## Rodada 19 — Central de privacidade e preferências

**Objetivo:** implementar os direitos e controles antes da publicação.

**Files:**
- Create: `app-dona-antonia/src/privacy/privacyCenter.ts`
- Create: `app-dona-antonia/src/privacy/preferences.ts`
- Create: `supabase/functions/customer-app-hml-privacy-v1/index.ts`
- Test: `app-dona-antonia/tests/e2e/privacy.spec.ts`

**Interfaces:**
- revogar dispositivo;
- solicitar acesso;
- solicitar correção;
- solicitar exclusão;
- marketing push opt-in/out.

- [ ] Criar tela de privacidade.
- [ ] Separar push transacional e marketing.
- [ ] Marketing começa false.
- [ ] Implementar revogação deste aparelho.
- [ ] Implementar requests em homologação.
- [ ] Preparar contrato da futura URL web de exclusão.
- [ ] Commit: `feat(app): add privacy center and consent controls`.

**Gate:** não ativar campanhas.

---

## Rodada 20 — Offline, reconexão e recuperação

**Objetivo:** evitar comportamento perigoso em rede instável.

**Files:**
- Create: `app-dona-antonia/src/platform/networkState.ts`
- Create: `app-dona-antonia/src/app/recovery.ts`
- Test: `app-dona-antonia/tests/e2e/offline.spec.ts`

**Interfaces:**
- `getNetworkState()`
- `retryLastSafeAction()`

- [ ] Catálogo pode exibir shell/cache seguro.
- [ ] Checkout nunca confirma offline.
- [ ] Não enfileirar pedido local para envio silencioso posterior.
- [ ] Preservar carrinho local sem dados sensíveis.
- [ ] Retomar operação após reconexão.
- [ ] Testar timeout/500/JSON inválido.
- [ ] Commit: `feat(app): add safe offline and recovery behavior`.

**Gate:** nenhuma duplicação de pedido em testes de reconexão.

---

## Rodada 21 — Métricas e observabilidade sem PII

**Objetivo:** medir saúde e conversão sem rastreamento publicitário.

**Files:**
- Create: `app-dona-antonia/src/platform/telemetry.ts`
- Create: `supabase/functions/customer-app-hml-telemetry-v1/index.ts`
- Test: `app-dona-antonia/tests/unit/telemetry.test.ts`

**Interfaces:**
- eventos permitidos: `app_open`, `section_opened`, `search`, `basket_selected`, `checkout_started`, `checkout_completed`, `push_opened`, `reorder_started`.

- [ ] Criar schema fechado de eventos.
- [ ] Rejeitar telefone, CPF, endereço e texto livre.
- [ ] Guardar versão do app e plataforma.
- [ ] Criar health de APIs.
- [ ] Criar contadores de falha de pairing/deep link/push.
- [ ] Commit: `feat(app): add privacy-safe operational telemetry`.

**Gate:** nenhuma integração Ads/Analytics de terceiros.

---

## Rodada 22 — Segurança e hardening

**Objetivo:** tentar quebrar o app antes do beta.

**Files:**
- Create: `app-dona-antonia/tests/security/session-abuse.test.ts`
- Create: `app-dona-antonia/tests/security/url-pii.test.ts`
- Create: `app-dona-antonia/tests/security/network-policy.test.ts`
- Create: `app-dona-antonia/docs/homologation/SECURITY-CHECKLIST.md`

- [ ] Testar replay de sessão.
- [ ] Testar token expirado.
- [ ] Testar device revogado.
- [ ] Testar brute force de pairing.
- [ ] Testar PII em URL.
- [ ] Testar endpoint não allowlisted.
- [ ] Testar segredo acidental no bundle.
- [ ] Testar XSS em nomes/produtos/mensagens.
- [ ] Testar upload inválido.
- [ ] Rodar isolamento novamente.
- [ ] Commit: `test(app): harden security boundaries`.

**Gate:** nenhuma vulnerabilidade alta aberta.

---

## Rodada 23 — UX final, acessibilidade e desempenho

**Objetivo:** deixar a experiência pronta para revisão e uso real.

**Files:**
- Modify apenas arquivos dentro de `app-dona-antonia/`.
- Create: `app-dona-antonia/docs/homologation/UX-CHECKLIST.md`

- [ ] Testar fontes grandes.
- [ ] Testar contraste.
- [ ] Testar VoiceOver/TalkBack básico.
- [ ] Testar foco e labels.
- [ ] Testar teclado aberto.
- [ ] Testar aparelhos 320px de largura.
- [ ] Testar Android de entrada.
- [ ] Otimizar imagens e bundles.
- [ ] Medir primeira renderização e navegação.
- [ ] Commit: `perf(app): finalize accessibility and mobile UX`.

**Gate:** checklist UX integral aprovado.

---

## Rodada 24 — Preparação de lojas e beta fechado

**Objetivo:** criar artefatos de review sem conectar produção.

**Files:**
- Create: `app-dona-antonia/docs/store/APP-STORE-CHECKLIST.md`
- Create: `app-dona-antonia/docs/store/PLAY-STORE-CHECKLIST.md`
- Create: `app-dona-antonia/docs/store/REVIEW-PROFILE.md`

- [ ] Preparar ícone/splash.
- [ ] Preparar screenshots com dados fictícios.
- [ ] Preparar descrição.
- [ ] Preparar Política/Termos/URL de suporte.
- [ ] Preparar respostas App Privacy.
- [ ] Preparar Data Safety.
- [ ] Criar perfil de reviewer totalmente isolado.
- [ ] Gerar AAB de beta.
- [ ] Gerar archive iOS.
- [ ] Internal Testing Android.
- [ ] TestFlight interno.
- [ ] Corrigir bugs do beta sem tocar em `comprar/`.
- [ ] Commit: `docs(app): prepare store review and closed beta`.

**Gate:** app completo e aprovado internamente; ainda sem produção.

---

## Rodada 25 — Gate final de integração com produção

**Objetivo:** única rodada em que produção pode começar a ser conectada.

**Pré-condição obrigatória:** autorização explícita do proprietário.

**Files previstos somente após autorização:**
- adapters de produção dentro de `app-dona-antonia/src/**`;
- migrations/funções de produção revisadas;
- configuração de domínio/deep links;
- runtime flags server-side.

- [ ] Registrar SHA/versão homologada.
- [ ] Criar snapshot/backup necessário.
- [ ] Comparar regras de preço, estoque, cestas e checkout com o Comprar atual.
- [ ] Revisar cada endpoint que passará de HML para PROD.
- [ ] Confirmar rollback.
- [ ] Manter `mobile_app_enabled=false`.
- [ ] Conectar leitura de catálogo de produção em modo read-only.
- [ ] Validar equivalência.
- [ ] Conectar cliente/histórico em modo read-only.
- [ ] Validar privacidade.
- [ ] Habilitar criação de **um pedido real controlado**.
- [ ] Confirmar que não duplicou nem acionou executor indevido.
- [ ] Habilitar push apenas para aparelhos internos.
- [ ] Executar canário completo.
- [ ] Somente após nova validação definir `mobile_app_enabled=true`.
- [ ] Commit: `feat(app): connect production behind final gate`.

**Gate:** se qualquer teste divergir, voltar para OFF sem alterar o Comprar atual.

---

## Rodada 26 — Publicação controlada e pós-lançamento

**Objetivo:** publicar com capacidade de interromper rapidamente.

- [ ] Submeter Android/iOS.
- [ ] Distribuição inicial Brasil.
- [ ] Manter Comprar/WhatsApp como fallback.
- [ ] Ativar rollout gradual quando a loja permitir.
- [ ] Monitorar crash/erro/API/checkout.
- [ ] Monitorar pedidos duplicados.
- [ ] Monitorar falhas de push.
- [ ] Ter kill switch ativo.
- [ ] Registrar versão publicada.
- [ ] Criar relatório de primeira semana.
- [ ] Só depois avaliar marketing push, biometria, localização opcional, App Clip e outras evoluções.

**Gate final:** nenhuma evolução pós-lançamento entra no V1 sem novo planejamento.

---

# Critério de avanço entre rodadas

Uma rodada só é considerada concluída quando:

1. os arquivos previstos existem;
2. testes daquela rodada estão verdes;
3. `npm run build` passa quando aplicável;
4. `npm run verify:isolation` passa;
5. não houve alteração em `comprar/`;
6. nenhum efeito externo real ocorreu;
7. o commit da rodada foi criado;
8. `app-dona-antonia/PROJECT-STATUS.md` registra o último checkpoint quando a rodada altera o estado do projeto.

---

# Estratégia de execução

Para manter velocidade sem misturar responsabilidades:

- Rodadas 0–9: web/PWA totalmente local e fixture-first.
- Rodadas 10–12: shells nativos e segurança, ainda sem backend real.
- Rodadas 13–21: backend e integrações **de homologação**.
- Rodadas 22–24: hardening, UX, lojas e beta.
- Rodada 25: primeiro contato autorizado com produção.
- Rodada 26: publicação.

Não existe "atalho" que permita uma rodada anterior ativar produção.

---

# Checkpoint atual

**Situação em 18/09/2026:** planejamento concluído; projeto continua OFF.

**Próxima rodada autorizável:** Rodada 0 — Blindagem e governança.

**Comprar atual:** não modificado por este plano.
