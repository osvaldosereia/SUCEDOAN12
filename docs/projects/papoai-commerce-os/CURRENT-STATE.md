# PapoAI Commerce OS — Current State

Atualizado: 2026-09-21

## Estado atual

- fase: `r0a_core_transport_verified_waiting_handoff_silent`
- projeto Supabase: `ssbesxgaijknwsjbsbcz`
- branch GitHub: `papoai-commerce-os-r0a-spec-20260921`
- Edge Function: `papo-external-agent-v1`
- versão implantada: **v6**
- lab: **desabilitado**
- efeitos externos comerciais: **false**
- OpenAI: **off na R0-A**
- pedidos/Bling/marketing: **off**
- PapoAI outbound canônico: **disabled**

## Evidência física PapoAI

O teste do construtor de **Agente Externo** do PapoAI foi aceito com:

- HTTP 200;
- resposta interpretada com sucesso;
- `message.text = "Teste Dona Antônia concluído. Recebi sua mensagem corretamente."`;
- sessão `sessao_teste_123`;
- resposta total exibida pelo PapoAI em aproximadamente 2876 ms;
- backend interno registrou a chamada final em aproximadamente 1216 ms;
- nenhuma ação comercial externa.

Sessão de laboratório:
- `provider_session_key=sessao_teste_123`
- `message_count=3`
- status `active`

## Capability Registry

Verificado em laboratório:
- `agent_external.request = verified_lab`
- `agent_external.text_reply = verified_lab`
- `agent_external.session = verified_lab`

Observado na interface:
- `agent_external.media_reply = observed_ui` — resposta aceita `message.media_url` ou `url`.

Ainda não comprovado:
- `agent_external.handoff = unknown`
- `agent_external.silent = unknown`
- botões/listas/Flow pela resposta do Agente Externo permanecem `unknown`.

## Autenticação homologada

Duas credenciais separadas:
1. `X-API-Key` — chave de entrada definida pela Dona Antônia e validada contra Vault.
2. `X-Papo-Response-Token` — Bearer gerado pelo PapoAI e ecoado pelo endpoint em `Authorization: Bearer <token>`.

Essa separação corrigiu o erro `EXTERNAL_AGENT_AUTH_INVALID`.

## Próximo gate

Avançar no wizard do PapoAI para **Transferência** e provar:
1. handoff explícito;
2. silêncio/IA pausada após transferência.

Somente depois disso a R0-A é encerrada e a R0-B Commerce Brain começa.

O laboratório deve permanecer desligado fora dos testes.
