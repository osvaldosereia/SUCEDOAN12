# WhatsApp Atendimento GitHub

Aplicação nova para catálogo de cestas, atendimento e operação de pedidos pelo WhatsApp.

## Limite desta pasta

Este é o único diretório de código do projeto novo: `projetos/whatsapp-atendimento-github/`. O repositório também contém aplicações em produção e iniciativas paralelas; nenhuma delas é dependência desta aplicação. O código, os tipos, o modelo transacional, os endpoints e os conectores serão escritos do zero.

## Etapa atual

Estado local em 26/10/2026: o Flow usa uma tela por tipo de produto, um produto por tela, quantidades de 1 a `min(6, estoque positivo do catálogo GitHub)` e a última opção “Não quero esse produto”. `products.json` versão 4 mantém o saldo inteiro, inclusive valores negativos; ao confirmar o pedido o servidor prepara uma baixa atômica e idempotente no GitHub. A consulta e edição de clientes e endereços seguem server-side no Supabase privado. O Admin inclui a Central para os canais 0975/1018, com fila, histórico, controle ANA/humano e resposta sujeita aos gates do canal já ativos. Também inclui descoberta de Flows por conta Meta, gestão explícita de rascunhos e vínculo por canal.

A fila e separação mantêm proposta cifrada para falta/substituição. Ao concluir a separação, a API tenta criar a venda usando a conexão compartilhada server-side já existente, com preflight, referência idempotente, reconciliação e verificação após escrita; saldo negativo não bloqueia o caminho. A NF-e requer confirmação digitada `EMITIR_NFE`; o Admin acompanha situação, número e DANFE sem autorizar ou reenviar uma nota já localizada. O consumidor da outbox continua desligado por padrão.

## Situação operacional verificada — 26/10/2026

As quatro migrations próprias deste projeto foram aplicadas no Supabase `ssbesxgaijknwsjbsbcz`. As 14 tabelas transacionais e a tabela pública de sessão têm RLS ligado; a consulta de privilégios confirmou que `anon` e `authenticated` não leem essas tabelas e que `service_role` pode acessá-las. O aviso do advisor “RLS enabled, no policy” é esperado para essas tabelas: não há política pública e os grants são exclusivos do backend.

Foi encontrada e corrigida a confusão de autenticação: o Vitrine valida operadores na tabela `public.admin_users` e mantém sessão Supabase; não depende de GitHub OAuth. O Admin novo agora segue a mesma fonte de operadores, com link de acesso por e-mail sem senha própria, sem criação automática de conta, e valida no backend um operador ativo com papel `owner`. O provider GitHub continua desabilitado, mas deixa de ser requisito. A allowlist do Supabase recebeu o redirect exato de produção e os dois endereços locais de desenvolvimento; o Site URL global permaneceu intacto.

A lista de secrets do Supabase confirma as chaves Meta compartilhadas e a chave do Flow 1018. Não há secrets do GitHub App nem chave do Flow 0975. Os secrets padrão do Supabase (`SUPABASE_URL`, `SUPABASE_DB_URL` e chaves API) são fornecidos pelo runtime e não devem ser cadastrados novamente. O catálogo público pode ser lido sem GitHub App; gravações no GitHub e a baixa do estoque após confirmação ainda dependem do App instalado no repositório.

`whatsapp-admin-api` v1 e `whatsapp-flow-runtime` v1 estão implantadas. A primeira valida a sessão Supabase e o proprietário ativo, lê o catálogo público e encaminha a Central aos serviços ANA existentes. A segunda verifica HMAC e criptografia do Data Exchange e atende canais com chave privada própria configurada. O GitHub App ainda não foi encontrado no cofre de secrets do Supabase, então gravações do catálogo/Flow e a baixa de estoque continuam bloqueadas. As funções `whatsapp-checkout-webhook`, `whatsapp-meta-order-router` e `whatsapp-outbox-worker` ainda não foram implantadas; o roteador não está ligado ao callback ativo.

O código novo usa os nomes Meta existentes no runtime (`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_GRAPH_VERSION`, `META_WHATSAPP_APP_SECRET` e, para 1018, `DA_FLOW_1018_RSA_PKCS8`) sem imprimir seus valores. Os IDs de canal 0975/1018 são resolvidos pela tabela ativa `whatsapp_accounts`. Ainda não foi localizada a chave privada de Flow do canal 0975. O callback Meta segue apontado para `whatsapp-meta-webhook-v1`; o roteador ainda não foi implantado nem configurado como callback. Portanto, não há como receber pedidos reais pelo projeto novo ainda.

Duas funções novas (`whatsapp-admin-api` e `whatsapp-flow-runtime`) foram implantadas; nenhuma Flow foi publicada, mensagem enviada ou escrita Bling executada. `pnpm build` e `git diff --check` passaram. O worker de mensagens segue desligado. Veja o HANDOFF para os próximos gates. Este estado substitui as notas históricas abaixo que diziam que as migrations ainda não tinham sido aplicadas e que o login dependia de GitHub OAuth.

## Regras de segurança

- O repositório é público. Tudo que for commitado aqui, inclusive produtos e imagens, será público.
- Não versionar credenciais, dados de clientes, pedidos, mensagens, sessão ou ajuste interno de preço.
- Não criar senha própria. O login do operador usa link Supabase por e-mail, sem criação automática de conta; toda ação administrativa é validada no backend.
- Nenhum token de escrita do GitHub, chave Meta/Bling ou chave `service_role` pode aparecer no navegador.
- As gravações de catálogo ficam limitadas à branch `project/whatsapp-atendimento-github-20261025`.
- Não publicar Flow nem enviar mensagens reais sem autorização específica da operação. Deploys do projeto novo estão autorizados, após preflight de dependências e segredos; não alterar tabelas, funções ou atendimento existentes do Vitrine.
- O acesso exige sessão Supabase por link de e-mail e correspondência com `public.admin_users` (`role = owner`, `is_active = true`). A API confere isso em cada ação no backend. O GitHub App é usado somente para gravações autenticadas no repositório e para a baixa do estoque.
- A API valida a sessão e a linha ativa do operador em `public.admin_users` a cada chamada. Quando configurado, o GitHub App só grava nesta branch e nunca entrega credenciais ao navegador.

## Organização prevista

- `src/domain/`: regras puras e contratos do domínio, sem dependência de Vitrine Admin.
- `src/admin/`: interface administrativa nova.
- `src/server/`: serviços e portas do backend novo.
- `supabase/functions/`: funções novas deste projeto, isoladas das funções existentes.
- `supabase/migrations/`: modelo transacional novo, somente depois de o contrato de checkout ser fechado.
- `catalog/` e `images/`: catálogo público e imagens compactadas, a partir da Rodada 1.
- `flows/`: rascunhos JSON por canal, associados à revisão de catálogo; IDs Meta ficam nulos até confirmação oficial.

## Rodar a prévia local

Requisitos: Node.js 22 ou mais recente e pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Sem configuração, o app abre em prévia local com o catálogo versionado no checkout. Edições ficam somente na memória do navegador. Para login, copie os valores `VITE_*` de `.env.example` para `.env.local`; o Supabase Auth envia um link de acesso ao e-mail já cadastrado, e a sessão só recebe permissão quando o usuário está ativo como `owner` em `public.admin_users`. O redirect exato de produção e os redirects locais já estão na allowlist do Supabase. A URL da Edge Function é derivada de `VITE_SUPABASE_URL`, impedindo que a sessão seja enviada a outro host por configuração acidental.

Para habilitar gravações no catálogo e a baixa do estoque, configure **somente como secrets das Edge Functions** `whatsapp-admin-api` e `whatsapp-checkout-webhook`:

- `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID` e `GITHUB_PRIVATE_KEY` do GitHub App instalado somente em `osvaldosereia/SUCEDOAN12`;
- Supabase disponibiliza `SUPABASE_URL`, `SUPABASE_DB_URL` e os conjuntos `SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS` no runtime; as funções também aceitam as chaves legadas `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`. Não cadastre nomes `SUPABASE_*` como secrets próprios. A conexão Postgres privada usa o `SUPABASE_DB_URL` injetado pelo projeto.
- A integração Bling usa o cofre/refresh-token compartilhado já mantido no Supabase por funções server-side autorizadas; não configure nem exponha credenciais Bling próprias no Admin novo.
- Os segredos GitHub App também precisam estar disponíveis a `whatsapp-checkout-webhook`, com `Contents: write`, para registrar a baixa do estoque e o marcador opaco no mesmo commit GitHub.
- Para os controles Meta do Admin e endpoint, podem ser usados os nomes específicos por canal; o código também lê como fallback os nomes já usados no runtime (`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_GRAPH_VERSION`, `META_WHATSAPP_APP_SECRET` e `DA_FLOW_0975_RSA_PKCS8`/`DA_FLOW_1018_RSA_PKCS8`). A chave privada do canal 0975 ainda precisa ser confirmada no runtime. `WHATSAPP_FLOW_ENDPOINT_URI` é opcional: por padrão, o código deriva a URL da função nova. Os WABAs e phone number IDs são obtidos server-side de `public.whatsapp_accounts` pela associação fixa `dona-antonia-{canal}`; o Flow publicado escolhido é persistido por canal em `whatsapp_atendimento.channel_flow_bindings`.

Não coloque os segredos acima em `.env.local`, em variável `VITE_*` ou em commit. O Admin API confere a sessão Supabase e o papel/estado do operador no Postgres privado; o CORS fica limitado aos domínios do Admin e endereços locais documentados no código. O Admin API lê o catálogo público sem token do GitHub, grava catálogo e imagens somente com o GitHub App server-side, acessa clientes pelo Postgres privado e chama a Graph API Meta somente em ações explícitas para o canal selecionado. A foto escolhida no editor é convertida no navegador para WebP 240×190 com limite de 27 KB.

O GitHub App e a chave privada do Flow 0975 ainda não estão configurados; as funções de operação e o novo roteador ainda não foram implantados. Nenhum Flow foi publicado e nenhum pedido de cesta foi recebido pelo projeto novo. O único canário real registrado anteriormente veio do painel existente do Vitrine Admin, fora deste worker. A solicitação de venda/NF-e só poderá operar depois de ligar o callback ao roteador novo e conferir os contratos no ambiente autorizado.

## Runtime Flow local

A função `whatsapp-flow-runtime` autentica a assinatura HMAC do corpo bruto, abre o payload com RSA-OAEP/SHA-256 e AES-128-GCM, valida a sessão e lê catálogo pelo commit fixado. Respostas Data Exchange são cifradas com o IV invertido. A cotação deriva no servidor o ajuste necessário para que a composição padrão reproduza o preço-base e devolve o total em centavos, sem enviar esse ajuste separadamente.

Para `whatsapp-flow-runtime`, o código procura os segredos Meta específicos e os aliases existentes descritos acima, além da chave Supabase server-side injetada pelo runtime. O estoque é lido somente do commit GitHub fixado na sessão. O webhook também precisa do GitHub App para baixar o saldo após confirmação. Chaves RSA PEM sem passphrase são aceitas em PKCS#8 ou PKCS#1. O código foi ajustado para os nomes compartilhados conhecidos; a chave 0975 e os segredos do GitHub App ainda não estão confirmados/configurados.

A migration `supabase/migrations/20261026002149_whatsapp_flow_sessions.sql` cria a tabela de sessão com RLS e acesso apenas do `service_role`. As migrations `20261026004500_whatsapp_checkout.sql`, `20261026005000_order_operations_bling.sql` e `20261026040544_whatsapp_atendimento_channel_flow_bindings.sql` completam a operação isolada e o vínculo do Flow por canal. As quatro migrations foram aplicadas e verificadas no Supabase ativo; as funções ainda não foram implantadas. O JSON, o endpoint e a leitura de Flow vinculado estão conectados no código local; a validação no Flow Builder, renderização em aparelho e jornada de imagens continuam pendentes.

## Catálogo inicial

- O recorte contém os produtos atualmente ligados às cinco cestas ativas. `products.json` inclui `stockQuantity` inteiro como fonte pública e versionada; clientes, pedidos e ajuste interno de preço continuam fora do GitHub.
- Cada foto WebP fica em `images/products/`, em caminho relativo. O manifesto registra a origem permitida, hashes, dimensões e tamanho final.
- O importador de migração lê um arquivo temporário fora do Git; ele não consulta Supabase e não é dependência do Admin.

Leia também o [handoff](../../docs/projects/whatsapp-atendimento-github/HANDOFF.md), a [pesquisa complementar](../../docs/projects/whatsapp-atendimento-github/ORDER-ADMIN-AND-IMAGE-RESEARCH.md) e o [plano greenfield](../../docs/projects/whatsapp-atendimento-github/IMPLEMENTATION-PLAN-LUNA-MAX.md).
