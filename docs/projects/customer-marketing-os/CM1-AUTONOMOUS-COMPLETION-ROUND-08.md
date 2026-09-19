# CM-1 — Autonomous Completion Round 08

Data: 19/09/2026 ~02:16 America/Cuiaba.

## Objetivo

Esgotar o Meta Direct preflight que pode ser preparado sem System User token e sem qualquer ativação externa.

## Estado confirmado antes da mudança

- 20 critérios = 15 verified / 5 implemented / 0 blocked;
- safe_for_internal_homologation=true;
- external_activation_authorized=false;
- Meta Direct OFF / release_mode=off;
- canonical outbound OFF;
- publishing OFF;
- strategy AI OFF;
- token WhatsApp read-only no Vault ausente;
- Graph API v26.0;
- WABA e Phone Number ID presentes;
- blockers Meta: permissions_unverified_or_blocking, webhook_not_verified, direct_ready_flag_false.

## CI da Rodada 07

O workflow `Customer OS · Relationship Hardening`, run `35423379708`, concluiu com **SUCCESS** no SHA `1df2a65a61168d3d4ab7194d353ae2bffa4d3a68`.

## Auditoria do diagnóstico Meta

O bloco `meta_diagnostics_readonly` foi revisado. O contrato atual:

- resolve credencial primeiro por Edge Secret e depois pelo Vault restrito `dona_antonia_whatsapp_access_token_v1`;
- exige Graph API configurada explicitamente;
- usa somente GET na Graph API;
- consulta `me/permissions`, `WABA/subscribed_apps` e dados read-only do Phone Number;
- exige evidência das permissões `whatsapp_business_management` e `whatsapp_business_messaging`;
- compara o override callback observado com o endpoint exato `whatsapp-meta-direct-v1`;
- mantém Flow health separado da comprovação do callback Meta Direct;
- persiste somente evidência de permissões/health;
- recalcula readiness sem alterar o gate;
- não envia mensagem;
- não muda configuração da Meta;
- não habilita outbound;
- não define `direct_ready_flag=true`.

## Novo hardening de teste

Criado `scripts/test-cm-1-meta-preflight-fail-closed-v2.mjs`.

O contrato cobre estaticamente:

- credencial ausente e fallback Vault restrito;
- ausência de vazamento do token na resposta;
- GET-only;
- proibição de `/messages`, POST e `sendMeta()`;
- scopes WhatsApp obrigatórios;
- callback exato do Supabase;
- distinção Flow health x Meta Direct callback;
- persistência de evidência;
- ausência de mutação de `channel_accounts`/`whatsapp_direct_config` dentro do diagnóstico;
- ausência de autorização externa;
- retorno explícito dos gates atuais em vez de abri-los.

Criado workflow dedicado `.github/workflows/test-customer-os-meta-preflight.yml`, com type-check Deno + contrato read-only existente + contrato fail-closed v2.

Run inicial: `35426161049`; estava `in_progress` no fechamento deste checkpoint e deve ser confirmado na próxima rodada antes de avançar programação sensível.

## Runtime revalidado

- 15 verified / 5 implemented / 0 blocked;
- catalog_search=31;
- product_view=0;
- 2 conflitos de identidade;
- 75 oportunidades suppressed / 0 lifecycle fechado;
- IA executions=0 / custo=0;
- external side effect=false.

Nenhuma evidência foi fabricada.

## Resultado da Rodada 08

A programação autônoma do preflight Meta foi esgotada até o limite seguro sem credencial humana. A infraestrutura já conhece os scopes exigidos, callback esperado, WABA, Phone Number, Graph version, separação Flow/Direct e comportamento fail-closed. O que permanece é evidência real que depende do System User token e da homologação humana do callback.

## Dependências humanas Meta restantes

1. obter/configurar System User token WhatsApp no Vault;
2. executar `Meta Foundation -> Verificar Meta agora` autenticado;
3. comprovar scopes reais;
4. homologar callback Meta Direct;
5. manter `direct_ready_flag=false` até os pré-requisitos serem comprovados;
6. autorização externa continua gate separado.

## Próxima rodada

Rodada 09 — Identity Review: preparação final humana. Antes de editar, confirmar o resultado do run `35426161049` e o HEAD atual.
