# WhatsApp Atendimento GitHub

Aplicação nova para catálogo de cestas, atendimento e operação de pedidos pelo WhatsApp.

## Limite desta pasta

Este é o único diretório de código do projeto novo: `projetos/whatsapp-atendimento-github/`. O repositório também contém aplicações em produção e iniciativas paralelas; nenhuma delas é dependência desta aplicação. O código, os tipos, o modelo transacional, os endpoints e os conectores serão escritos do zero.

## Etapa atual

Estado local em 26/10/2026: o Flow usa uma tela por tipo de produto, um produto por tela, quantidades de 1 a `min(6, estoque positivo do catálogo GitHub)` e a última opção “Não quero esse produto”. `products.json` versão 4 mantém o saldo inteiro, inclusive valores negativos; ao confirmar o pedido o servidor prepara uma baixa atômica e idempotente no GitHub. A consulta e edição de clientes e endereços seguem server-side no Supabase privado. O Admin inclui a Central para os canais 0975/1018, com fila, histórico, controle ANA/humano e resposta sujeita aos gates do canal já ativos. Também inclui descoberta de Flows por conta Meta, gestão explícita de rascunhos e vínculo por canal.

A fila e separação mantêm proposta cifrada para falta/substituição. Ao concluir a separação, a API tenta criar a venda usando a conexão compartilhada server-side já existente, com preflight, referência idempotente, reconciliação e verificação após escrita; saldo negativo não bloqueia o caminho. A NF-e requer confirmação digitada `EMITIR_NFE`; o Admin acompanha situação, número e DANFE sem autorizar ou reenviar uma nota já localizada. O consumidor da outbox continua desligado por padrão.

## Situação operacional verificada — 26/10/2026

As quatro migrations próprias deste projeto foram aplicadas no Supabase `ssbesxgaijknwsjbsbcz`. As 14 tabelas transacionais e a tabela pública de sessão têm RLS ligado; a consulta de privilégios confirmou que `anon` e `authenticated` não leem essas tabelas e que `service_role` pode acessá-las. O aviso do advisor “RLS enabled, no policy” é esperado para essas tabelas: não há política pública e os grants são exclusivos do backend.

As quatro Edge Functions novas ainda não foram implantadas. O login GitHub foi verificado e o Supabase Auth retorna `Unsupported provider: provider is not enabled`; acesso do conector Codex ao repositório/banco não habilita o login de usuários do Admin. A configuração exige um OAuth App GitHub e o callback/redirect no Supabase Auth, além de allowlist, origem e credenciais do GitHub App como secrets server-side. Nenhuma ferramenta conectada disponível nesta sessão permite habilitar o provider ou gravar secrets do projeto.

O código novo agora aceita os nomes Meta existentes no runtime (`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_GRAPH_VERSION`, `META_WHATSAPP_APP_SECRET` e, para 1018, `DA_FLOW_1018_RSA_PKCS8`) sem imprimir seus valores. Os IDs de canal 0975/1018 são resolvidos pela tabela ativa `whatsapp_accounts`. Ainda não foi localizada a chave privada de Flow do canal 0975. O callback de resposta do Flow também não está roteado ao novo webhook: hoje a Meta aponta para a função webhook anterior. Portanto, não há como receber pedidos reais ainda.

Nenhuma função nova foi implantada, Flow publicado, mensagem enviada ou escrita Bling executada. `pnpm build` e `git diff --check` passaram após a compatibilidade de nomes Meta; o worker de mensagens segue desligado. Veja o HANDOFF para os gates e próximos passos exatos. Este estado substitui as notas históricas abaixo que diziam que as migrations ainda não tinham sido aplicadas.

## Regras de segurança

- O repositório é público. Tudo que for commitado aqui, inclusive produtos e imagens, será público.
- Não versionar credenciais, dados de clientes, pedidos, mensagens, sessão ou ajuste interno de preço.
- Não criar senha própria. A autenticação do operador usará uma identidade GitHub autorizada; toda ação administrativa será validada no backend.
- Nenhum token de escrita do GitHub, chave Meta/Bling ou chave `service_role` pode aparecer no navegador.
- As gravações de catálogo ficam limitadas à branch `project/whatsapp-atendimento-github-20261025`.
- Não publicar Flow, implantar função ou mudar produção durante desenvolvimento. A única mensagem real autorizada foi o canário de 26/10/2026 via Vitrine Admin; não enviar outras mensagens sem autorização específica.
- O acesso de gravação exige GitHub OAuth pelo Supabase Auth, UUID em allowlist server-side e GitHub App. Sem configuração completa, o app opera em prévia local e a API recusa ações.
- A API valida a sessão a cada chamada, exige identidade GitHub e só emite tokens temporários do GitHub App para este repositório. O navegador nunca recebe essa credencial.

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

Sem configuração, o app abre em prévia local com o catálogo versionado no checkout. Edições ficam somente na memória do navegador. Para login, copie os valores `VITE_*` de `.env.example` para `.env.local`, configure o provedor GitHub no Supabase Auth e permita o endereço local na lista de redirects do Supabase. A URL da Edge Function é derivada de `VITE_SUPABASE_URL`, impedindo que a sessão seja enviada a outro host por configuração acidental. Essas configurações externas não foram alteradas.

Para habilitar gravações na homologação, configure **somente como segredos da Edge Function** `whatsapp-admin-api`:

- `ADMIN_ALLOWED_USER_IDS`: UUIDs de `auth.users.id` autorizados, separados por vírgula;
- `ADMIN_ALLOWED_ORIGINS`: origens web explícitas permitidas, separadas por vírgula;
- `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID` e `GITHUB_PRIVATE_KEY` do GitHub App instalado somente em `osvaldosereia/SUCEDOAN12`;
- Supabase disponibiliza `SUPABASE_URL`, `SUPABASE_DB_URL` e os conjuntos `SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS` no runtime; as funções também aceitam as chaves legadas `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`. Não cadastre nomes `SUPABASE_*` como secrets próprios. A conexão Postgres privada usa o `SUPABASE_DB_URL` injetado pelo projeto.
- A integração Bling usa o cofre/refresh-token compartilhado já mantido no Supabase por funções server-side autorizadas; não configure nem exponha credenciais Bling próprias no Admin novo.
- Os segredos GitHub App também precisam estar disponíveis a `whatsapp-checkout-webhook`, com `Contents: write`, para registrar a baixa do estoque e o marcador opaco no mesmo commit GitHub.
- Para os controles Meta do Admin e endpoint, podem ser usados os nomes específicos por canal; o código também lê como fallback os nomes já usados no runtime (`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_GRAPH_VERSION`, `META_WHATSAPP_APP_SECRET` e `DA_FLOW_0975_RSA_PKCS8`/`DA_FLOW_1018_RSA_PKCS8`). A chave privada do canal 0975 ainda precisa ser confirmada no runtime. `WHATSAPP_FLOW_ENDPOINT_URI` é opcional: por padrão, o código deriva a URL da função nova. Os WABAs e phone number IDs são obtidos server-side de `public.whatsapp_accounts` pela associação fixa `dona-antonia-{canal}`; o Flow publicado escolhido é persistido por canal em `whatsapp_atendimento.channel_flow_bindings`.

Não coloque os segredos acima em `.env.local`, em variável `VITE_*` ou em commit. A função mantém `verify_jwt = true` e confere o UUID e a identidade GitHub no Supabase Auth. O Admin API lê/grava catálogo e imagens no GitHub, acessa clientes somente via Postgres privado e chama a Graph API Meta somente em ações explícitas para o canal selecionado. A foto escolhida no editor é convertida no navegador para WebP 240×190 com limite de 27 KB.

O provedor GitHub OAuth, a allowlist e o GitHub App ainda não estão configurados; as quatro funções novas não foram implantadas. Nenhum Flow foi publicado e nenhum pedido de cesta foi recebido pelo projeto novo. O único canário real registrado anteriormente veio do painel existente do Vitrine Admin, fora deste worker. A solicitação de venda/NF-e só poderá operar depois de ligar o callback ao webhook novo e conferir os contratos no ambiente autorizado.

## Runtime Flow local

A função `whatsapp-flow-runtime` autentica a assinatura HMAC do corpo bruto, abre o payload com RSA-OAEP/SHA-256 e AES-128-GCM, valida a sessão e lê catálogo pelo commit fixado. Respostas Data Exchange são cifradas com o IV invertido. A cotação deriva no servidor o ajuste necessário para que a composição padrão reproduza o preço-base e devolve o total em centavos, sem enviar esse ajuste separadamente.

Para `whatsapp-flow-runtime`, o código procura os segredos Meta específicos e os aliases existentes descritos acima, além da chave Supabase server-side injetada pelo runtime. O estoque é lido somente do commit GitHub fixado na sessão. O webhook também precisa do GitHub App para baixar o saldo após confirmação. Chaves RSA PEM sem passphrase são aceitas em PKCS#8 ou PKCS#1. O código foi ajustado para os nomes compartilhados conhecidos; a chave 0975 e os segredos do GitHub App ainda não estão confirmados/configurados.

A migration `supabase/migrations/20261026002149_whatsapp_flow_sessions.sql` cria a tabela de sessão com RLS e acesso apenas do `service_role`. As migrations `20261026004500_whatsapp_checkout.sql`, `20261026005000_order_operations_bling.sql` e `20261026040544_whatsapp_atendimento_channel_flow_bindings.sql` completam a operação isolada e o vínculo do Flow por canal. As quatro migrations foram aplicadas e verificadas no Supabase ativo; as funções ainda não foram implantadas. O JSON, o endpoint e a leitura de Flow vinculado estão conectados no código local; a validação no Flow Builder, renderização em aparelho e jornada de imagens continuam pendentes.

## Catálogo inicial

- O recorte contém os produtos atualmente ligados às cinco cestas ativas. `products.json` inclui `stockQuantity` inteiro como fonte pública e versionada; clientes, pedidos e ajuste interno de preço continuam fora do GitHub.
- Cada foto WebP fica em `images/products/`, em caminho relativo. O manifesto registra a origem permitida, hashes, dimensões e tamanho final.
- O importador de migração lê um arquivo temporário fora do Git; ele não consulta Supabase e não é dependência do Admin.

Leia também o [handoff](../../docs/projects/whatsapp-atendimento-github/HANDOFF.md), a [pesquisa complementar](../../docs/projects/whatsapp-atendimento-github/ORDER-ADMIN-AND-IMAGE-RESEARCH.md) e o [plano greenfield](../../docs/projects/whatsapp-atendimento-github/IMPLEMENTATION-PLAN-LUNA-MAX.md).
