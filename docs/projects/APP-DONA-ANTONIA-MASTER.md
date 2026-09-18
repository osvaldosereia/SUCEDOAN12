# Projeto Mestre — App Dona Antônia

**Data de consolidação:** 18/09/2026  
**Repositório:** `osvaldosereia/SUCEDOAN12`  
**Documento de continuidade:** este arquivo é a referência principal para retomar o projeto em qualquer nova janela.  
**Estado operacional:** **OFF / ISOLADO / NÃO PUBLICADO / NÃO USAR EM PRODUÇÃO**  
**Branch de desenvolvimento atual:** `app-dona-antonia-r0-isolation`  
**Pull Request de homologação:** #396 — draft — **NÃO MERGEAR**  
**Código do app:** `app-dona-antonia/`  
**Comprar atual:** `comprar/` — **NÃO MODIFICAR durante o desenvolvimento do app**  
**Próxima rodada autorizável:** **Rodada 4 — Catálogo fictício e navegação**

---

# 1. Objetivo do projeto

Criar o aplicativo oficial **Dona Antônia** para:

- PWA;
- Android / Google Play;
- iPhone / App Store;

sem interferir no sistema `comprar/` que os clientes usam hoje.

O aplicativo deve oferecer uma experiência simples, humana e conversacional para clientes da Dona Antônia, mantendo foco em:

- cestas básicas;
- ofertas;
- produtos de supermercado;
- carrinho;
- checkout;
- acompanhamento de pedido;
- recompra;
- histórico para cliente verificada;
- foto e áudio;
- notificações;
- privacidade;
- integração futura com o ecossistema Dona Antônia.

A área comercial continua sendo **Cuiabá e Várzea Grande**.

O projeto será desenvolvido por completo, homologado e testado antes de qualquer conexão real com produção.

---

# 2. Regra máxima do projeto

Esta regra é soberana sobre qualquer outra decisão.

## Até a Rodada 25:

É proibido:

- modificar qualquer arquivo de `comprar/`;
- apontar clientes reais para o novo app;
- publicar rota pública do app;
- registrar service worker que controle o Comprar atual;
- gerar pedido real;
- enviar push real;
- enviar mensagem real;
- acionar Bling;
- acionar Meta;
- acionar PapoAI;
- acionar logística;
- escrever em clientes, pedidos ou estoque reais;
- usar `service_role` no cliente;
- colocar segredo dentro do app;
- usar dados pessoais em URLs;
- criar trigger conectado a evento operacional real;
- habilitar qualquer flag de produção.

Todo recurso novo nasce **OFF**.

O aplicativo deve poder ser removido apagando `app-dona-antonia/` e seus recursos de homologação sem quebrar o Comprar atual.

---

# 3. Decisões arquiteturais congeladas

Até nova decisão explícita:

1. O app será feito com **Capacitor**, não Flutter nem React Native.
2. O front do app é separado do `comprar/`.
3. O app de produção terá seus próprios assets empacotados.
4. Não será apenas um WebView apontando para o site.
5. Supabase continuará sendo o backend final.
6. Durante o desenvolvimento, backend real não será conectado.
7. Não criar novas automações Make para o app.
8. WhatsApp será opcional.
9. O app deve funcionar sem WhatsApp instalado.
10. Não usar login Google/Facebook no V1.
11. Não pedir geolocalização no V1.
12. Não usar Apple IAP.
13. Não usar Google Play Billing.
14. A Dona Antônia vende produtos físicos e mantém pagamento fora dos sistemas de cobrança digital das lojas.
15. Não usar OneSignal no MVP.
16. Push futuro: Supabase → FCM → Android/APNs.
17. Não usar SDK de anúncios.
18. Não usar IDFA.
19. Não usar tracking cross-app.
20. Não usar acesso amplo à galeria.
21. Android deverá usar Photo Picker quando aplicável.
22. Sessão persistente nativa não pode ficar em `localStorage`.
23. iOS deverá usar Keychain.
24. Android deverá usar Keystore/armazenamento criptografado.
25. Histórico de cliente nunca será liberado apenas digitando telefone.
26. Marketing push exige opt-in separado.
27. Android de publicação deverá atender API 36+.
28. Publicação inicial prevista para Brasil.
29. Produção só será conectada na Rodada 25.
30. Toda rodada precisa terminar com testes, revisão e checkpoint.

---

# 4. Arquitetura final pretendida

```
                       SUPABASE
              DB / Edge / Vault / Storage
                         │
          ┌──────────────┼──────────────┐
          │              │              │
      Comprar atual     PWA        App Capacitor
      (intocado)      novo app      Android+iOS
```

Durante o desenvolvimento:

```
comprar/
  └── PRODUÇÃO ATUAL — NÃO MODIFICAR

app-dona-antonia/
  └── NOVO APP — HOMOLOGAÇÃO / OFF
```

O app utilizará adapters para trocar:

- fixtures locais;
- backend de homologação;
- backend de produção somente no gate final.

---

# 5. Stack definida

## Front

- Node 22+
- TypeScript
- Vite
- HTML/CSS
- Capacitor 8

## Testes previstos

- testes Node nativos para contratos simples;
- TypeScript typecheck;
- Vitest quando dependências estiverem disponíveis;
- Playwright para testes E2E/visuais;
- testes Android reais;
- testes iPhone reais.

## Backend futuro

- Supabase PostgreSQL;
- Edge Functions;
- Vault;
- Storage;
- RLS;
- Firebase Cloud Messaging;
- APNs via FCM.

## Sem custo desnecessário

Não contratar inicialmente:

- OneSignal;
- Appflow;
- pipelines caros de build;
- SDKs de analytics publicitário;
- serviços de login social.

---

# 6. Estrutura prevista do projeto

```
app-dona-antonia/
  README.md
  PROJECT-STATUS.md
  package.json
  tsconfig.json
  vite.config.ts
  index.html

  src/
    app/
    conversation/
    catalog/
    baskets/
    cart/
    checkout/
    customer/
    orders/
    privacy/
    notifications/
    platform/
    styles/

  public/
    manifest.webmanifest
    icons/

  native/
    secure-session/

  android/
  ios/

  tests/
    unit/
    contract/
    e2e/
    isolation/
    security/
    fixtures/

  scripts/
    verify-isolation.mjs
    test-no-production-effects.mjs

  docs/
    decisions/
    homologation/
    store/
```

---

# 7. Experiência prevista

## Visitante

```
Abrir app
  ↓
Ana: Olá! Como posso ajudar?
  ↓
Cestas | Ofertas | Para Você | Para Casa
  ↓
Escolha / busca / carrinho
  ↓
Checkout
  ↓
Pedido confirmado
  ↓
Acompanhar pedido
```

## Cliente verificada

```
Abrir app
  ↓
Olá, Maria
  ↓
Repetir última cesta
Minha última compra
Cestas
Ofertas
Para Você
  ↓
Checkout simplificado
```

Nenhum dado pessoal deverá aparecer antes da sessão segura ser validada.

---

# 8. Identidade futura da cliente

A estratégia prevista é vinculação opcional pelo WhatsApp sem SMS pago.

Fluxo futuro:

1. app cria `pairing_challenge`;
2. gera código curto;
3. gera segredo privado >=128 bits;
4. cliente toca “Confirmar pelo WhatsApp”;
5. mensagem pré-preenchida é aberta;
6. webhook recebe o telefone real;
7. Supabase valida challenge;
8. vincula ao cadastro;
9. app resgata sessão usando segredo privado;
10. sessão é salva em armazenamento seguro.

Regras:

- TTL 10 minutos;
- uso único;
- rate limit;
- código humano sozinho não libera sessão;
- sessão revogável;
- nenhuma PII no token;
- visitante continua comprando sem vincular cadastro.

---

# 9. Push futuro

Separação obrigatória:

## Transacional

- pedido confirmado;
- em separação;
- pronto;
- saiu para entrega;
- atualização relevante.

## Marketing

- ofertas;
- campanhas;
- recompra;
- lembretes promocionais.

Preferências separadas:

- `push_transactional_enabled`;
- `push_marketing_opt_in`;
- `push_marketing_opt_in_at`;
- `push_marketing_opt_out_at`.

Marketing começa **OFF**.

Push não deve exibir CPF, endereço ou forma de pagamento na tela bloqueada.

---

# 10. Privacidade

O V1 deverá ter Central de Privacidade com:

- Política de Privacidade;
- Termos;
- dados usados;
- preferências de push;
- acesso aos dados;
- correção;
- exclusão;
- revogação do dispositivo;
- contato de privacidade.

Não registrar em analytics:

- telefone;
- CPF;
- endereço;
- conteúdo livre de conversa;
- áudio;
- foto.

---

# 11. Deep links previstos

Exemplos conceituais futuros:

- `/app/ofertas`
- `/app/cestas/<slug>`
- `/app/pedido/<token-opaco>`
- `/app/conectar/<token-opaco>`

Nenhum link deve carregar:

- CPF;
- telefone;
- endereço.

iOS:

- Universal Links;
- Associated Domains.

Android:

- Android App Links;
- `assetlinks.json`.

---

# 12. Roadmap completo — 27 rodadas

Legenda:

- ✅ concluída;
- ▶ próxima;
- ⏳ futura;
- 🔒 conexão com produção proibida até Rodada 25.

| Rodada | Tema | Estado |
|---|---|---|
| 0 | Blindagem e governança | ✅ |
| 1 | Fundação técnica isolada | ✅ |
| 2 | Sistema visual e shell mobile-first | ✅ |
| 3 | Motor conversacional determinístico | ✅ |
| 4 | Catálogo fictício e navegação | ▶ |
| 5 | Cestas básicas fictícias | ⏳ |
| 6 | Carrinho e regras locais | ⏳ |
| 7 | Checkout isolado | ⏳ |
| 8 | Pedido e acompanhamento fictício | ⏳ |
| 9 | PWA isolada | ⏳ |
| 10 | Shell Capacitor Android | ⏳ |
| 11 | Shell Capacitor iOS | ⏳ |
| 12 | Sessão segura nativa | ⏳ |
| 13 | Backend Supabase de homologação | ⏳ |
| 14 | Identificação/pairing | ⏳ |
| 15 | Deep links | ⏳ |
| 16 | Push transacional de homologação | ⏳ |
| 17 | Foto e áudio | ⏳ |
| 18 | Histórico e recompra | ⏳ |
| 19 | Central de privacidade | ⏳ |
| 20 | Offline e recuperação | ⏳ |
| 21 | Métricas e observabilidade | ⏳ |
| 22 | Segurança e hardening | ⏳ |
| 23 | UX final e acessibilidade | ⏳ |
| 24 | Lojas e beta | ⏳ |
| 25 | Gate final de produção | 🔒 |
| 26 | Publicação e pós-lançamento | ⏳ |

---

# 13. Rodada 0 — concluída

## Objetivo

Transformar a separação do app em uma proteção automática.

## Entregas

Criados:

- `app-dona-antonia/README.md`
- `app-dona-antonia/.env.example`
- `app-dona-antonia/package.json`
- `app-dona-antonia/scripts/verify-isolation.mjs`
- `app-dona-antonia/scripts/test-no-production-effects.mjs`
- `app-dona-antonia/tests/isolation/isolation.test.mjs`

## Proteções

O guard bloqueia:

- referência runtime direta ao Comprar atual;
- `service_role`;
- Supabase atual de produção;
- Bling;
- Meta Graph;
- `mobile_app_enabled=true`;
- pedidos reais;
- push real;
- executores externos.

Config padrão:

```
APP_ENV=homologation
MOBILE_APP_ENABLED=false
APP_ALLOW_REAL_ORDERS=false
APP_ALLOW_REAL_PUSH=false
APP_ALLOW_EXTERNAL_EXECUTORS=false
```

## Validação

- 5 testes;
- 5 aprovados;
- 0 falhas.

---

# 14. Rodada 1 — concluída

## Objetivo

Criar o scaffold técnico do app novo.

## Entregas

Criados:

- `src/platform/runtime.ts`
- `src/app/bootstrap.ts`
- `src/main.ts`
- `index.html`
- `tsconfig.json`
- `vite.config.ts`

## Comportamento

Runtime previsto:

- `web`
- `pwa`
- `android`
- `ios`

O bootstrap exibe:

**App Dona Antônia — Homologação**

O HTML usa:

`noindex,nofollow`

Nenhuma API é chamada.

## Validação

- TDD aplicado;
- testes falharam antes da implementação;
- 4 testes unitários aprovados;
- typecheck aprovado;
- sintaxe TypeScript aprovada;
- JSON validado.

## Limitação registrada

O ambiente de execução apresentou `EAI_AGAIN` para o registry npm.

Portanto:

- `vite build` completo não foi executado;
- nunca registrar como build aprovado até ser realmente executado.

---

# 15. Rodada 2 — concluída

## Objetivo

Criar o sistema visual e o shell mobile-first.

## Entregas

Criados:

- `src/app/AppShell.ts`
- `src/app/navigation.ts`
- `src/styles/tokens.css`
- `src/styles/base.css`
- `src/styles/shell.css`

## Estrutura visual

O shell possui quatro regiões:

1. topo;
2. conversa;
3. ferramenta/contexto;
4. barra do pedido.

## Rotas internas

- `home`
- `catalog`
- `basket`
- `cart`
- `checkout`
- `order`
- `privacy`

## Estados visuais

- `ready`
- `loading`
- `empty`
- `error`
- `offline`

## Diretrizes visuais já implantadas

- mobile-first;
- bastante respiro;
- safe area;
- mínimo 320 px;
- foco visível;
- `prefers-reduced-motion`;
- barra de pedido fixa;
- marcação permanente “Homologação”;
- sem aparência de site carregado de menus.

## Validação

- TDD;
- 5 testes novos aprovados;
- typecheck aprovado;
- problema de narrowing do root encontrado e corrigido;
- nenhum arquivo de `comprar/` alterado.

## Pendente futuro

Playwright/browser visual real continua pendente por indisponibilidade de instalação de dependências.

---

# 16. Rodada 3 — concluída

## Objetivo

Criar o motor conversacional local antes de IA/backend.

## Arquivos principais

- `src/conversation/types.ts`
- `src/conversation/store.ts`
- `src/conversation/renderer.ts`
- `src/conversation/quickReplies.ts`

## Fluxo implementado

```
Ana fala
  ↓
respostas rápidas
  ↓
cliente escolhe
  ↓
escolha vira bolha do cliente
  ↓
botões desaparecem
  ↓
rota interna muda
  ↓
Ana mostra “digitando”
  ↓
Ana responde
```

## Opções iniciais

- Cestas
- Ofertas
- Para Você
- Para Casa

## Comportamentos implementados

- ordem determinística de mensagens;
- bloqueio de toque duplicado;
- quick replies removidas após decisão;
- indicador “Ana está digitando...”;
- atraso humanizado de 450–850 ms;
- 0 ms em testes;
- renderer faz escape de HTML;
- nenhuma IA;
- nenhuma rede.

## Validação

- teste vermelho comprovado antes da implementação;
- 8 testes específicos do motor aprovados;
- 12 testes combinados shell + conversa aprovados;
- typecheck aprovado;
- escape de HTML verificado;
- nenhum arquivo do Comprar alterado.

---

# 17. Estado atual exato

**Última rodada concluída:** Rodada 3.

**Próxima rodada:** Rodada 4 — Catálogo fictício e navegação.

Ainda não foi implementado:

- catálogo real;
- Supabase;
- cestas reais;
- carrinho real;
- checkout;
- pedido;
- PWA;
- Android;
- iOS;
- sessão segura;
- pairing;
- deep links;
- push;
- mídia;
- histórico;
- privacidade;
- telemetria;
- publicação.

Tudo permanece OFF.

---

# 18. Rodada 4 — próxima execução

## Objetivo

Construir o catálogo completo usando somente fixtures locais.

## Arquivos previstos

- `tests/fixtures/products.json`
- `src/catalog/types.ts`
- `src/catalog/catalogRepository.ts`
- `src/catalog/catalogFixtureRepository.ts`
- `src/catalog/catalogView.ts`
- `tests/unit/catalog.test.ts`

## Contrato previsto

```ts
CatalogRepository.search(filters): Promise<Product[]>
```

## Categorias iniciais

- Ofertas
- Para Você
- Para Casa

## Deve implementar

- no mínimo 24 produtos fictícios;
- busca por nome;
- categorias;
- subcategorias;
- preço normal;
- preço promocional;
- destaque visual de oferta;
- cards;
- detalhe do produto;
- paginação/virtualização simples;
- integração com conversa/navegação.

## Proibido nesta rodada

- Supabase;
- produtos reais;
- imagens reais de produção;
- estoque real;
- pedido real;
- endpoint externo;
- alteração do Comprar.

## Gate da Rodada 4

Só concluir após:

- testes verdes;
- typecheck;
- isolamento aprovado;
- nenhuma alteração em `comprar/`;
- checkpoint salvo.

---

# 19. Próximas rodadas resumidas

## Rodada 5 — Cestas fictícias

- fixtures de cestas;
- composição;
- escolha;
- personalização;
- confirmação conversacional.

## Rodada 6 — Carrinho

- adicionar;
- remover;
- quantidade;
- limpar;
- preço promocional;
- cesta + extras.

## Rodada 7 — Checkout isolado

- visitante;
- dados;
- endereço;
- pagamento;
- revisão;
- pedido `TEST-*`;
- nenhum POST externo.

## Rodada 8 — Pedido fictício

Status:

- confirmed;
- separating;
- ready;
- on_route;
- delivered;
- cancelled.

## Rodada 9 — PWA

- manifest;
- ícones;
- service worker;
- cache seguro;
- offline shell;
- nunca controlar `/comprar/`.

## Rodada 10 — Android

- Capacitor;
- Android project;
- assets locais;
- API 36+;
- APK/AAB de homologação.

## Rodada 11 — iOS

- projeto Xcode;
- ATS;
- safe areas;
- simulador/aparelho;
- sem TestFlight público ainda.

## Rodada 12 — Sessão segura

- Keychain;
- Keystore;
- adapter memória para teste;
- nada de localStorage.

## Rodada 13 — Supabase homologação

- backend separado/prefixado;
- RLS;
- seeds sintéticos;
- Edge Functions HML;
- nenhuma escrita operacional.

## Rodada 14 — Pairing

- challenge;
- segredo >=128 bits;
- TTL 10 min;
- rate limit;
- replay bloqueado.

## Rodada 15 — Deep links

- Android App Links;
- Universal Links;
- tokens opacos;
- host de homologação.

## Rodada 16 — Push transacional HML

- FCM;
- APNs;
- somente dispositivos de teste.

## Rodada 17 — Foto e áudio

- Photo Picker;
- câmera;
- microfone;
- cancelamento;
- limites;
- storage HML.

## Rodada 18 — Histórico/recompra

- somente cliente verificada;
- recalcular preços;
- detectar indisponíveis.

## Rodada 19 — Privacidade

- central;
- direitos;
- opt-in/out;
- revogação.

## Rodada 20 — Offline

- não confirmar pedido offline;
- não enfileirar pedido silenciosamente;
- recuperar conexão.

## Rodada 21 — Telemetria

Eventos permitidos:

- app_open;
- section_opened;
- search;
- basket_selected;
- checkout_started;
- checkout_completed;
- push_opened;
- reorder_started.

Sem PII.

## Rodada 22 — Hardening

- replay;
- sessão expirada;
- brute force;
- XSS;
- upload inválido;
- segredos no bundle;
- URL com PII.

## Rodada 23 — UX final

- VoiceOver;
- TalkBack;
- fontes grandes;
- contraste;
- teclado;
- desempenho;
- Android de entrada.

## Rodada 24 — Lojas e beta

- ícone;
- splash;
- screenshots;
- descrição;
- Data Safety;
- App Privacy;
- perfil reviewer;
- Internal Testing;
- TestFlight.

## Rodada 25 — Gate de produção

**Primeira rodada autorizada a tocar produção.**

Sequência:

1. autorização explícita;
2. snapshot/backup;
3. revisar endpoints;
4. manter flag OFF;
5. leitura de catálogo em read-only;
6. comparar dados;
7. cliente/histórico read-only;
8. um pedido real controlado;
9. push somente interno;
10. canário;
11. só depois habilitar produção.

Qualquer divergência → OFF novamente.

## Rodada 26 — Publicação

- submissão Apple/Google;
- rollout controlado;
- fallback Comprar/WhatsApp;
- kill switch;
- monitoramento;
- relatório pós-lançamento.

---

# 20. Regras das lojas consideradas

## Apple

O app precisa ter utilidade além de um site empacotado.

O projeto contempla:

- sessão segura;
- acompanhamento de pedido;
- push;
- histórico/recompra;
- deep links;
- mídia;
- privacidade;
- offline.

WhatsApp não pode ser obrigatório.

Produtos físicos não usarão In-App Purchase.

## Google Play

Produtos físicos não usam Play Billing.

Android de publicação: API 36+.

Evitar acesso amplo a fotos; usar Photo Picker.

Data Safety deverá refletir exatamente os dados realmente coletados.

---

# 21. Branch, PR e regra de merge

## Branch atual

`app-dona-antonia-r0-isolation`

## PR atual

**#396**

Status:

- draft;
- NÃO MERGEAR;
- somente homologação.

O PR contém as Rodadas 0–3.

A `main` continua recebendo outros trabalhos do projeto Dona Antônia, portanto a branch pode ficar atrás da main. Isso é esperado.

Não fazer rebase/merge automático só para “atualizar” a branch sem antes analisar conflitos.

---

# 22. Documentos relacionados

## Design arquitetural oficial

`docs/superpowers/specs/2026-09-18-app-dona-antonia-ios-android-design.md`

## Plano detalhado de execução

`docs/superpowers/plans/2026-09-18-app-dona-antonia-rodadas-implementacao.md`

## Status dentro da branch

`app-dona-antonia/PROJECT-STATUS.md`

## Documento mestre de continuidade

`docs/projects/APP-DONA-ANTONIA-MASTER.md`

---

# 23. RETOMADA OBRIGATÓRIA EM NOVA JANELA

Ao abrir uma nova conversa e pedir para continuar este projeto, seguir exatamente esta sequência:

1. Ler este arquivo:
   `docs/projects/APP-DONA-ANTONIA-MASTER.md`

2. Ler o design:
   `docs/superpowers/specs/2026-09-18-app-dona-antonia-ios-android-design.md`

3. Ler o plano:
   `docs/superpowers/plans/2026-09-18-app-dona-antonia-rodadas-implementacao.md`

4. Buscar a branch:
   `app-dona-antonia-r0-isolation`

5. Ler na branch:
   `app-dona-antonia/PROJECT-STATUS.md`

6. Conferir o PR:
   **#396**

7. Não trabalhar em `comprar/`.

8. Não fazer merge para main.

9. Conferir qual foi o último checkpoint.

10. Neste snapshot:
    - Rodadas 0, 1, 2 e 3 estão concluídas;
    - próxima é a Rodada 4.

11. Executar TDD:
    - teste primeiro;
    - observar falha;
    - implementação mínima;
    - testes verdes;
    - typecheck;
    - isolamento;
    - checkpoint.

12. Ao concluir nova rodada:
    - atualizar `app-dona-antonia/PROJECT-STATUS.md`;
    - atualizar este documento-mestre na `main`;
    - atualizar título/corpo do PR #396;
    - pedir autorização antes de iniciar a rodada seguinte.

---

# 24. Preferência operacional do proprietário

O proprietário definiu:

> O assistente decide sempre o melhor caminho técnico e só pede autorização para continuar.

Portanto:

- não transferir decisões técnicas comuns ao proprietário;
- escolher arquitetura, sequência e implementação;
- explicar objetivamente o que foi concluído;
- pedir autorização apenas antes de iniciar a próxima rodada;
- exceções: decisões comerciais/jurídicas que dependam obrigatoriamente do proprietário.

---

# 25. Critério universal de conclusão de rodada

Uma rodada só pode ser marcada como concluída quando:

1. arquivos previstos existem;
2. testes passam;
3. typecheck passa quando aplicável;
4. isolamento passa;
5. nenhum arquivo do Comprar foi alterado;
6. nenhum efeito real ocorreu;
7. checkpoint foi salvo;
8. limitações reais foram registradas sem fingir sucesso;
9. PR continua draft;
10. documento mestre é atualizado.

---

# 26. Situação final deste snapshot

**Data:** 18/09/2026

**Projeto:** App Dona Antônia

**Estado:** OFF / HOMOLOGAÇÃO / ISOLADO

**Concluído:**

- Rodada 0;
- Rodada 1;
- Rodada 2;
- Rodada 3.

**Próxima:**

**Rodada 4 — Catálogo fictício e navegação.**

**Produção:** intocada.

**Comprar atual:** intocado.

**Supabase real:** não conectado.

**Meta/PapoAI/Bling:** não conectados.

**Pedido real:** nenhum.

**Push real:** nenhum.

**Publicação:** nenhuma.

Este documento deve ser atualizado continuamente para funcionar como a memória operacional oficial do projeto.
