# Customer & Marketing OS — CM-1.13 Template Draft Assistant

Atualizado em 18/09/2026.

Status: **V1 IMPLANTADA — DRAFT/MANUAL ATIVO; IA PROGRAMADA COM GATE FECHADO; SUBMIT META INEXISTENTE NO FLUXO NOVO**.

## Objetivo

Transformar templates oficiais do WhatsApp em objetos locais governados e versionados antes de qualquer submissão à Meta.

A etapa entrega:

- biblioteca local;
- criação manual;
- edição;
- versionamento;
- validação estrutural;
- finalidade;
- categoria;
- idioma;
- variáveis;
- associação a estratégia;
- associação a peça criativa;
- histórico de versões;
- caminho de IA preparado;
- nenhum envio externo.

## Reuso

A CM-1.13 evolui estruturas existentes em vez de criar uma biblioteca paralela:

- `whatsapp_direct_templates`;
- `whatsapp_direct_template_versions`;
- `marketing_strategy_briefs`;
- `marketing_assets`;
- `marketing_runtime_config`;
- `admin-whatsapp-direct-v1`.

O Edge Function antigo `admin-whatsapp-direct-v1` foi trazido para controle de versão no GitHub antes da evolução.

## Estados locais

`local_status`:

- draft;
- review;
- ready_for_submit;
- archived.

O status local não substitui o status da Meta.

`active_meta_version` foi separado de `current_version` para que, no futuro, um novo rascunho não precise substituir imediatamente uma versão já aprovada/ativa.

## Validação determinística

`validate_whatsapp_template_draft_v1` valida sem IA:

- chave interna;
- corpo obrigatório;
- limite interno defensivo;
- categoria;
- idioma;
- mídia;
- JSON de botões;
- sintaxe de variáveis;
- sequência {{1}}, {{2}}, ... sem lacunas.

A validação também devolve:

- errors;
- warnings;
- variables;
- variable_schema;
- provider_policy_verified;
- external_side_effect=false.

### Importante

A validação V1 é **local/estrutural**.

Ela não afirma que a Meta aprovará o template.

Enquanto `meta_policy_registry` não possuir política vigente verificada, o template recebe:

`meta_policy_registry_not_yet_verified`

Isso é warning, não uma aprovação presumida.

Templates MARKETING recebem também aviso explícito de dependência de Consent Ledger e Customer Protection.

## Versionamento

`save_whatsapp_template_draft_v1`:

1. valida;
2. compara com versão corrente;
3. mantém a mesma versão se não houve mudança;
4. incrementa versão quando o conteúdo mudou;
5. grava snapshot em `whatsapp_direct_template_versions`;
6. mantém `enabled=false`;
7. marca nova alteração como `meta_status=not_submitted`;
8. não chama Meta.

## Smoke test

Foi criado um template temporário e salvo duas vezes com alteração de texto.

Resultado:

- primeira gravação: v1;
- segunda gravação: v2;
- version_count: 2;
- local_status: draft;
- enabled: false;
- meta_status: not_submitted;
- validation_status: warning somente porque a política Meta vigente ainda não foi carregada/verificada.

O template temporário foi removido após o teste.

## Templates existentes

Os três templates legados foram importados/validados:

- address_confirm;
- order_confirmed;
- order_received.

Os três continuam DRAFT/desabilitados e atualmente possuem warning de política Meta ainda não verificada.

## IA

O caminho `template_ai_draft` já está programado.

Ele possui:

- JSON Schema;
- contexto opcional do Marketing Brain;
- geração somente de rascunho;
- validação antes de salvar;
- versionamento;
- revisão humana obrigatória;
- proibição de inventar preço, desconto, estoque ou consentimento;
- nenhuma submissão externa.

### Política de custo inicial

No runtime:

- `template_ai_enabled=false`;
- `template_ai_max_daily_calls=0`;
- orçamento diário de IA permanece fechado;
- reasoning effort planejado: low;
- max output inicial: 700 tokens.

Portanto o custo real de IA da CM-1.13 nesta implantação é **zero**.

Se a IA for habilitada no futuro, o caminho verifica gate, orçamento e limite diário antes de chamar o modelo.

## Admin

Na Central de Marketing → Modelos foi criada a área **Templates oficiais do WhatsApp**.

Ela permite:

- nova chave;
- nome futuro Meta;
- categoria;
- idioma;
- finalidade;
- corpo;
- mídia;
- associação a Marketing Brief;
- associação a peça criativa;
- botões em JSON;
- observações;
- change note;
- validação local;
- salvar DRAFT;
- editar;
- consultar versões.

O botão **Criar com IA** existe, mas permanece desabilitado pelo policy gate.

A tela mostra explicitamente:

- DRAFT ONLY;
- Submit Meta OFF;
- estado da validação;
- meta_status;
- versão;
- warnings.

## Compatibilidade/legado

A escrita antiga `save_template` do `admin-whatsapp-direct-v1` foi bloqueada.

Novas alterações devem passar por `template_save_draft`, que oferece validação e versionamento.

A leitura/sincronização legada de status não foi usada pela CM-1.13 para submeter nada.

## Segurança

CM-1.13:

- exige autenticação administrativa;
- aceita escrita apenas owner/operator;
- mantém templates desabilitados;
- não habilita outbound;
- não altera provider;
- não altera consentimento;
- não submete template;
- não envia mensagem.

## Próximo passo oficial

CM-1.14 — PapoAI Adapter temporário.

Objetivo: encapsular a integração atual do PapoAI em um adapter normalizado, de forma que desligar o PapoAI futuramente exija trocar apenas o adapter, não Customer OS, Marketing OS ou regras de negócio.
