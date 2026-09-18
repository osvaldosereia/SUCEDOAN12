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
- Meta Direct OFF;
- canonical outbound OFF;
- Marketing publishing OFF;
- strategy AI OFF;
- orçamento IA da homologação = 0.

## Próximas ações

1. confirmar HEAD atual;
2. consultar `cm1_acceptance_checklist_v1()`;
3. consultar `cm1_homologation_readiness_v1()`;
4. manter gates externos fechados;
5. responsável abre Qualidade dos Dados e decide o conflito de identidade pela fila nova; nenhum auto-merge;
6. observar uso real de busca e produto no Comprar; não criar fixture para evidência;
7. acompanhar lifecycle real das oportunidades; a primeira expiração atual começa em 23/09/2026;
8. responsável valida PIN e visual da Central manualmente;
9. verificar Meta Policy Registry em modo seguro;
10. homologar Meta Direct sem liberar outbound;
11. reexecutar acceptance checklist;
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
