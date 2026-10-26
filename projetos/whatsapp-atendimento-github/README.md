# WhatsApp Atendimento GitHub

Aplicação nova para catálogo de cestas, atendimento e operação de pedidos pelo WhatsApp.

## Limite desta pasta

Este é o único diretório de código do projeto novo: `projetos/whatsapp-atendimento-github/`. O repositório também contém aplicações em produção e iniciativas paralelas; nenhuma delas é dependência desta aplicação. O código, os tipos, o modelo transacional, os endpoints e os conectores serão escritos do zero.

## Etapa atual

Estado local em 26/10/2026: o Flow usa uma tela por tipo de produto, um produto por tela, quantidades de 1 a `min(6, estoque positivo do catálogo GitHub)` e a última opção “Não quero esse produto”. `products.json` versão 4 mantém o saldo inteiro, inclusive valores negativos; ao confirmar o pedido o servidor prepara uma baixa atômica e idempotente no GitHub. A consulta de clientes e endereços continua server-side no Supabase privado. O Admin inclui busca/criação/edição de clientes e endereços, descoberta de Flows por conta Meta (0975 e 1018), criação de DRAFT, envio de JSON e endpoint, configuração da chave pública, publicação explicitamente confirmada e vínculo de um Flow publicado a cada canal. O webhook e a outbox leem esse vínculo no schema privado, sem `META_FLOW_ID_*` em secrets.

A fila e separação mantêm proposta cifrada para falta/substituição. A geração da venda e NF-e no Bling segue bloqueada em desenvolvimento; a rota disponível é somente leitura e não cria venda ou documento fiscal. O consumidor da outbox permanece desligado por padrão. Nenhuma migration ou função nova foi implantada/aplicada; nenhum Flow foi publicado nem mensagem enviada pelo sistema novo. O único canário histórico é o teste autorizado feito pelo Vitrine Admin e aceito pela Meta em 26/10/2026. As funções que escrevem estoque/Meta ainda dependem de segredos e implantação controlada para uso operacional.

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
- `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (ou `SUPABASE_ANON_KEY`) disponíveis no runtime da função.
- `SUPABASE_DB_URL` somente como segredo server-side para a Admin API acessar `customers`, `customer_phones`, `customer_addresses` e o schema privado de pedidos; use URL do pooler de transação com prepared statements desabilitados.
- Os segredos GitHub App também precisam estar disponíveis a `whatsapp-checkout-webhook`, com `Contents: write`, para registrar a baixa do estoque e o marcador opaco no mesmo commit GitHub.
- Para os controles Meta do Admin e endpoint: `META_ACCESS_TOKEN_0975`, `META_ACCESS_TOKEN_1018`, `META_GRAPH_API_VERSION`, `WHATSAPP_FLOW_ENDPOINT_URI`, `META_FLOW_PRIVATE_KEY_0975` e `META_FLOW_PRIVATE_KEY_1018`. Os WABAs e phone number IDs são obtidos server-side de `public.whatsapp_accounts` pela associação fixa `dona-antonia-{canal}`; o Flow publicado escolhido é persistido por canal em `whatsapp_atendimento.channel_flow_bindings`.

Não coloque os segredos acima em `.env.local`, em variável `VITE_*` ou em commit. A função mantém `verify_jwt = true` e confere o UUID e a identidade GitHub no Supabase Auth. O Admin API lê/grava catálogo e imagens no GitHub, acessa clientes somente via Postgres privado e chama a Graph API Meta somente em ações explícitas para o canal selecionado. A foto escolhida no editor é convertida no navegador para WebP 240×190 com limite de 27 KB.

Esta entrega não configura OAuth/allowlist/GitHub App, não executa deploy, não publica Flow e não habilita o envio do projeto novo. O único canário real foi enviado pelo painel existente do Vitrine Admin, fora deste worker. Até homologação do servidor, a gravação administrativa permanece indisponível.

## Runtime Flow local

A função `whatsapp-flow-runtime` autentica a assinatura HMAC do corpo bruto, abre o payload com RSA-OAEP/SHA-256 e AES-128-GCM, valida a sessão e lê catálogo pelo commit fixado. Respostas Data Exchange são cifradas com o IV invertido. A cotação deriva no servidor o ajuste necessário para que a composição padrão reproduza o preço-base e devolve o total em centavos, sem enviar esse ajuste separadamente.

Para uma implantação futura controlada, os segredos de `whatsapp-flow-runtime` terão de incluir `META_APP_SECRET`, `META_FLOW_PRIVATE_KEY_0975`, `META_FLOW_PRIVATE_KEY_1018` e a credencial de serviço Supabase para localizar clientes e endereços. O estoque é lido somente do commit GitHub fixado na sessão. O webhook também precisa do GitHub App para baixar o saldo após confirmação. Chaves RSA PEM sem passphrase são aceitas em PKCS#8 ou PKCS#1. Nenhuma credencial foi configurada nesta rodada, as funções não foram implantadas e as migrations não foram aplicadas.

A migration `supabase/migrations/20261026002149_whatsapp_flow_sessions.sql` cria a tabela de sessão com RLS e acesso apenas do `service_role`. As migrations `20261026004500_whatsapp_checkout.sql`, `20261026005000_order_operations_bling.sql` e `20261026040544_whatsapp_atendimento_channel_flow_bindings.sql` completam a operação isolada e o vínculo do Flow por canal. Nenhuma foi aplicada. O JSON, o endpoint e a leitura de Flow vinculado estão conectados somente no código local; a validação no Flow Builder, renderização em aparelho e jornada de imagens continuam pendentes.

## Catálogo inicial

- O recorte contém os produtos atualmente ligados às cinco cestas ativas. `products.json` inclui `stockQuantity` inteiro como fonte pública e versionada; clientes, pedidos e ajuste interno de preço continuam fora do GitHub.
- Cada foto WebP fica em `images/products/`, em caminho relativo. O manifesto registra a origem permitida, hashes, dimensões e tamanho final.
- O importador de migração lê um arquivo temporário fora do Git; ele não consulta Supabase e não é dependência do Admin.

Leia também o [handoff](../../docs/projects/whatsapp-atendimento-github/HANDOFF.md), a [pesquisa complementar](../../docs/projects/whatsapp-atendimento-github/ORDER-ADMIN-AND-IMAGE-RESEARCH.md) e o [plano greenfield](../../docs/projects/whatsapp-atendimento-github/IMPLEMENTATION-PLAN-LUNA-MAX.md).
