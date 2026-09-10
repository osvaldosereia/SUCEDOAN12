# Dona Antônia Agent Core — Checkpoint Rodada 3/6

Data: 2026-09-10

## Estado

Rodada 3 concluída programaticamente. O Agent Core continua em `observe`; memória pode ser lida, mas a escrita automática de aprendizagem permanece desligada e candidatos globais nunca são autopublicados.

## Entregas concluídas

- resumo incremental por conversa;
- memória seletiva por cliente com evidência, confiança e validade;
- preferência declarada com precedência sobre inferência;
- filtros de privacidade para identificadores diretos e atributos sensíveis;
- fila durável PGMQ para aprendizagem fora do caminho síncrono;
- worker `dona-antonia-agent-learning-v1` com Responses API, saída estruturada e `store:false`;
- candidatos de conhecimento/guidance/procedure com deduplicação e revisão humana obrigatória;
- Admin `/admin/aprendizados.html` para revisar, rejeitar ou transformar candidato em rascunho; não existe caminho de autopublicação;
- recuperação estruturada/textual integrada ao pacote do Agent Core; vetor continua desligado porque ainda não demonstrou benefício necessário;
- correção `extensions.digest(...)` para funções com `search_path=''`;
- Edge Function de aprendizagem reconciliada com o GitHub e publicada como versão 2, mantendo autenticação própria e `verify_jwt=false` como no endpoint anterior.

## Validações

- precedência declarado > inferido: passou;
- deduplicação/agrupamento de candidato repetido: passou;
- rejeição de e-mail, telefone e atributo sensível: passou;
- revisão humana transforma candidato apenas em rascunho: passou;
- `published=false` preservado no smoke de revisão;
- fila sem mensagens pendentes ao fechamento;
- CI `Dona Antonia WhatsApp Sales MVP` run `34499282786`: `success`;
- CI dedicado foi ampliado para cobrir Rodadas 3 e 4.

## Segurança preservada

Na conclusão: `whatsapp_live_canary_percent=1`; `experience_orchestrator_enabled=false`; `whatsapp_flow_data_exchange_enabled=false`; `whatsapp_flow_send_enabled=false`; `whatsapp_flow_commercial_write_enabled=false`; `bling_order_sync_enabled=false`; `learning_write_enabled=false`; `global_candidate_autopublish_enabled=false`.

## Próximo ponto

Rodada 4/6: consolidar routers/triggers sem retirar guardrails. Nenhum router comercial pode ser aposentado apenas por inspeção estática; é necessária evidência de paridade do Agent Core em shadow.
