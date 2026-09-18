# Marketing Admin V1 — Rodada 8

Atualizado em 18/09/2026.

Status: Gerenciador de Conexões OAuth implementado, com publicação externa ainda bloqueada.

## Entregue

- conexão Meta para Facebook + Instagram;
- conexão Pinterest;
- OAuth com popup no Admin;
- callback same-origin em /admin/marketing-oauth-callback.html;
- descoberta automática de Pages, Instagram vinculado e boards;
- seleção visual quando houver mais de uma conta;
- credenciais persistidas somente no Supabase Vault;
- renovação automática do acesso Pinterest perto da expiração;
- botão Desconectar, que remove a credencial local e volta canais para disconnected;
- Template Assistant do WhatsApp preservado.

## Segurança

A sessão OAuth dura 15 minutos e armazena somente hash do state. As funções sensíveis de Vault são executáveis apenas pelo service_role. O navegador recebe apenas code/state e dados públicos das contas descobertas.

A Rodada 8 não habilita publicação. O runtime continua OFF, kill switch ligado, limite diário zero e gates de canais desligados.

## Estado externo

Meta já possui o segredo de aplicação no Vault e Graph API v26.0 configurada, mas ainda precisa do App ID.

Pinterest ainda precisa App ID e segredo da aplicação.

Nenhum dado ausente foi inventado.

## Banco

- 20260918183416_marketing_connection_manager_oauth_v1.sql
- 20260918184518_marketing_connection_disconnect_v1.sql

## Backend

admin-marketing-workflow-v1: v14, JWT obrigatório.

## Próximo checkpoint

Quando os identificadores de aplicação forem cadastrados pelo Admin, o próprio sistema poderá abrir OAuth, descobrir contas e verificá-las. O canary de publicação permanece separado e só será habilitado depois da homologação da conexão.
