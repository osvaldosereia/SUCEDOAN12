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
- Meta Direct blockers: permissões do token Supabase não verificadas, webhook não homologado e direct-ready flag=false;
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
9. Meta Direct continua READ_ONLY: Graph API v26.0 já comprovada; executar o diagnóstico nativo para validar permissões do token Supabase e depois homologar webhook;
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
- Graph API version: v26.0 verified;
- permissions do token Supabase: unverified;
- webhook: unverified;
- direct-ready flag: false;
- Meta Direct Edge: version 2;
- Admin Meta Direct: version 7;
- nenhum fallback de Graph API;
- nenhum gate externo aberto.


## Central Meta Foundation

A aba Meta Foundation já exibe o preflight real:

- Policy Registry: 8/8;
- Meta Direct: não pronto;
- blockers: Graph API version, permissões, webhook e direct-ready flag.

O resumo canônico é `relationship_command_summary_v1()` versão `cm1.15-v2`.

Não criar botão de ativação nesta fase. A interface é somente leitura para homologação.


## Instrumentação Comprar — cuidado na retomada

O código atual está corretamente instrumentado e usa cache key `products.js?v=20260918-cm1-events-02`, mas o deploy público do asset ainda não foi comprovado diretamente nesta sessão.

Enquanto `catalog_search` e `product_view` permanecerem em zero:

1. não reimplementar o collector;
2. confirmar primeiro o asset realmente servido em produção;
3. depois executar uso humano real no Comprar;
4. só então reavaliar os critérios 6 e 7.


## Última auditoria adicional

`CM1-HOMOLOGATION-LEGACY-META-EVIDENCE-V1.md`

- não limpar `automation_config` ainda: existem dependências legadas no código;
- 0 outbound jobs nas últimas 24h e 7 dias;
- WABA e Phone Number ID presentes;
- permissões Meta persistidas: 0;
- provider health snapshots: 0;
- webhook events Meta: 0;
- Graph API version: null;
- Meta Direct continua fail-closed e `external_activation_authorized=false`.

Na retomada, não repetir essa auditoria. Continuar pela obtenção de evidência real read-only da Meta ou pelas evidências orgânicas restantes do acceptance checklist.


## Supabase-first — regra de retomada

Não usar Make como automação operacional deste projeto.

Make pode ser consultado somente para recuperar evidência/configuração histórica.

Runtime e novas automações:
- Supabase;
- Edge Functions;
- PostgreSQL/RPC;
- GitHub como código-fonte;
- OpenAI apenas quando necessário e governado.

## Última programação Meta nativa

Commit inicial backend: `de31d35116d6556a8a8e511dadd74b1e798d6240`.

Foi implantada a action `meta_diagnostics_readonly` no `admin-whatsapp-direct-v1` v5 e adicionado o botão **Verificar Meta agora** na Central de Relacionamento.

Estado do preflight antes de executar o botão com a sessão humana:

- Graph API v26.0: comprovada;
- WABA: true;
- Phone Number ID: true;
- outbound fail-closed: true;
- permissions_clear: false;
- webhook_ready: false;
- direct_ready_flag: false;
- blockers: 3;
- `external_activation_authorized=false`.

Próximo passo desta subetapa: responsável entra na Central com o PIN e executa **Meta Foundation → Verificar Meta agora**. Não é ativação externa; é uma consulta GET à Meta feita pelo Supabase.


## Meta webhook — último checkpoint

Leia também:

`CM1-HOMOLOGATION-META-WEBHOOK-V2.md`

Não confundir:

- WABA subscribed;
- Flow health webhook verified;
- Meta Direct callback verified.

Estado:

- Flow health: 669 eventos assinados / 9 flows / funcionando;
- Meta Direct callback: ainda pendente;
- `whatsapp-meta-direct-v1` v3 preparado como ingress fail-closed e compatível com Flow health;
- `admin-whatsapp-direct-v1` v7;
- Meta Direct continua OFF;
- outbound continua OFF;
- `external_activation_authorized=false`.

Próxima ação humana: **Central de Relacionamento → Meta Foundation → Verificar Meta agora**.

Até essa ação acontecer, não promover `permissions_clear`, não promover `webhook_ready` e não alterar `direct_ready_flag`.


## CI confirmado antes da retomada

Última suíte completa desta rodada:

- GitHub Actions run `35387853415`;
- SHA `f2912098a359ab93328f303815acea0b8d72f491`;
- resultado: **SUCCESS**;
- 37 validações verdes, incluindo Meta read-only, Meta Direct fail-closed, readiness e acceptance checklist.

Não repetir correções de CI desta rodada. A próxima pendência é evidência/runtime ou gate humano.


## Critérios implemented — não repetir investigação

Última auditoria confirmou:

- catalog tracking backend está implantado e funcional no `shopping-chat-products-v1` v16;
- houve uso real de catálogo (`catalog_open`, `catalog_add`, checkout), mas ainda 0 buscas e 0 product views;
- portanto critérios 6/7 aguardam interação real, não correção de backend;
- Opportunity Engine tem 75 oportunidades suprimidas e ainda 0 dismissed/converted/expired;
- portanto critério 13 aguarda lifecycle natural;
- SUGGEST e AI cost continuam fechados propositalmente;
- conflito de identidade continua humano.

Não fabricar nenhum desses eventos/estados para completar CM-1.


## Policy Registry — checkpoint final

Revisão técnica concluída:

- 8/8 políticas ativas;
- readiness=true;
- stale=0;
- fail-closed=8/8;
- regra de bens regulados atualizada para v2;
- `license_override=false`;
- catálogo ativo: nenhum item claramente regulado encontrado na varredura preventiva;
- CI run `35388463946`: SUCCESS, 38 validações.

O manual gate `meta_policy_registry_verification` permanece pending e não deve ser convertido em autorização externa automaticamente.


# CHECKPOINT DE TROCA DE ABA — 18/09/2026 16:56 America/Cuiaba

Este é o checkpoint mais recente e prevalece sobre trechos antigos deste arquivo quando houver divergência.

## Projeto

**Dona Antônia — Customer & Marketing OS**

Não confundir com:
- Marketing Admin / Organic Social;
- Studio Criativo / gerador de vídeos;
- Caneca Fácil;
- etapas antigas gerais de `docs/RETOMADA-DONA-ANTONIA.md`.

## Arquitetura vigente

- GitHub: `osvaldosereia/SUCEDOAN12`;
- Supabase: `ssbesxgaijknwsjbsbcz`;
- runtime operacional: **Supabase-first**;
- Make: **somente histórico/auditoria**, nunca runtime novo;
- OpenAI: somente quando necessário e governado;
- `external_activation_authorized=false`.

## Estado CM-1

- critérios totais: 20;
- verified: **14**;
- implemented aguardando evidência/gate: **6**;
- blocked: **0**;
- `ready_for_manual_canary=true`;
- homologação interna: liberada;
- ativação externa: **NÃO autorizada**.

## Meta / WhatsApp

Confirmado:
- Graph API: **v26.0**;
- WABA presente;
- Phone Number ID presente;
- Flow health webhook: **verified**;
- 669 eventos de Flow health assinados observados em 14 dias;
- 9 flows distintos;
- Meta Direct: OFF;
- canonical outbound: OFF;
- `direct_ready_flag=false`;
- `external_activation_authorized=false`.

Ainda pendente:
1. permissões do token Meta guardado no Supabase;
2. callback específico do Meta Direct;
3. `direct_ready_flag` continua false enquanto os dois itens acima não forem comprovados.

Implementação:
- `admin-whatsapp-direct-v1`: **v7**;
- action `meta_diagnostics_readonly`;
- `whatsapp-meta-direct-v1`: **v3**;
- ingress unificado preparado em modo fail-closed;
- botão **Verificar Meta agora** na Central de Relacionamento;
- diagnóstico é GET/read-only e não envia mensagem nem altera configuração da Meta.

## Meta Policy Registry

- 8/8 políticas ativas;
- readiness=true;
- stale=0;
- fail-closed=8/8;
- regra `whatsapp_regulated_verticals_fail_closed`: **v2**;
- `license_override=false`;
- varredura preventiva não encontrou item ativo claramente regulado entre os termos pesquisados;
- manual gate `meta_policy_registry_verification` continua pending.

## Comprar / eventos orgânicos

Runtime:
- `shopping-chat-products-v1`: ACTIVE **v16**;
- tracking `catalog_search` e `product_view` implantado;
- gravação via `record_catalog_interaction_v1`.

Uso real observado:
- `catalog_open`: 56;
- `catalog_add`: 384;
- `catalog_checkout_return`: 22;
- `catalog_remove`: 10;
- `catalog_search`: 0;
- `product_view`: 0.

Conclusão:
- não há falha técnica conhecida;
- critérios 6 e 7 aguardam interação real;
- não criar fixture.

## Opportunity lifecycle

- 75 oportunidades;
- todas `suppressed`;
- dismissed=0;
- converted=0;
- expired=0;
- ausência de lifecycle encerrado é natural no estado atual;
- critério 13 permanece implemented;
- não alterar dados só para produzir evidência.

## IA / Marketing Brain

- SUGGEST continua fechado;
- orçamento IA = 0;
- AI executions = 0;
- critérios correspondentes permanecem implemented de propósito;
- não ligar IA apenas para fechar checklist.

## CI

Última suíte ampliada confirmada:
- workflow: `Testar Admin Dona Antônia`;
- run: `35388463946`;
- SHA: `1f29354122f550c6aea0282c457740980ead3e33`;
- resultado: **SUCCESS**;
- **38 validações verdes**, incluindo Meta Policy Registry, Meta read-only, Meta Direct fail-closed, readiness, acceptance checklist e bloqueio de segredos no navegador.

## Próximas ações humanas seguras

1. Central de Relacionamento → entrar com PIN → **Meta Foundation → Verificar Meta agora**.
   - ação somente leitura;
   - persiste evidência no Supabase;
   - não ativa outbound;
   - não envia mensagem.

2. No Comprar:
   - fazer uma busca real;
   - abrir o detalhe de um produto;
   - depois reconsultar `catalog_search` e `product_view`.

## Ao receber “continue” na nova aba

1. ler este checkpoint;
2. ler `CURRENT-STATE.md`;
3. consultar runtime atual no Supabase antes de assumir qualquer contagem;
4. consultar commits/CI recentes no GitHub;
5. se o usuário já tiver feito as duas ações humanas acima, reexecutar:
   - `cm1_acceptance_checklist_v1()`;
   - `cm1_homologation_readiness_v1()`;
   - `evaluate_meta_direct_readiness_v1(...)`;
6. continuar somente por evidência real;
7. preservar todos os gates externos;
8. não reiniciar etapas concluídas;
9. não usar Make operacionalmente;
10. atualizar `HANDOFF.md` e `CURRENT-STATE.md` ao final da nova rodada.
