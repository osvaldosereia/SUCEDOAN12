# Piloto reversível — ANA/WhatsApp 1018 (13/10/2026)

## Estado observado no Supabase (consulta somente leitura)
- Projeto: `ssbesxgaijknwsjbsbcz`.
- `dona-antonia-1018` (`+5565984491018`): inbound/outbound Meta, `ana_enabled=true`, `send_enabled=true`, `human_send_enabled=true`, `campaigns_enabled=false`.
- `dona-antonia-0975` (`+5565998150975`): mesmos provedores Meta e ANA ligada.
- Configuração global ANA publicada: versão 2.
- Nenhuma linha de binding Flow foi encontrada para o 1018 em `ops2_meta_whatsapp_flow_bindings_v1` nesta inspeção.
- **PapoAI não é componente ativo nem fallback.** Manter leitura histórica de registros legados quando necessário.

## Finalidade
Permitir experimentar nova lógica de atendimento **somente no 1018**, preservando:
1. O 0975 com sua configuração global e sem alteração de transporte.
2. A versão atual do 1018, congelada por `baseline_version_id`.
3. Mensagens, fila, outbox, consentimentos, pedidos e histórico existentes.
4. Retorno para a versão do 1018 anterior ao piloto sem reprovisionar WhatsApp/Meta.

## Componentes preparados na branch
- Migration `20261013_whatsapp_1018_pilot_release_v1.sql`: snapshot do ponteiro baseline, versões de piloto exclusivas do canal, `mode=current|pilot` e geração monotônica.
- RPC `ops2_ana_channel_active_config_v1`: resolve baseline ou piloto para 1018; 0975 mantém a seleção global vigente.
- RPC `ops2_ana_channel_pilot_control_v1`: stage / activate / rollback, exclusivo do 1018, exige `expected_generation`.
- RPC `ops2_ana_channel_begin_live_send_v1`: conferência transacional de versão antes da criação da outbox.
- Worker atualizado para usar a versão adequada por canal.
- CI e testes de contrato. **Nenhum envio de WhatsApp é realizado por esses testes.**

## Pré-condições de deploy (NÃO executar nesta rodada)
1. Revisão independente do PR e CI verde.
2. Validar SQL num ambiente de homologação, inclusive permissões e FKs.
3. Conferir novamente o estado real de cada runtime, versão global e filas/outbox.
4. Aplicar migration e publicar worker **com modo padrão `current`**; confirmar paridade de comportamento e 0975 intacto.
5. Preparar e validar configuração de atendimento novo para 1018 e seus Flows/templates (ainda faltam bindings verificáveis).
6. Registrar teste de cenário sintético sem Meta e testes internos somente em número autorizado.
7. Preparar controle de ativação restrito ao operador autorizado e observabilidade.
8. Somente então, mediante liberação expressa, realizar a ativação piloto.

## Procedimento de ativação
- Sempre consultar primeiro o `generation` atual da linha em `private.whatsapp_ana_channel_release_v1`.
- Enviar configuração validada à operação `stage` com `expected_generation` atualizado. O modo continua `current`.
- Executar suíte sintética no ambiente separado.
- Ativar `activate` com a nova geração; isso muda **somente** o apontamento da versão do 1018.
- Inspecionar mensagens aceitas, falhas, duplicidade por WAMID, latência e handoffs.
- Não alterar `inbound_provider`, `outbound_provider`, `ana_enabled`, `human_send_enabled`, `send_enabled`, campanhas ou checkout.

## Rollback
- Consultar a geração da linha 1018; invocar `ops2_ana_channel_pilot_control_v1` com `p_action='rollback'`, `p_expected_generation=<geração_atual>` e ID exato do 1018.
- A linha retorna `mode=current`, incrementa `generation` e preserva a versão de piloto como histórico.
- Jobs do piloto ainda sem outbox não podem iniciar novo envio se sua geração não corresponder à versão atual; o trabalhador registra handoff.
- Não apagar fila, outbox ou eventos; reconciliar envios aceitos/incertos pelos IDs originais.
- Confirmar baseline do 1018 ativo e ausência de alteração do 0975.

**Limitação real:** rollback não cancela mensagem que já foi enviada ou cuja solicitação à Meta está em trânsito. Uma resposta já aceita deve ser reconciliada, não reenviada. O botão de rollback não pode prometer retirada de mensagens já transmitidas.

## Segurança e pendências
- As RPCs são `service_role`-only. Nunca expor essa credencial ao navegador.
- Operação `stage` tem validação estrutural no banco; **antes de ativar**, validar a configuração integral pela função `validateAnaConfiguration` e testes sintéticos.
- Integração de controles operacionais na UI ainda não incluída neste PR.
- Os Flows e templates reais do novo atendimento precisam de análise e aprovação próprias; este PR prepara o **motor de reversão**, não implanta a nova experiência.
- Até passar testes de homologação, **não aplicar a migration em produção e não implantar a Edge Function alterada**.
