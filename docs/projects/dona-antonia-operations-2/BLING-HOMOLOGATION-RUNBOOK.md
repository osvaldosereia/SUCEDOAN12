# Bling — Homologação Operations 2.0

> Procedimento operacional. Atualizado em 2026-09-25.

## Objetivo
Liberar o fluxo de situações/reserva/webhooks sem voltar a polling.

## Estado atual
- OAuth dos recursos principais funciona;
- produtos, contatos, pedidos, depósitos, NF-e e financeiro respondem;
- `situacoes/modulos` retorna 403;
- Hub está em `homologation`;
- `hub_enabled=false`;
- `webhooks_enabled=false`;
- nenhum workflow novo deve ser ativado antes do gate ficar verde.

## 1. Escopos do aplicativo Bling
Na Central de Extensões > Área do Integrador > aplicativo usado pela Dona Antônia:

Adicionar os escopos correspondentes a:
- Situações;
- Situações - Módulos;
- Situações - Transições;
- Pedidos de Venda;
- Produtos;
- Estoques;
- Notas Fiscais.

Para webhooks, o Bling só exibe recursos cujos escopos estejam presentes no aplicativo.

Documentação oficial:
- https://developer.bling.com.br/aplicativos
- https://developer.bling.com.br/webhooks

## 2. Redirect OAuth
Configurar no aplicativo:

`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1`

O callback:
- valida `state`;
- troca o authorization code;
- salva somente o refresh token no cofre já existente;
- registra evento no ledger;
- redireciona ao Vitrine/Admin.

## 3. Reautorização
A documentação do Bling informa que alterar escopos e salvar o aplicativo revoga as autorizações existentes.

Depois de salvar os escopos:
1. abrir Vitrine/Admin > Mais > Bling técnico;
2. clicar **Reconectar Bling**;
3. autorizar no Bling;
4. voltar ao Admin;
5. na Central, clicar **Testar novamente**.

## 4. Gate de Situações
Só fica verde quando:
- `GET /situacoes/modulos` = 200;
- módulo de pedido de venda é identificado sem ambiguidade;
- situações são lidas;
- transições são lidas;
- catálogo fica gravado no runtime;
- Control Tower resolve a pendência automaticamente.

## 5. Webhook
Receiver já existe no runtime:

`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1?source=bling-webhook-v2`

Validação implementada:
- HMAC SHA-256;
- header `X-Bling-Signature-256`;
- idempotência por eventId/hash;
- duplicata responde 2xx;
- eventos ficam `held` enquanto Hub/Webhooks estiverem desligados.

Recursos alvo mínimos:
- Pedido de Venda (`order`);
- Produto (`product`);
- Estoque (`stock`);
- Estoque virtual é ativado junto ao estoque segundo a documentação do Bling;
- Nota fiscal (`invoice`).

Não habilitar processamento ainda.

## 6. Próxima POC após escopos
1. criar/identificar situação **Aguardando confirmação**;
2. criar/identificar **Aprovado / Separar**;
3. configurar reserva somente após aprovação;
4. criar 1 pedido canário;
5. confirmar;
6. provar queda no saldo virtual;
7. provar webhook;
8. cancelar e provar liberação da reserva;
9. só depois habilitar pedidos novos em shadow/canary.

## Regra de segurança
Salvar/editar configuração no Bling não deve ativar automaticamente o Hub da Dona Antônia.
A ativação de `hub_enabled` e `webhooks_enabled` só ocorre após os testes acima.
