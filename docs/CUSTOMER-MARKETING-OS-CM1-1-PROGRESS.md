# Customer & Marketing OS — CM-1.1 Progress

Atualizado em 18/09/2026.

Status: **EM EXECUÇÃO — BOUNDARY AUTENTICADO IMPLANTADO; RLS DAS 6 TABELAS AGUARDA DECISÃO EXPLÍCITA DE POLICY**.

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

## Segurança restante

Seis tabelas continuam sem RLS:

- agent_eval_release_markers
- whatsapp_basket_media_assets
- whatsapp_direct_config
- whatsapp_direct_events
- whatsapp_direct_state
- whatsapp_direct_templates

Auditoria de grants mostrou:

- tabelas WhatsApp/media: operações de dados estão concedidas apenas a `postgres` e `service_role`;
- `agent_eval_release_markers`: anon/authenticated não possuem SELECT/INSERT/UPDATE/DELETE;
- risco imediato é menor do que uma tabela pública com CRUD anon, mas RLS continua recomendado como defesa em profundidade.

### Policy recomendada

**server-only / deny-by-default**:

- habilitar RLS;
- não criar policy para anon;
- não criar policy para authenticated;
- manter acesso server-side por service role/security definer;
- smoke-test de consumidores.

Essa alteração ainda não foi aplicada porque a ativação de RLS exige decisão explícita sobre as policies.

## Próximo bloco após RLS/homologação

1. homologar PIN → sessão → customer_360;
2. ligar `customerOsSecureUiEnabled` em canary;
3. mover a leitura da área Clientes para o boundary seguro;
4. depois remover PII do endpoint público;
5. seguir para CM-1.2 Identity Resolver.
