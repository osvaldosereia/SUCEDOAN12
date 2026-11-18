# Admin WhatsApp Sucedoan — Plano de Execução

> **Arquivo histórico, não executar:** este plano citava o Supabase `wvpzudjujtmyspluwhvx` (“Dona Antônia - NOVO”) como destino. O proprietário confirmou em 27/10/2026 que o backend vigente é Dona Antônia (original), projeto `ssbesxgaijknwsjbsbcz`. Consulte `../plano-execucao.md` e `../implementation-ledger.md` para as decisões atuais.

> **Para quem implementar:** usar o subskill `superpowers:executing-plans` e concluir as tarefas na ordem; cada checkbox é um ponto de revisão independente.

**Objetivo:** construir um painel simples para operar dois números oficiais do WhatsApp, ANA, catálogo de produtos avulsos, cestas configuráveis, pedidos e integração Bling.

**Arquitetura:** Next.js App Router fornece o painel interno. Supabase Postgres é a fonte de verdade; Auth/RLS controlam funcionários; Edge Functions recebem webhooks e fazem chamadas Meta, Bling e OpenAI. O Bling é acionado por outbox quando o pedido passa de PRODUÇÃO para EXPEDIÇÃO. Toda integração é idempotente e pode ser reprocessada.

**Stack:** Next.js/React/TypeScript, Tailwind CSS v4 disponível para a camada visual, CSS de componentes simples e Lucide; usar componentes shadcn/ui somente quando reduzirem código e complexidade. pnpm com lockfile, Biome para lint/format, Supabase CLI e Edge Functions Deno, Vercel; validação focada com Deno test/pgTAP e poucos percursos Playwright quando uma jornada crítica estiver implementada. O scaffold usa Next.js 16.4.3/React 19.3.0 e Node 24.22.1 (mínimo oficial do Next: 20.9). O runtime não oferece npm/npx no PATH, mas traz pnpm 11.25.0. O CLI gerou ESLint 9.39.5 obsoleto; ESLint 10.13.0 conflitou com os peers dos plugins de Next. Decisão: Biome, opção suportada pelo create-next-app atual, para evitar começar com peers incompatíveis.

**Especificação:** [Plano principal](pesquisa-e-plano.md) e [caderno técnico](caderno-tecnico.md), principalmente seções 14, 21–28.

## Restrições globais

- Começar em branch de trabalho; nunca gravar tokens, chaves, dados reais de cliente ou `.env` no Git. `main` está vazia, pública e sem proteção.
- Destino de dados: Supabase `wvpzudjujtmyspluwhvx`; trabalhar localmente primeiro. Não fazer SQL manual na produção; todas as mudanças de schema entram por migração revisada.
- As duas linhas Meta estão em WABAs distintas. Guardar configuração e health checks por linha/WABA; não pressupor catálogo, Flow, template ou token compartilhado.
- Navegação principal tem oito áreas: Visão geral, Atendimento, Pedidos, Cestas, Produtos, Clientes, ANA e Configurações.
- Cada tela de componente do Flow oferece uma alternativa de produto e quantidade 0–6; o backend valida e recalcula cada avanço. Opção/quantidade 0 só é aceita quando o slot permitir retirada.
- Terminar Flow não confirma pedido. O servidor manda resumo com itens, quantidades, endereço, pagamento e total, sem preço individual; somente o botão de aceite associado à revisão cria o pedido.
- Cada Flow e cada carrinho do Catálogo Meta é uma intenção/pedido independente, sem janela de tempo, mesmo se enviados na mesma conversa em sequência. Cada pedido recebe venda e processo fiscal próprios.
- Rascunhos de compra não expiram por inatividade. Uma sessão técnica Meta pode expirar; a retomada recalcula preço/estoque antes do aceite.
- Identificar cliente por identidade Meta no escopo correto (BSUID por portfólio empresarial); manter conversas separadas por `phone_number_id`. Telefone só entra quando compartilhado/verificado. Nunca mesclar por nome ou tratar sender ID como número de telefone.
- Escolher forma de pagamento não marca pagamento como recebido. Produção/expedição e estado fiscal são dimensões independentes.
- Aceite válido cria exatamente um pedido completo em PRODUÇÃO — Separação. Se preço, estoque, endereço ou identidade exigida mudar antes do aceite, não criar pedido: manter rascunho, corrigir e pedir novo aceite. NOVO fica para pedido manual/operacional ainda não liberado para separação. PRODUÇÃO → EXPEDIÇÃO cria trabalho idempotente do Bling. Não ativar emissão real de NF-e sem gate contábil.
- Custo e componente interno de margem não aparecem ao cliente nem à ANA. O total cobrado deve ser claro antes do aceite.
- IA não pode definir preço/estoque, aceitar pedido, alterar estado físico, criar venda ou emitir NF-e sem ações determinísticas autorizadas pelo servidor.
- App web usa somente URL e chave publicável Supabase. Segredos Meta/Bling/OpenAI e chave de servidor Supabase ficam exclusivamente no runtime privado de Edge Functions.

## Gates de segurança — obrigatórios antes de conectar serviços reais

Por decisão do proprietário, a base local e a interface podem avançar agora em branch isolada, sem conectar credenciais nem alterar serviços. **Os itens abaixo bloqueiam migrações no projeto Supabase de destino, tráfego real, publicação de Flow e escrita no Bling; não bloqueiam UI, contratos puros ou adaptadores mockados.**

- [x] Capturar snapshot read-only do Supabase de destino em 26/10/2026: projeto/versão, 19 tabelas, migrations, colunas, contagens, policies/grants, buckets e flags de integrações; detalhes em `caderno-tecnico.md`.
- [ ] Repetir snapshot após concluir a fila de fotos e antes de preparar/importar o baseline local ou qualquer migração; conferir especificamente as 1.798 imagens pendentes e novo estado das policies.
- [ ] Mapear as referências Meta do Vault legado às duas contas do destino; esclarecer a presença e o escopo do access token no runtime Edge; validar health check por WABA/`phone_number_id`; não revelar nem copiar valores secretos.
- [x] Confirmar flags atuais de segurança: duas configurações Meta e uma Bling, todas `enabled=false` e `external_writes_enabled=false`; nenhum valor de segredo consultado.
- [ ] Mapear a conexão OAuth Bling para o destino e validar chamada somente leitura; registrar um único dono para rotação do refresh token durante o cutover; manter escrita externa desligada.
- [ ] Concluir prova/limites da Meta para Flow com imagem em cada alternativa, ida/volta, `nfm_reply`, carrinho nativo e pedido separado; documentar o resultado da validação nas duas WABAs.
- [ ] Fazer auditoria de consistência nos três documentos e publicar o freeze final da especificação, incluindo política de segredos e limitações de qualquer auditoria GitHub.

O código histórico e as credenciais existentes servem como fonte de requisitos e mapa de nomes. Nenhum frontend, função, workflow, dado real ou valor de segredo do sistema antigo será incorporado ao app novo. As verificações não concluídas ficam isoladas atrás de adaptadores e feature flags; produção não recebe escrita até cada gate passar.

## Riscos a revisar em cada entrega

1. Webhook repetido/fora de ordem não duplica nem regride mensagem ou pedido.
2. Carrinho de Catálogo e cesta Flow coexistem na mesma conversa sem serem combinados.
3. Cliente chega por username/BSUID sem telefone; respostas usam a identidade aceita pela versão ativa da Meta.
4. Rascunho permanece aberto, mas preço, produto, estoque ou entrega mudaram antes do aceite; exigir revisão e novo aceite quando material.
5. Meta/Bling responde com timeout após receber a operação; reconciliar antes de repetir para evitar envio, venda ou NF-e duplicada.

Precisão operacional: idempotência garante uma única intenção/linha no banco, mas não transforma qualquer API externa em exactly-once. Se o provedor aceitar a chamada e a resposta se perder, marcar como reconciliação pendente, buscar pelo identificador/referência externa e nunca repetir no escuro. Para envio Meta sem consulta externa conclusiva, a UI apresenta resultado ambíguo e permite decisão auditada.

## Estrutura de arquivos decidida

```text
src/
  app/
    (auth)/login/page.tsx
    (admin)/layout.tsx
    (admin)/visao-geral/page.tsx
    (admin)/atendimento/page.tsx
    (admin)/pedidos/page.tsx
    (admin)/cestas/page.tsx
    (admin)/produtos/page.tsx
    (admin)/clientes/page.tsx
    (admin)/ana/page.tsx
    (admin)/configuracoes/page.tsx
  components/
    layout/{admin-shell,sidebar,topbar}.tsx
    ui/                         # somente componentes usados
  features/
    auth/ inbox/ orders/ baskets/ products/ customers/ ana/ settings/
  lib/
    auth/{permissions,require-staff}.ts
    supabase/{client,server}.ts
    contracts/                  # schemas de requests/responses sem segredos
    format/{currency,phone,date}.ts
supabase/
  config.toml
  migrations/                   # arquivos gerados pelo Supabase CLI
  tests/database/               # pgTAP: grants, RLS, constraints, transações
  functions/
    _shared/{http,meta,bling,auth,logging,basket-pricing}.ts
    meta-webhook/index.ts
    whatsapp-flow/index.ts
    bling-webhook/index.ts
    outbox-dispatch/index.ts
    ana-reply/index.ts
e2e/
  login.spec.ts
  inbox-and-orders.spec.ts
```

Pages montam features; regras de negócio ficam em módulos puros ou serviços de domínio, não dentro de componentes visuais. Webhooks persistem evento e retornam rápido; qualquer efeito externo durável passa pela outbox já na primeira fase de integração. O worker tenta enviar imediatamente após enfileirar e o Cron atua como recuperação. Funções privilegiadas ficam em `app_private` ou em RPCs públicas muito estreitas, com `EXECUTE` apenas para `service_role`, nomes totalmente qualificados, `search_path` fixo e `SECURITY DEFINER` só quando indispensável.

## Tarefas

### Tarefa 1 — Repositório, ambiente local e base visual

**Arquivos:** `package.json`, `pnpm-lock.yaml`, `.nvmrc`, `.gitignore`, `.env.example`, `next.config.ts`, `biome.json`, `src/app/layout.tsx`, `src/app/globals.css`, `supabase/config.toml`, `.github/workflows/ci.yml`.

- [x] Criar checkout do repo vazio `osvaldosereia/SUCEDOAN12` e branch de trabalho; proteger `main` e usar PR antes de integrar.
- [x] Fixar Node 24.22.1 e pnpm 11.25.0. Adicionar Supabase CLI versionada quando a tarefa de banco local começar.
- [x] Fixar Supabase CLI 2.122.0, inicializar `supabase/config.toml` e subir stack local Postgres 17.11; no Windows, omitir apenas os coletores locais de log que dependem do daemon Docker em TCP. Signup, seeds e exposição automática de tabelas ficam desligados.
- [x] Gerar aplicação pelo CLI oficial com TypeScript, Biome, Tailwind, App Router, diretório `src/` e alias `@/*`; fixar dependências e lockfile.
- [ ] Completar baseline de schema/migrations do projeto confirmado para que reset local reproduza as 19 tabelas e dependências sem copiar linhas reais; o CLI local ainda não está autenticado no Management API e o destino não será ligado até o procedimento de dump seguro estar definido.
- [x] Definir scripts `lint`, `typecheck`, `format` e `build`.
- [ ] Adicionar checks focados de CI com a primeira fatia funcional, sem suíte vazia.
- [x] Verificar `pnpm lint`, `pnpm typecheck` e `pnpm build` no esqueleto. Os três passaram; não foi criada suíte vazia nem rodada bateria ampla.
- [x] Confirmar Docker Engine local e iniciar Supabase com CLI; validar health de Postgres/Auth/REST/Storage/Studio/Realtime/Edge Runtime.
- [ ] Preparar baseline completo do schema do destino e conferir functions/triggers/grants antes da primeira migration executável.

**Entrega:** app vazio inicia localmente, Supabase local sobe em Docker e CI executa sem qualquer segredo real.

### Tarefa 2 — Sessão de funcionário, papéis e acesso ao banco

**Arquivos:** `src/lib/supabase/{client,server}.ts`, `src/lib/auth/{permissions,require-staff}.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(admin)/layout.tsx`, `supabase/migrations/*staff_access*`, `supabase/tests/database/staff_access_test.sql`.

**Interface:** `requireStaff(): Promise<StaffContext>` retorna `userId` e papel confirmado; a matriz de permissões por sessão/ação será aplicada na camada de domínio e reforçada por RLS antes de liberar dados. A função interrompe a requisição sem sessão/papel.

- [x] Criar login interno com email/senha; sem cadastro público de funcionário. A tela permanece desabilitada se URL/chave publicável estiverem ausentes e mostra mensagem genérica para não revelar se a conta existe.
- [x] Reutilizar `staff_profiles` e preservar os quatro papéis existentes: `owner`, `admin`, `catalog_manager`, `fulfillment`. A fundação valida papel conhecido e perfil habilitado; a matriz de permissões por rota/ação será fechada junto às policies RLS antes de conectar dados. Não incluir papel `operator`/`support` sem necessidade operacional confirmada.
- [x] Confirmar que hoje não existem Auth users nem staff profiles. Não criar convites/contas no rollout de código; o provisionamento do primeiro owner segue como gate explícito de ativação.
- [ ] Conceder GRANTs mínimos apenas às tabelas necessárias ao painel e criar policies RLS por papel. Não usar `TO authenticated` sozinho como autorização.
- [x] Preservar `app_private` sem exposição ao browser; o snapshot confirma ausência de GRANTs `anon`/`authenticated` às tabelas de integração. Repetir a checagem após a migração.
- [ ] Criar teste pgTAP para leitura/escrita permitida e negada por papel, incluindo tentativa de atualização fora da responsabilidade.
- [ ] Validar sessão, refresh e bloqueio real de usuário não habilitado quando Auth users e policies existirem; hoje só foram validados a resposta HTTP 200 da tela `/login`, o guard de código e o build. Sair deve limpar a sessão e, quando a auditoria for implementada, preservar seus eventos.

**Verificação:** `supabase test db`, unit tests de autorização e navegação protegida no Playwright.

### Tarefa 3 — Shell e oito áreas do Admin

**Arquivos:** `src/components/layout/{admin-shell,sidebar,topbar}.tsx`, `src/components/ui/*`, `src/app/(admin)/*/page.tsx`, `src/features/{overview,inbox,orders,baskets,products,customers,ana,settings}/*`.

- [ ] Implementar menu lateral curto, título/ação principal por página, cabeçalho com estado do sistema e responsividade.
- [ ] Criar estados consistentes de carregamento, vazio, erro recuperável, sem permissão e integração pendente.
- [ ] Construir primeiro esqueleto de Atendimento com três áreas, quadro de Pedidos por estado e editor de cesta com preview; seguir wireframe da seção 27 do caderno.
- [ ] Manter pesquisa/filtros ao abrir e fechar detalhes; no celular empilhar painéis e manter ação primária visível.
- [ ] Fazer smoke visual em desktop e largura móvel; confirmar acessibilidade por teclado e rótulos.

**Entrega:** todas as oito rotas existem e têm navegação coerente, ainda sem tráfego real.

### Tarefa 4 — Produtos, cestas e cálculo determinístico

**Arquivos:** `src/features/products/*`, `src/features/baskets/{validation,editor,preview}.*`, `src/lib/contracts/baskets.ts`, `supabase/functions/_shared/basket-pricing.ts`, `supabase/functions/quote-basket/index.ts`, `supabase/migrations/*basket_options*`, `supabase/tests/database/basket_rules_test.sql`.

**Interface de domínio:** `calculateBasketPrice(input: BasketSelection, publishedVersion: BasketVersion): BasketQuote` fica em `_shared/basket-pricing.ts`, sem dependência de Next/Supabase, e retorna itens validados, snapshots e total; nunca aceita preço enviado pelo browser. Preview do Admin e Flow chamam a mesma regra via Edge Function.

- [x] Criar a fundação local: `basket_template_versions`, slots ordenados, alternativas com preço comercial versionado, adicional privado, publicação validada por produto/foto e regras de imutabilidade; custo movido para `app_private`; grants/RLS por papel.
- [ ] Construir a tela de Produtos e Cestas sobre essa fundação; todos os slots exibem quantidades 0–6 sem pré-seleção, preço por opção dentro da cesta e exigem pelo menos um slot positivo no envio.
- [ ] Registrar produto por SKU e retailer ID Meta; exibir status de sincronização sem criar SKU ou valor a partir de IA.
- [ ] Criar bucket separado `product-media` (público para leitura, escrita só por funcionário autorizado). No upload, manter original e gerar no navegador a miniatura 320 × 320 JPEG/PNG de até 25 KB; guardar caminhos e `alt_text` em `product_images`. Mostrar estados “pendente”, “pronta para o Flow” e “não aprovada”; o alt text começa com nome/marca/variante e pode ser corrigido.
- [ ] Bloquear elegibilidade em cesta publicada quando qualquer alternativa não tiver foto principal verificada e miniatura Flow. A foto da cesta não substitui a foto individual das alternativas.
- [x] Mover `products.cost_cents` e ajuste interno da cesta para `app_private`; tabelas privadas não concedem acesso direto a `authenticated`. RPCs financeiras locais validam `auth.uid()`, perfil ativo e papel `owner`/`admin`/`catalog_manager`; a cotação futura nunca retorna custo/margem.
- [x] Criar versão imutável publicada para que sessões futuras refiram a configuração exata de origem.
- [ ] Testar slot obrigatório/opcional, quantidade 0, 1 e 6, quantidade fora do intervalo, alternativa inativa, preço alterado e arredondamento em centavos.

**Verificação:** `deno test supabase/functions/_shared/basket-pricing_test.ts` e `supabase test db` no Supabase local.

### Tarefa 5 — Clientes, identidades e inbox manual dos dois números

**Arquivos:** `src/features/{inbox,customers}/*`, `src/lib/contracts/meta.ts`, `supabase/migrations/*whatsapp_identity_outbox*`, `supabase/functions/meta-webhook/index.ts`, `supabase/functions/outbox-dispatch/index.ts`, `supabase/functions/_shared/{meta,outbox}.ts`, `supabase/tests/database/message_deduplication_test.sql`.

- [ ] Armazenar identidade por tipo e escopo correto: BSUID (`user_id`) é por portfólio empresarial; `phone_number_id`/WABA identificam a origem e isolam conversas; telefone só é contato após compartilhamento/verificação. Conferir se os dois WABAs pertencem ao mesmo portfólio antes de vincular as conversas à mesma ficha.
- [ ] Criar conversas, mensagens, atribuição, nota interna, pausa ANA, estado de janela e recibos Meta.
- [ ] Implementar validação de assinatura, normalização em eventos atômicos, cálculo de `dedupe_key` com escopo de conta e persistência antes de responder ao webhook. Inbound usa o ID da mensagem; status Meta distingue WAMID + status + timestamp para não descartar avanço legítimo; processar lote não significa inserir o payload inteiro como uma única mensagem.
- [ ] Atualizar status por monotonicidade; evento antigo não regride entregue/lido.
- [ ] Permitir atendimento manual nos dois números; exibir linha/WABA sem obrigar operador a saber termos técnicos.
- [ ] Criar a infraestrutura genérica da outbox aqui: unicidade da chave idempotente, lease/claim atômico, `available_at`, resultado mascarado, dead-letter e estado `reconciliation_required`. Aplicar os estados e limites de retry do caderno §14.1. RPC de claim exposta apenas a `service_role`; chamadas do painel nunca alcançam `app_private`.
- [ ] Enfileirar mensagens de saída na mesma transação que cria resumo/ação do Admin; tentar envio imediato e recuperar jobs pendentes no worker agendado.
- [ ] O scheduler chama o worker com uma chave interna dedicada validada no próprio endpoint; usar `verify_jwt=false` somente para essa função interna protegida. Cron/pg_net não recebe payload de cliente e não guarda job; o tick pode se perder sem perder a outbox durável.
- [ ] Testar mensagens duplicadas/fora de ordem, BSUID sem telefone, resposta enviada ao BSUID, os dois WABAs na mesma ficha quando o escopo permitir, portfólios diferentes sem mescla, remetente sem cliente e operadores concorrentes.

**Entrega:** a equipe atende manualmente em ambiente de teste, com trilha da mensagem e identidade correta.

### Tarefa 6 — Rascunhos, Flow, Catálogo Meta e aceite

**Arquivos:** `src/features/orders/{drafts,confirmation,summary}.*`, `src/lib/contracts/orders.ts`, `supabase/migrations/*order_drafts*`, `supabase/functions/whatsapp-flow/index.ts`, `supabase/functions/meta-webhook/index.ts`, `supabase/functions/_shared/flow-crypto.ts`, `supabase/tests/database/order_confirmation_test.sql`, `e2e/order-flow.spec.ts`.

**Interface:** `confirmDraft(input: ConfirmDraftInput): Promise<ConfirmDraftResult>` recebe `{ confirmationToken, phoneNumberId, senderIdentityId, inboundMessageId }`. Retorna `{ status: 'confirmed' | 'already_confirmed' | 'needs_review' | 'stale_revision' | 'not_authorized', orderId?: string, currentRevision?: number }`. O token é aleatório/opaco; o banco guarda seu hash ligado ao rascunho e à revisão. RPC transacional acessível somente a `service_role` valida remetente, número, revisão, preço, estoque, endereço, aceite único e cria exatamente um pedido. Repetição retorna o mesmo `orderId`.

- [ ] Modelar fontes distintas `basket_flow` e `catalog_cart`; não associar drafts por conversa/tempo.
- [ ] Implementar Data Exchange criptografado e versionado; INIT, Próximo, Voltar e conclusão usam contratos separados e estado do servidor.
- [ ] Gerar `flow_token` aleatório imprevisível por sessão, persistir somente seu hash e vinculá-lo ao rascunho, remetente, `phone_number_id`/WABA e versão da cesta. Token é correlator, nunca autenticação. Não derivar chave HMAC de sessão de `META_WHATSAPP_APP_SECRET`: essa foi uma escolha interna do código legado, não requisito demonstrado do protocolo Meta. Usar App Secret apenas para validar assinatura de webhook; implementar o Data Exchange conforme RSA-OAEP/AES-GCM da Meta, com chave privada somente no servidor e chave pública registrada para cada linha.
- [ ] No spike, confirmar no payload real de `nfm_reply.response_json` que a Meta devolve o `flow_token` enviado, em cada WABA; conferir o JSON cru sanitizado, sem dados pessoais. Se não for devolvido de forma confiável, bloquear a decisão de correlação do checkout e pesquisar/validar outra associação antes de avançar.
- [ ] Declarar cada campo do payload de ação no schema gerado do Flow e validar o JSON de ida/volta; se uma ação dinâmica enviar índice, versão ou chave de slot, o campo e o tipo têm de constar no contrato efetivo.
- [ ] Fazer primeiro spike de Flow com duas alternativas fotografadas, quantidade e Próximo. Consultar a referência oficial de componentes para a versão usada e confirmar no Flow Validator da Meta, em cada WABA, que o `data-source` aceita imagem + `alt-text`; a página de componentes foi rate-limited (HTTP 429) nesta rodada de pesquisa, então limites por versão ainda não são constantes de implementação. Medir payload e conferir leitura em Android/iOS. Manter miniatura interna alvo ≤25 KB como meta de desempenho do projeto, não limite da Meta.
- [ ] Implementar imagem/alt text por alternativa no `data-source` do Flow; o endpoint lê `flow_thumbnail_path`, codifica a imagem em formato aceito, valida tamanho/versão e recusa qualquer opção sem foto. Não publicar tela com alternativa sem foto.
- [ ] Limitar o tempo gasto em consultas e leitura de imagem no Data Exchange; servir miniatura aprovada em cache e nunca esperar por mídia externa sem timeout.
- [ ] Provar navegação de um slot por tela, retorno à mesma tela quando aplicável, limites efetivos de componentes/payload e tratamento de Flow inválido; manter fallback de perguntas sequenciais no chat com imagens anexadas quando necessário.
- [ ] Processar carrinho do Catálogo pelo retailer ID, criando rascunho distinto até quando recebido imediatamente após Flow.
- [ ] Migrar a constraint legada de `orders.status` para os estados operacionais definidos e adicionar origem, snapshots de endereço/aceite e estado financeiro/fiscal separados; antes, recontar linhas e mapear qualquer valor antigo.
- [ ] Gerar resumo com itens/quantidades/endereço/pagamento/total sem preço unitário e botão de confirmação associado a revisão opaca.
- [ ] Na transação de aceite, validar se a revisão ainda é válida; congelar snapshot de itens, endereço, pagamento, preço, origem, identidade e mensagem; reservar estoque no aceite e criar um único pedido diretamente em PRODUÇÃO. Rascunhos sem limite de tempo não seguram estoque.
- [ ] Se preço/estoque/dados obrigatórios mudaram, não criar pedido nem colocar em NOVO: invalidar o botão antigo, manter rascunho, corrigir os dados e enviar nova revisão para aceite.
- [ ] Usar NOVO apenas para pedidos criados manualmente ou retidos por decisão operacional da equipe antes de liberar separação; registrar responsável e motivo.
- [ ] Implementar RPC pública sem dados sensíveis na assinatura; revogar `EXECUTE` de `PUBLIC`, `anon` e `authenticated`, conceder só a `service_role`, fixar `search_path` e qualificar objetos. Browser nunca chama RPC privilegiada.
- [ ] Testar clique duplo, Flow repetido, carrinho repetido, dois tipos no mesmo chat, rascunho antigo, endereço trocado e confirmação após mudança de preço.

**Gate externo:** antes de enviar mensagens de teste, conferir token/escopos, webhook e uma linha interna por WABA. Sem credenciais atuais confirmadas, manter adaptadores mockados e bloquear dispatch externo.

### Tarefa 7 — Adaptador Bling sobre a outbox existente

**Arquivos:** `src/features/orders/fulfillment.ts`, `src/features/settings/integrations.tsx`, `supabase/migrations/*outbox_bling*`, `supabase/functions/bling-webhook/index.ts`, `supabase/functions/outbox-dispatch/index.ts`, `supabase/functions/_shared/bling.ts`, `supabase/tests/database/bling_outbox_test.sql`.

- [ ] Reutilizar a outbox e o worker genéricos criados na Tarefa 5; aqui adicionar apenas tipos de job e adaptador Bling, mantendo a mesma política de idempotência, retry e reconciliação.
- [ ] Centralizar renovação OAuth Bling com uma coordenação por conta para evitar refresh token concorrente.
- [ ] Em `invalid_grant`/refresh expirado, marcar Bling como desconectado e oferecer “Reconectar Bling”; preservar último estado confirmado de produtos/pedidos e parar jobs dependentes. Não limpar dados nem repetir renovação em loop.
- [ ] Antes da integração real, confirmar cadastro de app público, autorização pela conta da empresa e exigências de homologação/teste do Bling; começar essa trilha externa em paralelo à base e continuar com adaptador mock enquanto aguarda.
- [ ] Centralizar todas as chamadas Bling num limitador por conta (teto inicial de 2 req/s, documentado abaixo dos 3 req/s publicados), contabilizar limite diário e honrar `Retry-After` em 429; limitar também consultas de reconciliação.
- [ ] Ao sair de PRODUÇÃO para EXPEDIÇÃO, criar uma única venda externa por pedido; pedidos Flow e Catálogo usam chaves externas distintas.
- [ ] Depois do aceite contábil e do cadastro fiscal, a transição PRODUÇÃO → EXPEDIÇÃO inicia a criação de venda no Bling e o processo de NF-e do pedido; gravar IDs e estados de venda/NF-e separados. Até esse gate, integração só em sandbox/mock e escrita de produção desativada.
- [ ] Reconciliar timeout consultando Bling por referência externa antes de repetir; se não for possível provar sucesso ou falha, parar em `reconciliation_required`, sem retry cego. Validar assinatura e deduplicar webhook recebido.
- [ ] Separar status de venda, NF-e e operação física. Emissão real fica bloqueada até aprovação contábil e cadastro fiscal completo.
- [ ] Testar rejeição, indisponibilidade, refresh, timeout pós-sucesso, retry e dois pedidos independentes do mesmo cliente.

**Gate externo:** confirmar credenciais atuais no cofre, escopos, IDs SKU/contato e testar em modo não produtivo antes de habilitar escrita.

### Tarefa 8 — ANA limitada e transferência para atendente

**Arquivos:** `src/features/ana/{editor,simulator,versions}.*`, `supabase/migrations/*ana_versions*`, `supabase/functions/ana-reply/index.ts`, `supabase/functions/_shared/openai.ts`, `e2e/ana-handoff.spec.ts`.

- [ ] Criar configuração pequena, mas editável, em rascunho/publicada: saudação/tom, políticas/conhecimento aprovado, linhas Meta habilitadas, ações permitidas, horários e gatilhos de transferência; versão publicada, simulador e reversão simples. Não expor prompt bruto ao operador.
- [ ] Usar Responses API server-side, `store=false` e contexto mínimo; nenhuma chave ou endereço entra sem necessidade.
- [ ] Expor ferramentas de leitura/cálculo/rastreamento com schemas estritos; backend valida tudo, IA não grava pedido confirmado nem altera status.
- [ ] Pausar ANA quando humano assume, por conversa; retomar somente com ação explícita e sem respostas simultâneas.
- [ ] Testar preço/estoque não inventado, pedido ambíguo, ferramenta rejeitada, handoff, pausa e retomada.

### Tarefa 9 — Configuração, observabilidade e piloto

**Arquivos:** `src/features/settings/*`, `src/features/orders/*`, `supabase/functions/_shared/logging.ts`, `.github/workflows/ci.yml`, `e2e/*`.

- [ ] Criar página de integrações com health check seguro por WABA/Meta, Bling e ANA; mostrar resultado e próximo passo, nunca valor secreto.
- [ ] Criar logs com correlação e redação de payload pessoal, métricas de falha e trilha de auditoria de ações humanas.
- [ ] Definir retenção, opt-out, política de privacidade, backup/restore e rotina de reconciliação de outbox.
- [ ] Rodar aceites completos em local/staging: produto, cesta, Flow, Catálogo, cliente sem telefone, duplicidade, mudança de preço, falha Bling e pausa humana.
- [ ] Pilotar primeiro em uma linha Meta com equipe interna; só depois habilitar a segunda WABA. Confirmar com contador antes de qualquer NF-e real.

## Ordem e execução

1. Tarefas 1–3 constroem a base e a interface vazia.
2. Tarefa 4 fecha cadastro/preço; Tarefa 5 fecha identidade e atendimento manual.
3. Tarefa 6 depende de 4 e 5 e da prova técnica Meta/Flow por WABA.
4. Tarefa 7 depende dos pedidos e do OAuth Bling; escrita real e NF-e ficam sob gates diferentes.
5. Tarefa 8 depende da inbox/contratos e entra somente depois da jornada manual ser estável.
6. Tarefa 9 encerra o piloto e o rollout.

Execução escolhida: **nativa e sequencial**, com revisão ao fim de cada tarefa; os contratos entre banco, Edge Functions e Admin compartilham estado transacional e as integrações têm risco de duplicidade, portanto paralelizar aumentaria retrabalho.

## Pesquisas antecipadas por tarefa

Sim. Para reduzir interrupções e decisões durante a programação, perguntas sobre tecnologia e contratos de API ficam como pesquisa de entrada da tarefa correspondente; cada decisão deve ter resposta, fonte/data, decisão e caso de validação anotados. A pesquisa geral de produto, navegação e arquitetura já está fechada. As telas, contratos puros e adaptadores locais podem avançar. Cada gate externo precisa ser concluído antes da tarefa dependente: migrações só após conferir o Supabase atualizado; tráfego/Flow somente após validação por WABA; escrita no Bling somente após autorização e homologação fiscal.

| Tarefa | Pesquisar/confirmar antes da parte dependente | Onde buscar e o que registrar | O que fica bloqueado enquanto não fechar |
|---|---|---|---|
| 1 — Base | Versão LTS de Node suportada pela versão estável do Next no dia do setup; comportamento do CLI e configuração recomendada | Instalação/deploy oficiais do Next; fixar versões em `.nvmrc` e lockfile | Só a escolha de versão/build; não o desenho do produto |
| 2 — Acesso | Schema/contagem/grants atuais do Supabase; roles reais e política de funcionário desligado; mudança de GRANTs de 30/10/2026 | Branch/baseline local, docs oficiais Supabase e verificação da ref correta; registrar snapshot antes de cada migração | Qualquer migração, até conferir ambiente e backup |
| 3 — Admin | Validar visualmente os wireframes funcionais já documentados; não reabrir comparação de plataformas sem evidência de problema | Caderno §15 e wireframes §27; inspeção em viewport desktop e mobile | Aprovação visual interna, não APIs |
| 4 — Produtos/fotos | Requisitos de imagem do Meta Catálogo; bucket/leitura para imagens públicas; upload de original e derivado Flow; tamanho/formatos e compressão | Docs atuais do Catálogo/Storage; teste de upload e leitura em Storage local; requisito fechado neste caderno: nenhuma alternativa Flow sem foto | Publicar produto/cesta no Meta/Flow se foto, miniatura ou alt text estiverem ausentes |
| 5 — Meta/inbox | Graph API version, permissões, webhook e identidade do cliente; mapear `entry.id` (WABA), `metadata.phone_number_id`, `messages[].id`, `contacts[].wa_id` e `user_id` (BSUID), sem presumir que todo identificador seja telefone. Confirmar se os dois WABAs pertencem ao mesmo portfólio | Postman e [referência oficial Meta de BSUID](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/); testar envio/retorno por BSUID em cada WABA; conversation mantém phone_number_id, BSUID fica escopado ao portfólio | Tráfego real ou mensagem de teste a cliente; mocks podem seguir |
| 6 — Flow/carrinho | Confirmar na referência oficial atual a estrutura de imagem + `alt-text` em opções de seleção, a versão Flow JSON aceita, `data-source` dinâmico, limite do payload e contrato Data Exchange. Validar token correlator no `nfm_reply.response_json` por WABA. Processar carrinho pelo contrato oficial `type=order`, item retailer ID, quantidade, moeda e preço observado | Meta Flow JSON Components (acesso rate-limited nesta rodada), Postman oficial e exemplos oficiais `WhatsApp/WhatsApp-Flows-Tools`; consultar `validation_errors`/`health_status`, fazer spike fotográfico nas duas WABAs e ler em Android/iOS. Miniatura ≤25 KB é meta interna, nunca teto atribuído à Meta | Não publicar Flow comercial sem validação da conta, confirmação do token no webhook e leitura de foto por alternativa; não reabrir regra de agrupar pedidos |
| 7 — Bling | Confirmar cadastro público/homologação, escopos, OAuth/JWT, criação de venda, relação venda→NF-e, endpoint/estados de autorização e como reconciliar POST ambíguo | Referência API v3/FAQ/webhooks e conta autorizada; documentar payload sanitizado, status IDs e prova de consulta antes de habilitar escrita. Iniciar já o processo de homologação em paralelo | Escrita real e NF-e; adaptador mock pode ser construído |
| 8 — ANA | Confirmar modelo disponível, Responses API/function calling, custo/latência/limites e retenção vigentes; experimentar transferência para humano com ferramentas restritas | Docs OpenAI atuais, chave apenas no servidor e conversas sintéticas; registrar modelo/configuração por ambiente e ferramentas permitidas | Resposta da ANA em produção; configurações e simulador podem ser criados com mock |
| 9 — Lançamento | Revalidar Vercel Local/Preview/Production, segredos, backups, restore, retenção/opt-out e processo contábil de NF-e | Docs oficiais da plataforma, teste de restore e aprovação do contador/negócio; checklist de health por WABA e Bling | Piloto externo e emissão fiscal; não a programação local |

**Regra para decisão de pesquisa:** contrato público estável vira decisão com link e data; comportamento que depende da conta exige prova no validador/health check; dado de negócio ou fiscal exige configuração/validação com a empresa/contador. Se a prova de Flow não conseguir mostrar imagem em cada alternativa, não reduzir silenciosamente o requisito: parar o lançamento desse Flow e registrar a limitação antes de oferecer uma experiência diferente.

**Agendamento outbox escolhido:** `pg_cron` + `pg_net` chama `outbox-dispatch` a cada minuto; a outbox PostgreSQL é a fila durável, e a chamada `pg_net` é somente um sinal recuperável (não guardar o job em `pg_net`). A requisição usa chave de serviço interna dedicada lida do Vault, nunca a chave `service_role`, e o endpoint compara essa chave antes de processar. O worker também tenta o envio logo após enfileirar; o tick serve para recuperação. Como Cron está em beta e `pg_net` usa fila de requisição não durável, este mecanismo não é a fonte de verdade: se Cron/Net ficar indisponível, a tela de Configurações mostra saúde ruim e o trabalho continua persistido, com fallback operacional de reprocessamento. Confirmar suporte/limites do projeto na implantação antes de ativar o cron.

Detalhe de segurança do worker: configurar a Edge Function `outbox-dispatch` com verificação JWT do gateway desativada somente porque a chamada vem de Cron; a função exige e compara um segredo interno dedicado (`OUTBOX_DISPATCH_SECRET`) antes de ler jobs. Armazenar o mesmo segredo no Supabase Vault para Cron e em Edge Function Secrets para o worker. A chave publishable pode identificar o projeto, mas não autoriza o dispatch; nunca passar a chave `service_role` no header HTTP.

## Referências de implementação consultadas

- [Next.js — instalação/App Router](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js — implantação](https://nextjs.org/docs/app/getting-started/deploying)
- [Vercel — Next.js e deploy](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel — ambientes Local, Preview e Production](https://vercel.com/docs/deployments/environments)
- [Supabase — Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase — segredos de Edge Functions](https://supabase.com/docs/guides/functions/secrets)
- [Supabase — CLI e desenvolvimento local](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase — testes de banco e RLS com pgTAP](https://supabase.com/docs/guides/database/testing)
- [Supabase — agendar Edge Functions com Cron e Vault](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase — pg_net e limites da fila assíncrona](https://supabase.com/docs/guides/database/extensions/pg_net)
- [Supabase — estágio Beta do Cron](https://supabase.com/features/supabase-cron)
- [shadcn/ui — instalação](https://ui.shadcn.com/docs/installation)
