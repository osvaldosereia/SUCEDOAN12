# HANDOFF — Customer & Marketing OS

**Leia este arquivo primeiro em qualquer nova janela.**

## Comando de retomada

> Acesse o GitHub `osvaldosereia/SUCEDOAN12` e o Supabase `ssbesxgaijknwsjbsbcz`. Trabalhe somente no projeto **Customer & Marketing OS**. Leia `docs/projects/customer-marketing-os/README.md`, `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md` e `DECISIONS-AND-GUARDRAILS.md`. Busque o HEAD atual antes de editar e preserve trabalhos paralelos. Continue da homologação CM-1. Não teste nem descubra PIN e mantenha `external_activation_authorized=false` até autorização explícita.

## Estado ao salvar este handoff

- CM-0 e CM-1.1 a CM-1.15 implementadas;
- homologação CM-1 em andamento;
- 20 critérios;
- 14 verified;
- 6 implemented;
- 0 blocked;
- ready_for_manual_canary=true;
- cm1_complete=false;
- external_activation_authorized=false;
- 1 conflito de identidade pendente; a Central agora possui fila de revisão humana segura;
- catalog_search real=0; backend implantado confirmado correto, aguardando uso real;
- product_view real=0; backend implantado confirmado correto, aguardando uso real;
- PapoAI adapter recebendo tráfego real;
- nenhum side effect externo observado;
- Meta Policy Registry técnico pronto 8/8; gate humano ainda pending;
- Meta Direct OFF;
- canonical outbound OFF;
- Marketing publishing OFF;
- strategy AI OFF;
- Meta Direct blockers: Graph API version não verificada, permissões não verificadas, webhook não homologado e direct-ready flag=false;
- orçamento IA da homologação = 0.

## Próximas ações

1. confirmar HEAD atual e reler CURRENT-STATE;
2. consultar `cm1_acceptance_checklist_v1()` e `cm1_homologation_readiness_v1()`;
3. manter `external_activation_authorized=false`;
4. responsável decide o conflito de identidade pela fila segura da Central; nenhum auto-merge;
5. observar tráfego real `catalog_search` e `product_view`; não criar fixture para evidência;
6. acompanhar lifecycle real das oportunidades; primeira expiração atual começa em 23/09/2026;
7. responsável valida PIN e visual da Central manualmente;
8. Policy Registry técnico já está pronto 8/8; manter gate humano separado até revisão;
9. Meta Direct continua READ_ONLY: obter evidência real de Graph API version, permissões e webhook antes de qualquer mudança de readiness;
10. não definir `direct_ready_flag=true` enquanto os demais blockers não estiverem comprovados;
11. reexecutar acceptance checklist após cada evidência real;
12. atualizar esta pasta ao final da rodada.

## Proibições de retomada

Não:
- reiniciar CM-1;
- recriar tabelas já existentes;
- misturar com projeto Marketing Studio;
- ativar outbound;
- ativar publishing;
- submeter templates;
- criar consentimento artificial;
- criar fixture só para fechar checklist;
- ligar IA apenas para produzir custo/evidência;
- auto-resolver identidade;
- mexer no PIN;
- assumir que documento antigo é mais atual que o runtime.

## Critério de “pode continuar sozinho”

Pode programar, testar, documentar e auditar tudo que:
- não cria side effect externo;
- não abre gate externo;
- não exige decisão humana sensível;
- não altera consentimento/identidade sem evidência;
- não depende de PIN.

Quando houver gate humano, deixar preparado e registrar exatamente o que falta.

## Regra final

Sempre terminar uma rodada atualizando `CURRENT-STATE.md` e este `HANDOFF.md`.

Este diretório deve permitir retomar o projeto sem depender de qualquer conversa anterior.


## Última rodada técnica

`CM1-HOMOLOGATION-IDENTITY-REVIEW-V1.md`

A infraestrutura para resolver o critério 2 está pronta. A decisão do caso real permanece humana.


## Última rodada Meta

`CM1-HOMOLOGATION-META-POLICY-PREFLIGHT-V1.md`

Resultados principais:

- Policy Registry técnico: ready 8/8;
- Meta Direct: ready=false;
- Graph API version: unverified;
- permissions: unverified;
- webhook: unverified;
- direct-ready flag: false;
- Meta Direct Edge: version 2;
- Admin Meta Direct: version 4;
- nenhum fallback de Graph API;
- nenhum gate externo aberto.


## Central Meta Foundation

A aba Meta Foundation já exibe o preflight real:

- Policy Registry: 8/8;
- Meta Direct: não pronto;
- blockers: Graph API version, permissões, webhook e direct-ready flag.

O resumo canônico é `relationship_command_summary_v1()` versão `cm1.15-v2`.

Não criar botão de ativação nesta fase. A interface é somente leitura para homologação.
