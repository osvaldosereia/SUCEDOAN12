# HANDOFF — Customer & Marketing OS

**Leia este arquivo primeiro em qualquer nova janela/rodada.**

## Retomada obrigatória

Projeto: **Dona Antônia — Customer & Marketing OS**.

- GitHub: `osvaldosereia/SUCEDOAN12`;
- Supabase: `ssbesxgaijknwsjbsbcz`;
- ler `CURRENT-STATE.md` e `AUTONOMOUS-COMPLETION-PLAN.md`;
- confirmar HEAD antes de editar e preservar trabalhos paralelos;
- runtime operacional Supabase-first;
- Make somente histórico/auditoria;
- não iniciar CM-2 antes do encerramento correto da CM-1.

## Estado canônico atual

RPCs canônicos reexecutados em 19/09/2026 00:14 America/Cuiaba:

- 20 critérios;
- **15 verified**;
- **5 implemented**;
- **0 blocked**;
- `ready_for_manual_canary=true`;
- `safe_for_internal_homologation=true`;
- `cm1_complete=false`;
- `external_activation_authorized=false`;
- external side effect=false.

Critérios ainda implemented:

- 2 Identity Resolver — **2 conflitos reais**; revisão humana obrigatória;
- 7 Product View — collector pronto; `product_view=0`;
- 13 Opportunity Lifecycle — 75 suppressed; nenhum lifecycle fechado ainda;
- 15 Marketing Brain SUGGEST — capacidade pronta, gate OFF;
- 18 AI cost measured — ledger pronto, 0 execuções governadas reais.

Evidência orgânica importante:

- PapoAI receipts=18;
- `catalog_open=64`;
- `catalog_search=19` — critério 6 já verified;
- `product_view=0`;
- carrinho=437;
- pedidos=47;
- timeline=1376;
- oportunidades=75 suppressed;
- próxima expiração natural de oportunidade: 23/09/2026 17:00:15 UTC.

## Gates / segurança

Manter:

- Meta Direct OFF;
- canonical outbound OFF;
- publishing OFF;
- strategy AI OFF;
- canary externo 0%;
- marketing kill switch ON;
- orçamento IA 0;
- nenhum PIN testado/descoberto;
- nenhum conflito real auto-resolvido;
- nenhuma evidência fabricada.

Meta atual:

- WABA e Phone Number ID presentes;
- Graph API `v26.0`;
- Flow health verified separadamente;
- System User token WhatsApp read-only no Vault: ausente;
- permissões WhatsApp: unverified;
- callback Meta Direct: unverified;
- `direct_ready_flag=false`;
- blockers: permissions, webhook Direct e flag.

## Plano autônomo

Arquivo: `AUTONOMOUS-COMPLETION-PLAN.md`.

Estado:

- Rodada 06 — **CONCLUÍDA**;
- Rodada 07 — próxima;
- Rodadas 08–14 — pendentes.

### Rodada 06 concluída

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-06.md`.

Foi feita auditoria de regressão/CI/consistência:

- HEAD inicial observado: `7314fe5123c5e619869267f651bca2d61ee11beb`;
- HEAD recente era trabalho paralelo de vídeo/Studio Criativo e foi preservado;
- workflow Customer OS continua `.github/workflows/test-admin-v3.yml`;
- última suíte Customer OS ampliada conhecida: run `35388463946`, SUCCESS, 38 validações;
- no HEAD paralelo, workflow geral `Testar Admin e compatibilidade Vitrine` run `35420372760` passou;
- não confundir esse run geral com execução da suíte Customer OS no HEAD atual;
- nenhuma regressão funcional Customer OS conhecida foi encontrada;
- `CURRENT-STATE.md` foi normalizado para o runtime real 15/5/0.

## Próxima rodada — 07

**Hardening da Central de Relacionamento.**

Pode avançar autonomamente:

- revisar UX da homologação sem usar PIN;
- separar claramente “programado”, “aguardando evidência real” e “ação humana”;
- melhorar Meta Foundation/readiness sem criar ativação;
- melhorar loading/erro/vazio;
- revisar acessibilidade e comportamento responsivo por código/contrato;
- adicionar refresh somente read-only se útil;
- atualizar testes contratuais;
- preservar todos os gates.

Se a Rodada 07 terminar cedo, avançar Rodada 08 na mesma execução se continuar seguro.

## Não fazer

- não reiniciar CM-1;
- não ativar outbound/Meta Direct/publishing/IA externa;
- não submeter templates;
- não criar consentimento artificial;
- não criar `product_view` artificial;
- não alterar lifecycle real para fechar checklist;
- não executar IA paga para produzir custo/evidência;
- não testar PIN;
- não auto-resolver identidade;
- não limpar flags legadas sem auditoria de dependências;
- não usar Make como runtime;
- não transformar readiness em autorização externa.

## O que já depende do responsável/evidência real

- revisar 2 conflitos de identidade;
- abrir produto real no Comprar para `product_view`;
- fornecer/configurar System User token WhatsApp no Vault;
- executar diagnóstico Meta read-only autenticado;
- validar PIN/interface da Central no navegador;
- aceitar Policy Registry como gate humano;
- homologar callback Meta Direct;
- decidir se haverá execução real governada de SUGGEST/IA/custo;
- autorizar separadamente qualquer ativação externa futura.

## Regra de fechamento de cada rodada

1. consultar runtime canônico antes de assumir contagens;
2. confirmar HEAD novamente antes de escrever;
3. preservar trabalho paralelo;
4. programar/testar/auditar o máximo seguro;
5. atualizar `CURRENT-STATE.md` e este `HANDOFF.md`;
6. registrar documento/commit da rodada;
7. promover critérios somente com evidência real conforme os RPCs canônicos.
