# R0-A — PapoAI Agent External Runbook

## Objetivo

Homologar o transporte PapoAI → Supabase → PapoAI sem tocar em clientes reais e sem efeitos comerciais.

## Endpoint

`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/papoai-agent-external-lab-v1`

- método: `POST`
- conteúdo: JSON
- autenticação: header `X-API-Key`
- a chave real fica no Vault e não deve ser salva neste arquivo.

## Antes do teste

1. Confirmar que `channel_provider_agent_labs.enabled=false`.
2. Confirmar PapoAI outbound, Meta Direct, pedidos, Bling e marketing sem alteração.
3. No PapoAI, criar/usar **Agente Externo isolado de homologação**; não substituir o agente de produção.
4. Informar endpoint HTTPS, POST e `X-API-Key`.
5. Se o painel não aceitar header customizado, parar e registrar `manual_setup_required`; não inventar outro método de autenticação.

## Ativação curta

Imediatamente antes do teste autorizado:

```sql
select public.set_papoai_agent_external_lab_enabled_v1(true);
```

## Sequência de aceite

1. Enviar mensagem normal no contato/número de homologação.
   - esperado: `Teste Dona Antônia concluído. Recebi sua mensagem corretamente.`
2. Enviar segunda mensagem na mesma conversa.
   - esperado: mesma `provider_session_key` e incremento da sessão.
3. Enviar exatamente `TESTE_HANDOFF_DONA_ANTONIA`.
   - observar se o PapoAI efetivamente transfere/avisa equipe.
4. Marcar a sessão como pausada por humano e enviar nova mensagem.
   - observar se `silent:true` evita resposta da IA.
5. Confirmar que nenhum pedido, comando Bling, campanha ou envio proativo foi criado.

## Promoção de evidência

Somente depois de observação real:
- request chegando ao endpoint → `agent_external.request=verified_lab`;
- mesma sessão reconhecida → `agent_external.session=verified_lab`;
- texto realmente apareceu no WhatsApp → `agent_external.text_reply=verified_lab`;
- transferência observada → `agent_external.handoff=verified_lab`;
- silêncio observado → `agent_external.silent=verified_lab`.

Se não funcionar: usar `unsupported` ou `manual_setup_required`.

## Encerramento

Sempre desligar o laboratório:

```sql
select public.set_papoai_agent_external_lab_enabled_v1(false);
```

Depois atualizar `CURRENT-STATE.md` com a evidência observada e só então liberar planejamento da R0-B.
