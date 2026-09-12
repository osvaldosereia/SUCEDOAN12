# Marketing Center — Run 58 — 2026-09-12

## Escopo

Continuação autônoma somente do módulo Marketing da Dona Antônia na branch isolada `feat/marketing-center-clean-20260911` / PR #276. Nenhuma mudança de WhatsApp operacional, Flow, Agent, Bling, WMS ou outras frentes foi incorporada.

A rodada implementa o próximo bloco seguro definido na Run 57: invalidação explícita bounded-memory de snapshots de revisão e envelope privado/read-only de sessão, mantendo toda execução real e integrações externas desligadas.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` relido na branch de Marketing.
- checkpoint mais recente relido: `docs/MARKETING-CENTER-RUN57-20260912.md`.
- PR #276 auditada antes da alteração: aberta, draft e isolada.
- `main` continuou avançando em outra frente; não houve rebase, merge nem force-push.
- Supabase vivo auditado antes da alteração:
  - `enabled=false`;
  - `execution_mode=off`;
  - `canary_percent=0`;
  - `kill_switch=true`;
  - geração/render operacional/IA OFF;
  - publishing global e os seis publishers OFF;
  - `require_approval=true`;
  - todos os budgets em zero;
  - 15/15 tabelas `marketing%` com RLS ativo.

## Implementado

### 1. Envelope privado/read-only de sessão de revisão

Novo arquivo:

- `admin-v3/marketing-quick-edit-review-session-readonly-v1.js`

A sessão aceita somente o summary sanitizado da etapa anterior e conserva apenas metadados de identidade e segurança:

- `asset_id`;
- `from_revision` / `revision`;
- `package_sha256`;
- `idempotency_key`;
- `snapshot_token`;
- `session_token` determinístico;
- status de revisão, número de blockers e resumo da comparação;
- flags fail-closed de preview.

Não conserva spec, texto editado, caption, approval payload, `render_integrity`, SVG, PNG ou request body.

### 2. Lifecycle explícito `current | superseded | stale`

A API dormente expõe:

- `openSession(summary)`;
- `getSessionStatus(session)`;
- `invalidateSession(sessionToken, reason)`;
- `getRegistryStats()`.

Comportamento:

- a revisão mais nova e íntegra do asset é `current`;
- uma sessão previamente conhecida que perde a posição para revisão superior vira `superseded`;
- identidade adulterada, token desconhecido/inconsistente ou invalidação explícita vira `stale`;
- um token explicitamente invalidado não pode voltar a `current` por simples reentrega do mesmo summary;
- reabrir o mesmo summary antes de invalidação é idempotente e reutiliza o mesmo `session_token`.

### 3. Memória estritamente limitada

O estado continua somente no processo/navegador e possui limites explícitos:

- até 100 assets atuais;
- até 200 tokens conhecidos;
- até 200 tokens explicitamente invalidados.

Ao exceder os limites, entradas antigas são descartadas. Uma sessão cuja identidade deixou o conjunto observado falha fechado como `stale`.

### 4. Superfície continua dormente

O novo arquivo não foi adicionado a `admin/app-lite.js` e, portanto, não entrou no loader público do Admin.

Não possui:

- `fetch`/XHR;
- Supabase;
- Storage;
- filesystem write;
- credenciais;
- provider de IA;
- publisher;
- approve/schedule/execute/requeue;
- chamada Meta/OpenAI/Pinterest/Google.

## TDD comprovado

### RED

Contrato criado primeiro:

- `scripts/test-marketing-quick-edit-review-session-readonly-ui-v1.mjs`;
- workflow atualizado para syntax-check e execução do novo contrato.

Commit de contrato/workflow: `eda44bdd4334edc07d222689030437a93646ce6b`.

Run RED: `34700207048` / job `103570502361`.

Falha esperada e específica:

`Cannot find module ... admin-v3/marketing-quick-edit-review-session-readonly-v1.js`

Nenhuma implementação existia ainda.

### GREEN

Implementação funcional: `dca5feba930f3f61f8b7e5a59319c7ec69dea2eb`.

Run GREEN: `34700259822` / job `103570641884`.

Resultado: `completed/success`.

Passaram:

- syntax-check da nova sessão;
- todos os contratos anteriores do Marketing;
- `Validate bounded readonly Marketing review session lifecycle`.

O novo teste cobre:

- token de sessão determinístico;
- reentrega idempotente;
- `current → superseded` quando revisão superior é observada;
- adulteração → `stale`;
- invalidação explícita → `stale` persistente em memória;
- ausência de conteúdo bruto no envelope;
- limite de 100 assets / 200 tokens.

## Pós-auditoria Supabase

Revalidado depois do GREEN:

- Marketing OFF;
- `execution_mode=off`;
- canary 0%;
- kill switch ON;
- geração/render/IA OFF;
- publishing global OFF;
- WhatsApp Status OFF;
- Instagram Story OFF;
- Facebook Story OFF;
- Instagram Carousel OFF;
- Pinterest OFF;
- Google Perfil da Empresa OFF;
- aprovação obrigatória;
- budgets zero;
- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 0 channel accounts;
- 8 eventos internos;
- 0 eventos com efeito externo;
- 15/15 tabelas Marketing com RLS ativo;
- 20 funções `marketing_%` auditadas;
- 0 `SECURITY DEFINER`;
- 0 funções Marketing executáveis por `anon`;
- 0 funções Marketing executáveis por `authenticated`.

Nenhuma migration, Edge Function, credencial, Storage ou integração externa foi implantada/reimplantada nesta rodada.

## Concorrência com main

Na checagem final desta rodada, `main` estava em `9c774f4b8b179d900153402d3fd1db3c2a393e2c`, com mudança de Chat/identificação web, fora do Marketing.

A PR #276 permaneceu isolada. Não houve rebase, merge nem force-push.

## Estado do projeto

O Marketing ainda **não está integralmente concluído nem homologado para rollout real**.

O backend protegido, biblioteca, editor/quick edit, campanhas/calendário/fila/aprovação/métricas read-only, preflights dos seis destinos, geração local sem IA, IA somente preflight, pipeline SVG→PNG em memória, integridade, pacote/handoff/comparação/summary e agora sessão de revisão bounded-memory estão cobertos por contratos. Porém vídeo real, IA paga e publicação real continuam deliberadamente não homologados.

## Próximo bloco seguro

Criar uma superfície privada/dormente de sessão de revisão que mostre somente `current | superseded | stale` e permita mount **apenas quando a sessão continuar `current`**, com fail-closed imediato para `superseded/stale`. O mount deve continuar sem conteúdo bruto, rede ou persistência e fora do loader público.

Depois disso, avançar para coordenação local entre summary/session/comparison e revisão humana, sem habilitar qualquer publisher.

Continuam proibidos sem autorização explícita:

- vídeo real/encoder externo;
- IA paga;
- Storage/upload;
- publicação real;
- dispatch/requeue;
- aumento de canary;
- Instagram/Messenger/Ads;
- qualquer gasto pago ou side effect externo.
