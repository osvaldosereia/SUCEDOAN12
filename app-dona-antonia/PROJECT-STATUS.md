# App Dona Antônia — Status do Projeto

**Estado operacional:** OFF / ISOLADO / NÃO PUBLICADO  
**Uso por clientes:** PROIBIDO  
**Integração com Comprar atual:** DESATIVADA  
**Integrações externas reais:** DESATIVADAS  
**Pedidos reais:** PROIBIDOS  
**Push para clientes reais:** PROIBIDO

## Regra de isolamento

Todo desenvolvimento do novo aplicativo ocorre dentro de `app-dona-antonia/`.

Até a homologação integral:

- não modificar `comprar/`;
- não publicar rota pública do app;
- não registrar service worker no escopo do Comprar;
- não conectar gatilhos a pedidos reais;
- não enviar mensagens/push reais;
- não escrever em clientes, pedidos, estoque ou logística de produção;
- não acionar Bling, Meta, PapoAI ou outros executores externos;
- usar somente fixtures, mocks e ambiente de homologação;
- toda flag e integração nasce OFF.

## Gate para implantação

A ativação só poderá acontecer depois de:

1. aplicativo inteiro concluído;
2. testes automatizados aprovados;
3. testes reais em Android e iPhone aprovados;
4. validação de segurança e privacidade;
5. comparação funcional com o Comprar atual;
6. plano de rollback pronto;
7. teste controlado de integração;
8. autorização explícita do proprietário para conectar à produção.

## Documento mestre

Ver:
`docs/superpowers/specs/2026-09-18-app-dona-antonia-ios-android-design.md`

## Situação atual

Somente planejamento/documentação. Nenhum código de produção do aplicativo foi ativado.


## Plano oficial de programação

Documento:
`docs/superpowers/plans/2026-09-18-app-dona-antonia-rodadas-implementacao.md`

Total: 27 rodadas numeradas de 0 a 26.

**Próxima rodada permitida:** Rodada 10 — Shell Capacitor Android.

Nenhuma rodada futura deve ser pulada se isso reduzir o isolamento, a segurança ou antecipar conexão com produção.


## Checkpoint — Rodada 0

**Estado:** CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- guard automático contra referência direta ao `/comprar/`;
- bloqueio de material `service_role`;
- bloqueio das flags de pedido real, push real e executores externos;
- bloqueio explícito dos hosts atuais de produção do Supabase, Bling e Meta no runtime do app;
- configuração padrão de homologação com todos os efeitos reais OFF;
- testes automáticos de isolamento.

Validação executada com Node 22:
- 5 testes;
- 5 aprovados;
- 0 falhas.

**Próxima rodada após autorização:** Rodada 1 — Fundação técnica isolada.

A branch ainda não deve ser integrada à produção.


## Checkpoint — Rodada 1

**Estado:** IMPLEMENTAÇÃO CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- scaffold próprio em TypeScript;
- configuração Vite isolada;
- entrypoint próprio;
- detecção de runtime `web | pwa | android | ios`;
- bootstrap que identifica visualmente o ambiente como Homologação;
- `noindex,nofollow` no shell;
- nenhum endpoint externo;
- nenhum acesso a Supabase, Meta, PapoAI, Bling ou Comprar atual.

Validações executadas:
- ciclo TDD: testes falharam antes das implementações de runtime/bootstrap;
- 4 testes unitários novos aprovados;
- typecheck local da pasta `src/` aprovado com TypeScript disponível no ambiente;
- checagem sintática TypeScript aprovada;
- JSON de configuração validado;
- tentativa de instalar dependências para executar `vite build` bloqueada exclusivamente por indisponibilidade de DNS do registry npm no ambiente de execução (`EAI_AGAIN`).

A versão declarada do Vite segue a linha 8.3 e requer Node >=22.12; o projeto exige Node >=22.12.

**Importante:** a impossibilidade de baixar dependências neste ambiente foi registrada; não foi tratada como build executado.

**Próxima rodada autorizável:** Rodada 2 — Sistema visual e shell mobile-first.

O projeto permanece OFF e sem qualquer conexão com produção.


## Checkpoint — Rodada 2

**Estado:** IMPLEMENTAÇÃO CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- sistema visual próprio do App Dona Antônia;
- tokens de design isolados;
- shell mobile-first com topo, conversa, ferramenta/contexto e barra do pedido;
- navegação determinística entre `home | catalog | basket | cart | checkout | order | privacy`;
- estados explícitos `ready | loading | empty | error | offline`;
- safe areas para dispositivos com recorte/home indicator;
- largura mínima de 320 px;
- suporte a `prefers-reduced-motion`;
- foco de teclado visível;
- marcação permanente de Homologação;
- nenhuma lógica comercial real e nenhuma chamada de rede.

Validações executadas:
- TDD: teste de navegação falhou inicialmente por ausência de `navigation.ts`;
- 5 testes novos de shell/navegação aprovados;
- typecheck da pasta `src/` aprovado após correção do narrowing do elemento raiz;
- nenhum endpoint de produção foi adicionado;
- nenhum arquivo de `comprar/` foi modificado.

Limitação do ambiente:
- teste visual automatizado em navegador/Playwright ainda não foi executado porque as dependências externas não podem ser baixadas neste ambiente;
- a estrutura foi validada por testes unitários e typecheck; o teste visual real será obrigatório antes do beta.

**Próxima rodada autorizável:** Rodada 3 — Motor conversacional determinístico.

O projeto permanece OFF, não publicado e sem conexão com produção.


## Checkpoint — Rodada 3

**Estado:** IMPLEMENTAÇÃO CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- motor conversacional determinístico e totalmente local;
- tipos próprios para mensagens, respostas rápidas e snapshot da conversa;
- store com ordem determinística de mensagens;
- primeira decisão bloqueia toque duplicado;
- respostas rápidas desaparecem imediatamente após a escolha;
- escolha do cliente vira bolha de usuário;
- indicador local `Ana está digitando...`;
- atraso humanizado configurável entre 450 e 850 ms no modo normal e 0 ms em testes;
- renderer com escape de HTML;
- quatro escolhas iniciais: `Cestas | Ofertas | Para Você | Para Casa`;
- escolha conversa com a navegação interna e abre a rota correspondente;
- fala seguinte da Ana é local e determinística;
- nenhum uso de IA, Supabase, PapoAI, Meta, Bling ou rede.

Validações executadas:
- TDD do store: teste falhou primeiro por ausência de `conversation/store.ts`;
- TDD da integração: teste falhou primeiro porque o shell ainda ignorava `conversationHtml`;
- 8 testes específicos do motor conversacional aprovados;
- 12 testes combinados de shell + conversa aprovados;
- typecheck do motor, shell, navegação e `main.ts` aprovado no ambiente local;
- renderer confirmou escape de `<cliente>` para HTML seguro;
- nenhuma alteração em `comprar/`.

Limitação mantida:
- o build Vite completo segue dependente da disponibilidade do registry npm; isso continua registrado e não é tratado como build executado.

**Próxima rodada autorizável:** Rodada 4 — Catálogo fictício e navegação.

O projeto permanece OFF, não publicado e sem conexão com produção.


## Memória operacional oficial

O documento principal para retomada em novas janelas está salvo na `main`:

`docs/projects/APP-DONA-ANTONIA-MASTER.md`

Ao retomar o projeto, este arquivo deve ser lido primeiro, seguido do design, plano de rodadas e deste `PROJECT-STATUS.md`.

**Snapshot atual:** Rodadas 0–9 concluídas; próxima Rodada 10.


## Checkpoint — Rodada 4

**Estado:** IMPLEMENTAÇÃO CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- catálogo 100% sintético com 24 produtos de teste;
- nenhum produto, imagem ou preço veio da produção;
- contratos `Product`, `CatalogFilters` e `CatalogRepository`;
- repositório em memória com busca sem diferenciar maiúsculas/minúsculas ou acentos;
- filtros `Todos | Ofertas | Para Você | Para Casa`;
- categorias e subcategorias derivadas dos produtos ativos da seção;
- busca textual;
- paginação determinística por `offset/limit`;
- preço normal e preço promocional;
- etiqueta `Oferta`;
- cards responsivos;
- detalhe do produto;
- placeholders locais em vez de imagens externas;
- controller próprio para estado de catálogo;
- região dinâmica `toolHtml` no shell;
- integração das respostas iniciais da conversa com os filtros corretos do catálogo;
- botão Buscar explícito;
- detalhe do produto deliberadamente sem ação de carrinho, pois carrinho pertence à Rodada 6.

Validações executadas:
- TDD do repositório: teste falhou inicialmente por ausência de `catalogFixtureRepository.ts`;
- TDD do controller: teste falhou inicialmente por ausência de `catalogController.ts`;
- TDD da integração do shell: typecheck falhou inicialmente porque `toolHtml` ainda não existia no contrato;
- 10 testes específicos de catálogo/controller/view aprovados;
- 1 teste específico da região dinâmica do shell aprovado;
- typecheck dos módulos de catálogo aprovado;
- typecheck da integração do `main.ts` aprovado em ambiente de validação com contratos equivalentes;
- renderer do catálogo faz escape de HTML;
- busca por `CAFE` encontrou corretamente `Café Torrado 500g`;
- nenhum arquivo de `comprar/` foi modificado;
- nenhum endpoint externo foi conectado.

Limitação mantida:
- o build Vite completo continua dependente do acesso ao registry npm e ainda não deve ser considerado validado enquanto esse acesso não estiver disponível.

**Próxima rodada autorizável:** Rodada 5 — Cestas básicas fictícias.

O projeto permanece OFF, não publicado, sem dados reais e sem conexão com produção.


## Checkpoint — Rodada 5

**Estado:** IMPLEMENTAÇÃO CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- 4 cestas básicas sintéticas;
- IDs exclusivamente `TEST-BASKET-*`;
- composição de cada cesta sem preço individual por item;
- repositório de fixtures com cópias defensivas;
- fluxo determinístico de abrir, voltar e escolher cesta;
- seleção idempotente contra toque repetido;
- valor total da cesta preservado na seleção;
- cards de cesta;
- tela de composição;
- CTA único `Escolher esta cesta`;
- escolha registrada como bolha do cliente;
- confirmação da Ana após a escolha;
- respostas pós-seleção:
  - `Ver ofertas`;
  - `Comprar outros produtos`;
  - `Revisar cesta`;
- ofertas não são abertas automaticamente;
- `Ver ofertas` abre catálogo filtrado em ofertas;
- `Comprar outros produtos` abre catálogo geral;
- `Revisar cesta` reabre a cesta selecionada;
- nenhuma edição de quantidade/remoção foi antecipada; isso pertence à Rodada 6.

Validações executadas:
- 9/9 testes específicos de repositório/flow/view de cestas aprovados;
- 2/2 testes adicionais do motor conversacional e roteamento pós-cesta aprovados;
- typecheck dos módulos da Rodada 5 aprovado;
- composição validada sem campo de preço individual;
- renderização faz escape de HTML;
- nenhum endpoint externo conectado;
- nenhum arquivo de `comprar/` modificado.

Limitação mantida:
- o checkout completo do Vite ainda não pode ser reproduzido diretamente a partir do GitHub neste ambiente porque o acesso DNS ao GitHub/npm está indisponível;
- a suíte da Rodada 5 foi executada localmente com Node usando os mesmos contratos e implementações da branch.

**Próxima rodada autorizável:** Rodada 6 — Carrinho e regras locais.

O projeto permanece OFF, não publicado, sem pedidos reais e sem conexão com produção.


## Checkpoint — Rodada 6

**Estado:** IMPLEMENTAÇÃO CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- domínio próprio de carrinho;
- `CartStore.add`, `remove`, `setQuantity`, `clear`;
- cálculo determinístico em centavos;
- preço promocional usado somente quando válido e menor que o preço normal;
- cesta entra como uma linha única com seu valor total;
- produtos adicionais entram como linhas independentes;
- adição repetida do mesmo produto/cesta soma quantidade;
- cesta e produto nunca se fundem mesmo com `refId` igual;
- quantidade zero ou negativa é rejeitada;
- botão de diminuir fica bloqueado em quantidade 1;
- remoção é ação explícita;
- botão `Limpar pedido`;
- tela `Ver pedido`;
- barra fixa agora mostra quantidade total e valor;
- detalhe do produto ganhou `Adicionar ao pedido`;
- escolha de cesta passa a adicionar a cesta ao carrinho;
- preço promocional e economia são exibidos no resumo;
- nenhum botão ou fluxo de finalização foi antecipado.

Validações executadas:
- ciclo TDD RED confirmado antes da criação dos módulos de carrinho;
- 11/11 testes do núcleo e visualização do carrinho aprovados;
- 3/3 testes adicionais de integração de barra fixa/catálogo aprovados;
- typecheck dos módulos de carrinho, shell e catálogo aprovado;
- typecheck do `main.ts` com contratos de integração equivalentes aprovado;
- teste encontrou e corrigiu linguagem prematura de `checkout` na tela;
- nenhum endpoint externo conectado;
- nenhum arquivo de `comprar/` modificado.

Regra comercial preservada:
- a cesta mantém preço total;
- seus itens internos continuam sem preço individual;
- produtos extras são calculados separadamente;
- promoção de produto é aplicada deterministicamente no carrinho.

Limitação mantida:
- o build Vite completo ainda depende do acesso ao registry npm e continua não sendo tratado como validado enquanto esse acesso não estiver disponível.

**Próxima rodada autorizável:** Rodada 7 — Checkout isolado.

O projeto permanece OFF, não publicado e incapaz de gerar pedido real.


## Checkpoint — Rodada 7

**Estado:** IMPLEMENTAÇÃO CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- checkout totalmente local e fictício;
- máquina de estados `customer → address → payment → review → confirmed`;
- carrinho vazio bloqueia início;
- visitante informa nome e telefone;
- endereço local com cidade/UF;
- pagamentos permitidos:
  - PIX;
  - dinheiro;
  - cartão de crédito;
  - alimentação/refeição;
- pagamento marcado como realizado apenas na entrega;
- gateway de fixture sem rede;
- confirmação sempre gera ID `TEST-*`;
- tela final marcada como Homologação;
- botão `Acompanhar pedido` preparado para a Rodada 8;
- nenhum formulário possui action externa;
- nenhum `fetch`, POST ou persistência real.

Validações executadas:
- 9/9 testes específicos da Rodada 7 aprovados;
- gateway confirmou `getExternalRequestCount() === 0`;
- confirmação antes da revisão é bloqueada;
- typecheck dos módulos de checkout aprovado;
- nenhum endpoint externo conectado;
- nenhum arquivo de `comprar/` modificado.

**Próxima rodada autorizável:** Rodada 8 — Acompanhamento de pedido fictício.

O projeto permanece OFF, não publicado e incapaz de criar pedido real.


## Checkpoint — Rodada 8

**Estado:** IMPLEMENTAÇÃO CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- repositório de pedidos totalmente em memória;
- pedido criado somente a partir de ID `TEST-*`;
- status suportados:
  - `confirmed`;
  - `separating`;
  - `ready`;
  - `on_route`;
  - `delivered`;
  - `cancelled`;
- timeline visual de acompanhamento;
- botão `Avançar status de teste` para demonstração;
- estados terminais bloqueiam avanço;
- cancelamento permitido apenas antes da rota;
- histórico de status com cópias defensivas;
- checkout confirmado cria o pedido fictício no repositório;
- botão `Acompanhar pedido` abre a timeline;
- CTA `Preciso de ajuda` é interno e não abre WhatsApp;
- nenhum evento de logística real é disparado.

Validações executadas:
- 8/8 testes específicos de pedido/timeline aprovados;
- typecheck dos módulos de pedido aprovado;
- URLs `wa.me` e `whatsapp://` ausentes da timeline;
- nenhum endpoint externo conectado;
- nenhum arquivo de `comprar/` modificado.

**Próxima rodada autorizável:** Rodada 9 — PWA isolada de homologação.

O projeto permanece OFF, não publicado e sem acompanhamento de entrega real.


## Checkpoint — Rodada 9

**Estado:** IMPLEMENTAÇÃO CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- `manifest.webmanifest` próprio do novo app;
- ícones locais de homologação;
- start URL e scope relativos ao app;
- registro de service worker permitido apenas em:
  - `/app-dona-antonia/`;
  - `/hml/app-dona-antonia/`;
- registro recusado em `/` e `/comprar/`;
- service worker versionado `da-hml-v1`;
- cache somente de destinos estáticos do mesmo domínio;
- POST nunca é cacheado;
- URLs com `token`, `session`, `code`, `secret` ou `auth` não são cacheadas;
- caminhos contendo `/comprar/` são ignorados pelo service worker;
- fallback offline usa somente o shell do novo app;
- caches antigos de homologação são limpos por versão;
- manifesto ligado ao HTML do novo app;
- nenhum link público de produção criado.

Validações executadas:
- 5/5 testes específicos de PWA aprovados;
- typecheck do registrador de service worker aprovado;
- teste confirmou que `/comprar/` não pode registrar nem ser cacheado;
- teste confirmou exclusão de POST e URLs sensíveis;
- nenhum arquivo de `comprar/` modificado.

**Próxima rodada autorizável:** Rodada 10 — Shell Capacitor Android.

O projeto permanece OFF e a PWA ainda não possui rota pública de produção.


## Bloqueio técnico atual — Rodada 10

A Rodada 10 exige geração e validação nativa real do Android.

Ambiente verificado em 18/09/2026:
- Node 22.16.0 disponível;
- npm 10.9.2 disponível;
- Java 21 disponível;
- Android SDK ausente;
- `adb` ausente;
- `sdkmanager` ausente;
- Gradle global ausente;
- Xcode indisponível neste ambiente;
- registry npm inacessível por DNS (`EAI_AGAIN`).

Por isso a Rodada 10 **não foi iniciada parcialmente** e não foi marcada como concluída.

Próxima ação quando houver ambiente nativo:
1. instalar dependências Capacitor 8;
2. adicionar plataforma Android;
3. configurar API 36+;
4. gerar APK debug;
5. executar smoke test real;
6. só então marcar Rodada 10 como concluída.


## Checkpoint paralelo — Rodada 13 (fundação HML parcial)

**Estado:** FUNDAÇÃO IMPLEMENTADA / DEPLOY DE EDGE FUNCTIONS BLOQUEADO POR QUOTA  
**Data:** 18/09/2026

Supabase HML criado de forma isolada no projeto existente, usando apenas estruturas prefixadas:

- `customer_app_hml_config`;
- `customer_app_hml_catalog`;
- `customer_app_hml_orders`;
- `customer_app_hml_rate_limits`.

Migração aplicada e versionada:

`20260918193553_customer_app_hml_foundation_v1.sql`

Gates confirmados:
- `enabled=false`;
- `environment=homologation`;
- limite configurado em 60 req/min;
- 10 produtos sintéticos;
- 0 IDs fora de `TEST-PROD-*`;
- 0 imagens fora de placeholder;
- RLS ativo nas quatro tabelas;
- 0 grants para `anon`;
- 0 grants para `authenticated`;
- nenhuma tabela operacional foi usada pelo app HML.

Código versionado para:
- `customer-app-hml-bootstrap-v1`;
- `customer-app-hml-catalog-v1`;
- `customer-app-hml-checkout-v1`.

As Edge Functions **não foram publicadas** porque o Supabase retornou:
`Max number of functions reached for project`.

Nenhuma função foi criada parcialmente.

Cliente HML:
- `src/platform/apiClient.ts`;
- OFF por padrão;
- aceita somente `TEST-CLIENT-*`;
- rejeita IDs reais antes de rede;
- checkout não envia cliente, telefone, CPF ou endereço;
- 5/5 testes de contrato aprovados;
- não conectado ao `main.ts`.

Advisors:
- nenhum finding de performance para `customer_app_hml_*`;
- INFO `rls_enabled_no_policy` nas quatro tabelas é intencional neste estágio: os papéis públicos não têm grants e não existem policies de cliente.

**Rodada 13 NÃO está marcada como concluída** até as Edge Functions poderem ser publicadas e testadas.

---

## Checkpoint paralelo — Rodada 20 concluída

**Estado:** CONCLUÍDA EM PARALELO

Entregas:
- `networkState.ts`;
- `recovery.ts`;
- estado online/offline/unknown;
- confirmação permitida somente quando online;
- nenhum pedido é enfileirado silenciosamente;
- recovery aceita apenas ações seguras de leitura/navegação;
- falha de rede do cliente HML é classificada sem retry automático;
- reconexão não duplica pedido;
- carrinho local permanece intacto;
- aviso offline permanece visível mesmo com conteúdo em cache.

Validação:
- 6/6 testes offline/reconexão aprovados;
- 1 teste adicional do shell garante aviso offline + conteúdo cacheado;
- typecheck dos módulos novos aprovado.

---

## Checkpoint paralelo — Rodada 21 parcial

**Estado:** CAMADA LOCAL PRONTA / BACKEND BLOQUEADO PELA QUOTA DE EDGE FUNCTIONS

Entregas locais:
- `telemetry.ts`;
- registry fechado de eventos operacionais;
- OFF por padrão;
- sem SDK de Ads/Analytics;
- rejeita telefone, CPF, endereço, texto livre, query de busca, IDFA e GAID;
- busca guarda apenas tamanho da consulta e quantidade de resultados;
- envelope inclui apenas versão do app, plataforma e timestamp;
- 6/6 testes aprovados.

Pendente:
- Edge Function de telemetria;
- persistência HML;
- health/counters de pairing, deep link e push.

A Rodada 21 permanece parcial.

---

## Checkpoint paralelo — Rodada 22 parcial

**Estado:** HARDENING LOCAL EXECUTADO / DEPENDÊNCIAS FUTURAS PENDENTES

Entregas:
- `urlPolicy.ts`;
- URLs rejeitam telefone, CPF, endereço, credenciais, token/sessão/segredo;
- cliente HML exige HTTPS remoto;
- novos padrões de segredo no scanner:
  - `sb_secret_*`;
  - `SUPABASE_SECRET_KEY`;
  - `OPENAI_API_KEY`;
  - `META_APP_SECRET`;
  - `BLING_CLIENT_SECRET`;
- testes XSS em conversa, catálogo e cestas;
- `SECURITY-CHECKLIST.md`;
- correção do guardrail para permitir somente a linha de negação do service worker a `/comprar/`, sem permitir links runtime ao Comprar.

Validação:
- 10/10 testes de segurança aprovados;
- 3/3 verificações específicas da exceção segura do service worker aprovadas;
- typecheck aprovado com a configuração real `DOM.Iterable`.

Pendente antes de concluir Rodada 22:
- sessão nativa;
- pairing;
- deep links nativos;
- push;
- uploads;
- inspeção final APK/AAB/IPA.

---

## Checkpoint paralelo — Rodada 23 parcial

**Estado:** BASE DE ACESSIBILIDADE MELHORADA / TESTE EM APARELHOS PENDENTE

Entregas:
- autocomplete de nome, telefone e endereço;
- inputmode adequado;
- `prefers-contrast: more`;
- `forced-colors`;
- aviso offline com `role=status`;
- conteúdo cacheado continua disponível;
- `UX-CHECKLIST.md`.

Validação:
- 4/4 testes estruturais de acessibilidade aprovados;
- base 320 px, foco visível e reduced-motion confirmados.

Pendente:
- VoiceOver;
- TalkBack;
- fonte/zoom 200% em browser real;
- teclado virtual;
- Android de entrada;
- medições reais de bundle/renderização.

A Rodada 23 permanece parcial.

---

## Estado consolidado após avanço paralelo

**Concluídas integralmente:** Rodadas 0–9 e Rodada 20.  
**Parcialmente avançadas:** Rodadas 13, 21, 22 e 23.  
**Próxima sequencial:** Rodada 10 — Android, bloqueada por toolchain nativa.  
**Produção:** continua OFF e intocada.  
**Comprar atual:** continua intocado.
