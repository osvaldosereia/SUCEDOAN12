# Bling — Homologação Operations 2.0

> Procedimento operacional. Atualizado em 2026-09-25.

## Objetivo
Liberar o fluxo de situações/reserva/webhooks sem voltar a polling.

## Estado atual
- OAuth dos recursos principais funciona;
- produtos, contatos, pedidos, depósitos, NF-e e financeiro respondem;
- `situacoes/modulos` responde HTTP 200;
- módulo Vendas, situações e transições foram homologados;
- `status_updates_enabled=true`;
- `Aguardando confirmação` e `Aprovado / Separar` estão criados/identificados;
- reserva de estoque foi comprovada por canário real: somente saldo virtual cai em `Aprovado / Separar` e volta ao retornar para `Aguardando confirmação`;
- Hub está em `homologation`;
- `hub_enabled=false`;
- `webhooks_enabled=false`;
- próximo gate é webhook real + reconciliação sem polling.

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

## 6. POC de situações/reserva
Concluída em 2026-09-25:
1. situação **Aguardando confirmação** homologada;
2. situação **Aprovado / Separar** homologada;
3. reserva configurada somente após aprovação;
4. pedido canário Bling `26967482613` utilizado;
5. mudança de situação confirmada;
6. queda do saldo virtual comprovada;
7. rollback para Aguardando confirmação executado;
8. liberação da reserva comprovada;
9. saldo físico permaneceu intacto.

## 7. POC — Webhooks

### Já homologado internamente
1. HMAC SHA-256 válido;
2. assinatura inválida -> 401;
3. idempotência por eventId/hash -> duplicata responde 2xx;
4. evento fica `held` com processamento desligado;
5. reconciliação de pedido por evento, sem polling;
6. comparação local x Bling sem mutação automática;
7. canário reconciliado como `order_reconciled_noop`.

### Configuração manual no aplicativo Bling
Aplicativo: **GitHub - Sincronização de Produtos**.

Servidor:
`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1?source=bling-webhook-v2`

Recursos v1:
- Pedido de Venda;
- Produto;
- Estoque;
- Nota Fiscal.

Ações:
- created;
- updated;
- deleted.

Observação: `virtual_stock` é habilitado automaticamente junto com `stock`.

### Próximo teste
1. salvar a configuração no Bling;
2. gerar uma atualização real controlada no pedido canário;
3. provar recebimento real assinado;
4. confirmar que o evento real fica `held`;
5. reconciliar somente esse evento;
6. só depois avaliar `webhooks_enabled=true` em canário.

## Regra de segurança
Salvar/editar configuração no Bling não deve ativar automaticamente o Hub da Dona Antônia.
A ativação de `hub_enabled` e `webhooks_enabled` só ocorre após os testes acima.
