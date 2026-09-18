# Customer & Marketing OS — CM-1.1 Progress

Atualizado em 18/09/2026.

Status: **QUASE CONCLUÍDA — RLS APLICADO, BOUNDARY SEGURO IMPLANTADO E MIGRAÇÃO DA TELA CLIENTES PREPARADA**.

## Concluído

### 1. Boundary autenticado reaproveitado

Foi decidido reaproveitar `customer-intelligence-v1` em vez de criar novo backend paralelo.

Proteções confirmadas:

- `verify_jwt=true`;
- Bearer JWT obrigatório;
- validação com `auth.getUser`;
- validação de `admin_users`;
- owner/operator para escrita;
- service role somente no backend.

### 2. Customer 360 protegido

Foi adicionada a ação protegida `customer_360`.

Ela reúne, sem passar pelo Admin público:

- cadastro;
- telefones;
- e-mails;
- endereços;
- identidades de canal;
- consentimentos;
- inteligência de compras;
- segmentos comerciais;
- timeline;
- eventos comportamentais;
- handoffs;
- primeiro Data Quality Score.

Edge Function implantada no Supabase:

- slug: `customer-intelligence-v1`;
- versão implantada: 6;
- status: ACTIVE;
- verify_jwt: true.

### 3. Bootstrap seguro do frontend preparado

Criados:

- `admin/customer-os-auth.js`
- `admin/customer-os-api.js`

Fluxo preparado:

`PIN → admin-pin-auth-v1 → token_hash → Supabase Auth /verify → Bearer JWT → customer-intelligence-v1`.

A sessão é mantida em `sessionStorage`, não em armazenamento permanente.

### 4. Runtime preparado

`admin/runtime-config.js` agora conhece:

- `customerOsFunction: customer-intelligence-v1`
- `adminPinAuthFunction: admin-pin-auth-v1`
- `customerOsSecureUiEnabled: false`

A UI nova continua desligada até homologarmos o login, portanto o Admin atual não foi quebrado.

### 5. Teste contratual criado

`scripts/test-customer-marketing-security-boundary-v1.mjs`

Gates previstos:

- Customer OS não pode virar `verify_jwt=false`;
- backend precisa validar auth user;
- backend precisa validar `admin_users`;
- service role nunca pode aparecer no frontend;
- Bearer JWT é obrigatório;
- Customer 360 não pode entrar no endpoint público;
- Consent Ledger não pode entrar no endpoint público.

## RLS aplicado em produção

A policy server-only aprovada foi aplicada por migration `cm_1_1_server_only_rls_v1`.

As seis tabelas agora estão com RLS habilitado, zero policies para clientes e grants de dados removidos de `anon`/`authenticated`:


- agent_eval_release_markers
- whatsapp_basket_media_assets
- whatsapp_direct_config
- whatsapp_direct_events
- whatsapp_direct_state
- whatsapp_direct_templates

Validação pós-migration confirmou para as 6 tabelas:

- `rls_enabled = true`;
- `policy_count = 0`;
- `anon_privs = vazio`;
- `authenticated_privs = vazio`;
- `service_role` mantém acesso operacional.

Foi executado smoke test usando `SET LOCAL ROLE service_role`, com leitura bem-sucedida de todas as seis tabelas.

Consumidores implantados `admin-whatsapp-direct-v1` e `whatsapp-meta-direct-v1` foram auditados e usam `SUPABASE_SERVICE_ROLE_KEY`, portanto continuam compatíveis com o novo RLS.

O advisor do Supabase passa a reportar `RLS enabled, no policy` nessas tabelas. Neste caso o finding é **intencional**, porque elas são server-only/deny-by-default.

## Migração da tela Clientes preparada

A tela Clientes já possui adapter para usar o Customer OS autenticado quando `customerOsSecureUiEnabled=true`.

Foram migrados no código protegido:

- lista e filtros;
- Customer 360;
- histórico;
- detalhe de pedido;
- edição;
- criação/alteração de cliente.

A flag continua `false` até o primeiro teste manual do PIN no navegador. Isso evita bloquear o Admin sem confirmar que o proprietário conhece o PIN configurado.

## Próximo bloco

1. homologação manual do PIN no navegador;
2. ligar a flag em canary;
3. retirar PII correspondente do endpoint público depois do canary;
4. CM-1.2 Identity Resolver — implementação iniciada em seguida.
