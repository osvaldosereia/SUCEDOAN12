# Marketing Center — Run 52 — 2026-09-12

## Escopo desta rodada

Somente Marketing. Nenhum Make, deploy, migration, Edge Function, rollout, publicação real, credencial social, aumento de canary, IA paga ou gasto externo foi ativado.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN51-20260912.md` relidos.
- `main` auditada no SHA `cbd7e479454c58aed18c645e5d77969f1089ec8d`; os commits mais recentes permaneceram concentrados em WhatsApp Flow/endereço, fora do Marketing.
- PRs recentes auditadas; a PR #276 / branch `feat/marketing-center-clean-20260911` foi mantida isolada, draft, sem rebase, merge ou force-push automático.
- Supabase real auditado antes de alterar: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA/publicadores OFF, aprovação obrigatória, attribution/triage/requeue OFF e budgets zero.
- Baseline confirmado: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 0 channel accounts, 8 eventos internos e 0 eventos com efeito externo.
- Funções `marketing_%` auditadas seguem `SECURITY INVOKER`, sem EXECUTE para `anon`/`authenticated` e com EXECUTE para `service_role`.

## Bloco — edição rápida local, versionada e por allowlist

Arquivos:

- `scripts/test-marketing-quick-edit-patch-v1.mjs`
- `scripts/marketing-quick-edit-patch-v1.mjs`
- `.github/workflows/marketing-center-clean-v1.yml`

Foi criado um patcher local de edição rápida que não toca no banco, Edge, Storage, filesystem, rede, provider ou publisher.

Regras principais:

- somente `generation_mode=no_ai|manual`;
- modos `ai|hybrid` falham fechado com `ai_mode_forbidden` neste caminho;
- somente operação `replace`;
- máximo de 24 operações por patch;
- allowlist de campos visuais editáveis: `background` e, por layer, `text`, posição, dimensões, tipografia, cor/fill, radius, hidden, alinhamento e line-height;
- canvas (`width`/`height`), tipo da layer, `asset_ref` e estrutura não podem ser alterados pelo quick edit;
- proteção explícita contra segmentos `__proto__`, `prototype` e `constructor`;
- limites de tamanho de spec/texto e ranges numéricos;
- `change_note` obrigatório;
- input original não é mutado;
- revisão é incrementada determinísticamente;
- spec anterior e nova recebem SHA-256;
- idempotency key do patch é determinística.

### Diff de revisão sem conteúdo bruto

O resultado contém somente metadata para revisão humana:

- path alterado;
- flag `changed`;
- tipos antes/depois;
- SHA-256 antes/depois.

O diff não carrega texto anterior, texto novo ou `value`, evitando transformar o histórico/read-model em cópia desnecessária do conteúdo.

### Revalidação obrigatória do render

O contrato executa a spec editada novamente pelo pipeline já homologado:

`quick edit -> nova spec/revisão/hash -> SVG em memória -> PNG em memória -> render_integrity`

O teste exige que `render_integrity.spec_sha256` seja exatamente o `spec_sha256` produzido pelo quick edit. Assim uma edição não reaproveita silenciosamente o hash/integridade de uma revisão anterior.

A saída do quick edit permanece invariavelmente:

- `preview_only=true`;
- `mutations_allowed=false`;
- `external_side_effect=false`;
- `network_allowed=false`;
- `provider_call_allowed=false`;
- `storage_write_allowed=false`;
- `filesystem_write_allowed=false`.

## TDD

RED real:

- teste criado primeiro no commit `89694c7864eebf7963d73f09d85a816498392932`;
- workflow conectado no commit `4db8b0ba1071e84cecc3a4cd132a899d5da4f578`;
- run `34684346097` terminou `failure` no syntax-check exatamente porque `marketing-quick-edit-patch-v1.mjs` ainda não existia.

GREEN real:

- implementação funcional no commit `7b3cb26bce79c502e4fbb108dc0ae4ec6c918d5c`;
- run `34684382923` terminou `success`;
- syntax-check e todos os contratos do workflow Marketing passaram, inclusive `Validate local-only Marketing quick edit patches`.

## Pós-auditoria do Supabase

Nenhuma mutação foi feita no Supabase nesta rodada. Estado confirmado após a implementação:

- Marketing OFF;
- `execution_mode=off`;
- canary 0%;
- kill switch ON;
- geração determinística OFF;
- IA de imagem/vídeo OFF;
- publicação global OFF;
- WhatsApp Status OFF;
- Instagram Stories OFF;
- Facebook Stories OFF;
- Instagram Carrossel OFF;
- Pinterest OFF;
- Google Perfil da Empresa OFF;
- aprovação obrigatória;
- attribution/triage/requeue OFF;
- budgets zero;
- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 0 channel accounts;
- 8 eventos internos;
- 0 eventos com `external_side_effect=true`.

Todas as 15 tabelas `marketing_%` auditadas seguem com RLS ligado.

Nenhuma migration, Edge Function, credencial ou integração externa foi implantada/reimplantada.

## Próximo bloco seguro

1. Criar um pacote/read-model privado de revisão que una metadata do quick edit + integridade do novo render + approval preview, sem bytes e sem mutações.
2. Expor esse diff somente na superfície privada/dormente do Marketing, sem conectar ao Admin público enquanto o gate de superfície autenticada não estiver pronto.
3. Manter persistência real de edição atrás das RPCs/RBAC já existentes; não criar atalho de escrita pelo patcher local.
4. Continuar vídeo real somente como manifesto/plano enquanto não houver encoder pinado e homologado.
5. Manter IA real, publishers, dispatch, requeue, canary, Instagram/Messenger/Ads e qualquer gasto pago completamente OFF.

## Estado

Marketing ainda não está integralmente concluído/homologado. A execução recorrente deve continuar.
