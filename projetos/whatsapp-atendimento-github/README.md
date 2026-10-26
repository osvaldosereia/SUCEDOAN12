# WhatsApp Atendimento GitHub

Aplicação nova para catálogo de cestas, atendimento e operação de pedidos pelo WhatsApp.

## Limite desta pasta

Este é o único diretório de código do projeto novo: `projetos/whatsapp-atendimento-github/`. O repositório também contém aplicações em produção e iniciativas paralelas; nenhuma delas é dependência desta aplicação. O código, os tipos, o modelo transacional, os endpoints e os conectores serão escritos do zero.

## Etapa atual

Rodada 6: fila e separação de pedidos disponíveis no código local, com proposta cifrada para falta/substituição, novo aceite inbound e preflight Bling bloqueado. A migration e as funções não foram implantadas/aplicadas. OAuth Bling, venda/NF-e e entrega aguardam mapeamentos e regras fiscais aprovados. O runtime de cotação da Rodada 4 está em [src/domain/flow-runtime.ts](src/domain/flow-runtime.ts); a operação de pedidos está documentada em [docs/projects/whatsapp-atendimento-github/ROUND-6-ORDERS-BLING-PLAN.md](../../docs/projects/whatsapp-atendimento-github/ROUND-6-ORDERS-BLING-PLAN.md).

## Regras de segurança

- O repositório é público. Tudo que for commitado aqui, inclusive produtos e imagens, será público.
- Não versionar credenciais, dados de clientes, pedidos, mensagens, sessão ou ajuste interno de preço.
- Não criar senha própria. A autenticação do operador usará uma identidade GitHub autorizada; toda ação administrativa será validada no backend.
- Nenhum token de escrita do GitHub, chave Meta/Bling ou chave `service_role` pode aparecer no navegador.
- As gravações de catálogo ficam limitadas à branch `project/whatsapp-atendimento-github-20261025`.
- Não publicar Flow, enviar mensagem real, implantar função ou mudar produção durante desenvolvimento.
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
- `SUPABASE_DB_URL` somente como segredo server-side para a Admin API consultar e atualizar o schema privado de pedidos; use URL do pooler de transação com prepared statements desabilitados.

Não coloque os segredos acima em `.env.local`, em variável `VITE_*` ou em commit. A função mantém `verify_jwt = true`, confere também o UUID e a identidade GitHub no Supabase Auth, e limita leitura/escrita aos documentos de `catalog/` e imagens em `images/products/`. Escritas usam revisão esperada do branch, validação do catálogo e commit atômico. A foto escolhida no editor é convertida no navegador para WebP 240×190 com limite de 27 KB.

Esta entrega não configura OAuth/allowlist/GitHub App, não executa deploy, não publica Flow e não envia mensagens. Até homologação do servidor, a gravação administrativa permanece indisponível.

## Runtime Flow local

A função `whatsapp-flow-runtime` autentica a assinatura HMAC do corpo bruto, abre o payload com RSA-OAEP/SHA-256 e AES-128-GCM, valida a sessão e lê catálogo pelo commit fixado. Respostas Data Exchange são cifradas com o IV invertido. A cotação deriva no servidor o ajuste necessário para que a composição padrão reproduza o preço-base e devolve o total em centavos, sem enviar esse ajuste separadamente.

Para uma implantação futura controlada, os segredos da função terão de incluir `META_APP_SECRET`, `META_FLOW_PRIVATE_KEY_0975`, `META_FLOW_PRIVATE_KEY_1018` e a credencial de serviço Supabase (`SUPABASE_SECRET_KEY`/`SUPABASE_SECRET_KEYS` ou `SUPABASE_SERVICE_ROLE_KEY`). Chaves RSA PEM sem passphrase são aceitas em PKCS#8 ou PKCS#1. Nenhum valor foi configurado nesta rodada. A função ainda não foi ligada aos rascunhos Flow, não consulta dados reais sem sessão válida e não cria sessões; o webhook autorizado que cria sessões pertence à Rodada 5.

A migration `supabase/migrations/20261026002149_whatsapp_flow_sessions.sql` cria a tabela de sessão com RLS e acesso apenas do `service_role`. Ela foi gerada pelo Supabase CLI e **não foi aplicada** ao projeto. A integração Meta, a estrutura final das telas e a jornada de imagens permanecem sujeitas ao Flow Builder e aos testes controlados da Rodada 7.

## Catálogo inicial

- O recorte contém os produtos atualmente ligados às cinco cestas ativas; os JSONs não incluem estoque, cliente, pedido nem ajuste interno de preço.
- Cada foto WebP fica em `images/products/`, em caminho relativo. O manifesto registra a origem permitida, hashes, dimensões e tamanho final.
- O importador de migração lê um arquivo temporário fora do Git; ele não consulta Supabase e não é dependência do Admin.

Leia também o [handoff](../../docs/projects/whatsapp-atendimento-github/HANDOFF.md), a [pesquisa complementar](../../docs/projects/whatsapp-atendimento-github/ORDER-ADMIN-AND-IMAGE-RESEARCH.md) e o [plano greenfield](../../docs/projects/whatsapp-atendimento-github/IMPLEMENTATION-PLAN-LUNA-MAX.md).
