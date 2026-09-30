# Marketing Center — Run 60 — 2026-09-12

## Escopo desta rodada

Continuidade estritamente no módulo Marketing da Dona Antônia, sem Make e sem ativar qualquer integração externa. A rodada partiu de `docs/RETOMADA-DONA-ANTONIA.md` e do checkpoint Run 59, auditou `main`, PR #276 e Supabase antes de alterar e implementou o próximo bloco seguro já registrado: coordenador privado/read-only, somente em memória, para `summary -> session -> comparison -> surface`.

## Auditoria antes da alteração

- PR #276 aberta, draft e isolada em `feat/marketing-center-clean-20260911`.
- `main` seguia avançando em frentes fora do Marketing, principalmente Imagens/Admin e WhatsApp Flow; não houve rebase, merge nem force-push.
- Supabase permanecia fail-closed:
  - `enabled=false`;
  - `execution_mode=off`;
  - `canary_percent=0`;
  - `kill_switch=true`;
  - geração/render/IA/publishing OFF;
  - seis publishers OFF;
  - aprovação obrigatória;
  - budgets zero;
  - 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 channel accounts;
  - 8 eventos internos e 0 eventos externos;
  - 15/15 tabelas `marketing_%` com RLS ativo;
  - 20 funções `marketing_%`, 0 `SECURITY DEFINER`, 0 EXECUTE por `anon` e 0 EXECUTE por `authenticated`.

Nenhuma migration, Edge Function, Storage, credencial ou integração externa foi alterada.

## Implementação — review frame coordinator v1

Novo módulo:

- `admin-v3/marketing-review-frame-coordinator-readonly-v1.js`

Novo contrato:

- `scripts/test-marketing-review-frame-coordinator-readonly-ui-v1.mjs`

Workflow atualizado:

- `.github/workflows/marketing-center-clean-v1.yml`

### O que o coordenador faz

O coordenador une as superfícies já existentes de summary, sessão, comparação e mount em um frame sanitizado e somente em memória.

Cada frame contém apenas:

- `asset_id`;
- revisão;
- `epoch`;
- `lease_token` efêmero;
- status `current | superseded | stale`;
- status de revisão e quantidade de blockers;
- comparação sanitizada por contagem (`status`, `changed_paths`, `total_paths`);
- flags fail-closed de preview/read-only.

O frame externo não carrega:

- blockers brutos;
- `package_sha256`;
- `idempotency_key`;
- `snapshot_token`;
- `session_token`;
- spec;
- legenda;
- payload de aprovação;
- SVG/PNG;
- request body;
- credenciais.

### Lease/epoch e idempotência

- O primeiro frame de um asset inicia em `epoch=1`.
- Nova revisão atual incrementa o epoch.
- Reentrega idêntica da mesma sessão reutiliza lease e epoch, sem duplicação.
- Revisão anterior passa imediatamente a `superseded` quando uma nova revisão atual é observada.
- Lease desconhecido/adulterado falha fechado como `stale`.
- Lease explicitamente revogado passa a `stale` e não pode ser montado novamente.
- Um lease revogado não volta a `current` por replay da mesma revisão.

### Memória limitada

O registry é limitado a:

- 100 assets atuais;
- 200 leases conhecidos;
- até 200 leases revogados.

Evicções são somente em memória. Não há Storage, banco, filesystem write ou persistência do navegador.

### Mount fail-closed

`mountCurrent`:

1. valida o frame;
2. exige status `current`;
3. resolve somente o registro interno correspondente ao lease;
4. revalida imediatamente antes do mount;
5. delega à superfície de sessão já existente.

Frames `superseded`, `stale`, adulterados ou revogados falham antes de alterar o DOM.

O novo coordenador permanece deliberadamente fora de:

- `admin/app-lite.js`;
- `admin-v3/index.html`.

Portanto continua privado/dormente e sem rollout.

## TDD / verificação

### RED inicial

- teste criado antes da implementação;
- workflow passou a exigir o novo módulo;
- run `34706131822` falhou no syntax-check porque `marketing-review-frame-coordinator-readonly-v1.js` ainda não existia.

### Primeira implementação / descoberta do contrato

- implementação inicial: `bd3f8008ddf594702f4f21b56c1eb739e23e2657`;
- run `34706190992` deixou todos os contratos anteriores verdes e falhou somente no novo teste;
- causa: o teste tentava invalidar usando `session_token` do frame externo, mas esse identificador estava corretamente ausente do frame sanitizado.

A correção foi manter o encapsulamento e mudar a invalidação pública para o próprio lease do frame, sem expor o token interno da sessão.

### GREEN final

Commits funcionais desta rodada:

- criação do teste: `787f16f68ba2088a6fd15324506da0dd8abe58c2`;
- atualização do workflow: `c6af716c1807bbad6413c6e8dff031cffdd9ab80`;
- primeira implementação: `bd3f8008ddf594702f4f21b56c1eb739e23e2657`;
- ajuste do contrato de invalidação: `e3f75253c8a3e556cf0b165a267d10a3a5c475ad`;
- implementação final: `cabcb04f22d5373cd87a472e8a947d9e9fbb07b0`.

Run final:

- `34706310006` — `completed/success`;
- todos os 30 passos do job `safety-contract` passaram;
- passou explicitamente `Validate bounded readonly Marketing review frame coordinator`;
- todos os contratos Marketing anteriores também permaneceram verdes.

## Pós-auditoria Supabase

Após o GREEN final:

- Marketing OFF;
- `execution_mode=off`;
- canary 0%;
- kill switch ON;
- geração/render/IA OFF;
- seis publishers OFF;
- aprovação obrigatória;
- budgets zero;
- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 0 channel accounts;
- 8 eventos internos;
- 0 eventos externos;
- 15/15 tabelas `marketing_%` com RLS ativo;
- 20 funções `marketing_%`;
- 0 `SECURITY DEFINER`;
- 0 EXECUTE para `anon`;
- 0 EXECUTE para `authenticated`.

Nenhuma migration, Edge Function, Storage, segredo, provider, publisher ou configuração de rollout foi implantada/reimplantada.

## Concorrência com main / PR

Na pós-auditoria, `main` estava em `95d4cdcf76a2baceaa7409707ecbd515229efc05` (`security(images): lock down retry trigger function`), ainda avançando fora do Marketing. A branch Marketing permaneceu isolada; não houve rebase, merge nem force-push.

Antes deste checkpoint, a PR #276 estava:

- aberta;
- draft;
- `mergeable=true`;
- head funcional `cabcb04f22d5373cd87a472e8a947d9e9fbb07b0`.

## Gates preservados

Continuam proibidos nesta branch/rodada:

- publicação real;
- dispatch/requeue;
- Storage/upload;
- vídeo real;
- IA paga/provider call;
- Meta/OpenAI/Pinterest/Google externos;
- aumento de canary;
- Instagram/Messenger/Ads;
- qualquer gasto pago.

## Próximo bloco seguro

Criar uma superfície privada/dormente e read-only que consuma exclusivamente o frame sanitizado do coordenador e mostre apenas:

- `current | superseded | stale`;
- revisão/epoch;
- contagem de alterações da comparação;
- contagem de blockers;
- estado do lease.

A superfície deve recusar mount imediatamente quando o lease estiver revogado, `superseded` ou `stale`, continuar fora do loader público e não introduzir rede, persistência, provider, publisher ou mutações.

## Estado geral

O Marketing ainda **não está integralmente concluído/homologado programaticamente**. A automação recorrente deve continuar. O rollout real permanece completamente bloqueado.