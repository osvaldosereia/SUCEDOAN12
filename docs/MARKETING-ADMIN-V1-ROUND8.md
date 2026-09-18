# Marketing Admin V1 — Rodada 8

Atualizado em 18/09/2026.

Status: **GERENCIADOR DE CONEXÕES IMPLEMENTADO / OAUTH ENDURECIDO / CREDENCIAIS REAIS AINDA PENDENTES / ZERO PUBLICAÇÃO EXTERNA**.

## O que foi implementado

### Gerenciador de conexões no Admin

Superfície própria para:
- Meta: Facebook + Instagram em uma única autorização;
- Pinterest;
- estado por canal;
- conexão, reconexão e desconexão;
- escolha da Página Meta;
- descoberta do Instagram profissional vinculado;
- escolha do board Pinterest;
- verificação de identidade;
- nenhuma abertura automática de gate de publicação.

### Meta

Fluxo:
1. Admin salva App ID, App Secret e Graph API version explicitamente validada;
2. o App Secret vai para Supabase Vault;
3. o OAuth abre em popup;
4. callback usa code + state;
5. state é armazenado apenas como SHA-256;
6. backend troca o code por token;
7. consulta /me/accounts e descobre Pages + Page Access Tokens + Instagram profissional;
8. navegador recebe apenas candidatos sem token;
9. usuário escolhe a Página;
10. Page Access Token definitivo vai para o Vault;
11. canais Facebook/Instagram recebem IDs e são verificados;
12. tokens temporários são removidos.

Permissões configuradas:
- pages_show_list;
- pages_read_engagement;
- pages_manage_posts;
- instagram_basic;
- instagram_content_publish.

Stories do Instagram continuam sujeitos à exigência de conta Business na verificação.

### Pinterest

Fluxo:
1. Admin salva App ID/App Secret;
2. OAuth Authorization Code;
3. access token e refresh token ficam no Vault;
4. boards são descobertos;
5. usuário escolhe o board;
6. canal é verificado;
7. refresh automático ocorre quando o access token se aproxima do vencimento.

Scopes:
- boards:read;
- boards:write;
- pins:read;
- pins:write.

## Vault

Credenciais definitivas e temporárias usam namespace estrito:

`dona_antonia_marketing_...`

Funções de Vault são service-role only.

O frontend nunca recebe:
- Page Access Token;
- Pinterest access token;
- refresh token;
- App Secret.

## OAuth session security

Tabela:
`marketing_oauth_sessions`

Regras:
- TTL padrão 15 minutos;
- state armazenado apenas como hash;
- callback same-origin;
- auth code removido da URL pelo callback;
- sessões pertencem ao admin autenticado;
- ações de configuração/OAuth exigem owner;
- tabela com RLS e sem acesso anon/authenticated.

## Hardening v2

Migration:
`20260918185019_marketing_connection_manager_hardening_v2.sql`

Mudanças:
- removido default presumido de Graph API version;
- Meta agora exige versão explicitamente configurada;
- Pinterest recebeu `boards:write`;
- criado `marketing_oauth_cleanup_v1()`;
- sessões OAuth expiradas apagam tokens temporários;
- exchange registra secret refs incrementalmente;
- falha no meio do exchange executa limpeza imediata;
- cleanup é service-role only.

Homologação transacional confirmou:
- segredo temporário criado;
- sessão expirada criada;
- cleanup removeu o segredo;
- sessão ficou expired;
- anon=false;
- authenticated=false;
- service_role=true;
- rollback removeu todos os dados de teste.

## Estado real atual

Meta:
- App Secret: presente no Vault;
- App ID: pendente;
- Graph API version: pendente de validação explícita;
- canais: disconnected.

Pinterest:
- App ID: pendente;
- App Secret: pendente;
- canal: disconnected.

Publicação:
- execution_mode=off;
- publishing_enabled=false;
- kill_switch=true;
- max_daily_publications=0;
- todos os gates por canal=false;
- publication jobs=0;
- published jobs=0;
- external side effects=0;
- OAuth temp secrets=0.

## Callback

URL configurada:
`https://donaantonia.com.br/admin/marketing-oauth-callback.html`

O arquivo está versionado no repositório. A disponibilidade pública precisa ser confirmada após o deploy do Admin antes do OAuth real.

## Próximo gate

Para homologação real:
1. confirmar deploy público do callback;
2. informar/cadastrar Meta App ID;
3. definir Graph API version validada na Meta;
4. executar OAuth Meta e selecionar a Página;
5. cadastrar App ID/App Secret Pinterest;
6. executar OAuth Pinterest e selecionar board;
7. validar todos os canais;
8. preparar uma única peça aprovada;
9. abrir CANARY apenas para um canal e limite diário 1;
10. publicar uma peça de teste;
11. conferir external_ref e métrica;
12. fechar canary novamente antes de qualquer automação recorrente.

Nenhuma dessas etapas abre publicação automaticamente.
