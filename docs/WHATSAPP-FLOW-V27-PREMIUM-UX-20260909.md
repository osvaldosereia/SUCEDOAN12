# Dona Antônia — WhatsApp Flow V27 Premium UX

Data: 2026-09-09

## Objetivo

Reprojetar o Flow comercial para reduzir atrito e aproximar a experiência de um mini comércio conversacional nativo no WhatsApp, preservando a autoridade determinística do Supabase para produtos, preços, estoque, cestas, clientes e pedidos.

A versão em produção (V3 / handler V12 / JSON V26) NÃO foi substituída nesta rodada. A nova arquitetura está isolada como candidata V4 / handler V13 / JSON V27.

## Benchmark profissional considerado

- Nivea + Gupshup: consultoria guiada por WhatsApp Flows, recomendação e carrinho dentro da jornada; caso reporta 86% de conclusão da experiência.
- Taw9eel + Infobip: comércio conversacional reproduz descoberta de produtos, seleção/carrinho, checkout e entrega dentro do WhatsApp.
- Alyasra Fashion + Infobip: catálogo e checkout no WhatsApp para evitar mandar o cliente para fora do canal.
- Twilio/Newtail: uso de ações rápidas para reduzir a fricção no processo de compra de supermercado.
- Princípio adotado: uma decisão única deve ser uma ação direta; seleção + continuar é reservada para escolhas múltiplas.

## Decisões de UX V27

1. **9 cestas em uma lista visual**
   - mantém o seletor visual comprovado;
   - foto ajuda reconhecimento/venda;
   - texto deixa explícito que a personalização é opcional.

2. **Personalização sem obrigação**
   - a cesta já está pronta;
   - o cliente altera apenas o que quiser;
   - continuar sem mudar nada é o caminho natural.

3. **Finalização antes do upsell**
   - após a cesta, “Finalizar pedido” é a primeira ação;
   - categorias e busca aparecem como opção para quem quiser acrescentar itens;
   - adicionais nunca bloqueiam a compra.

4. **Ação única = um toque**
   - ChipsSelector + Data Exchange para Finalizar, categorias e Ver mais;
   - elimina rádio + Continuar em escolhas de uma única ação;
   - busca digitada mantém Footer porque o texto precisa ser submetido.

5. **Até 20 produtos por página**
   - `CheckboxGroup` com mídia compacta (`media-size=regular`);
   - foto pequena + nome + preço/descrição;
   - seleção múltipla na página;
   - botão Continuar existe aqui porque o usuário pode escolher vários produtos.

6. **Quantidade depois da seleção**
   - somente produtos escolhidos ganham seletor de quantidade;
   - até 20 seletores;
   - padrão 1 unidade;
   - máximo `min(6, estoque)`;
   - backend revalida produto, preço, estoque e quantidade.

7. **Paginação útil**
   - backend trabalha com páginas de até 20;
   - se houver mais, menu seguinte oferece “Ver mais de …”;
   - também mantém categorias e Finalizar pedido.

8. **Revisão profissional**
   - total completo é montado no backend (`total_label`);
   - não usa texto misto `Total: ${data.total}`;
   - componentes de cesta continuam sem preço individual.

9. **Cliente conhecido**
   - mostra nome/endereço existentes;
   - cliente confirma e escolhe pagamento;
   - não redigita cadastro conhecido.

10. **Cliente novo/parcial**
    - formulário usa `init-values` com tudo que já estiver conhecido;
    - solicita apenas campos faltantes.

11. **Sucesso só com pedido real**
    - handler V13 exige pedido confirmado e `total > 0` antes da tela de sucesso;
    - se não houver pedido real, retorna `FALHA_FINALIZACAO` em vez de exibir sucesso falso;
    - número, total e próximos passos são textos montados pelo servidor.

## Dados reais medidos no Supabase

Primeira página, limite 20:

- Mercearia: 179 produtos vendáveis, retorna 20, `has_more=true`.
- Limpeza: 62, retorna 20, `has_more=true`.
- Higiene: 66, retorna 20, `has_more=true`.
- Bebidas: 4, retorna 4, sem paginação artificial.
- Casa e Pet: 11, retorna 11, sem paginação artificial.
- Busca `sabonete`: 10 resultados reais atualmente.

O catálogo completo nunca é carregado no Flow.

## Implementação candidata

- `whatsapp/flows/flow-cestas-comercial-v27.json`
- `scripts/build-flow-v27-premium-ux.py`
- `.github/workflows/build-flow-v27.yml`
- `supabase/migrations/20260909212500_whatsapp_flow_premium_ux_v38.sql`
- `flow-cestas-comercial-v4`: `draft`, sem `provider_id`, não default, não live.
- handler candidato: `handle_whatsapp_flow_commercial_exchange_v13`.
- Edge source preparado para futura rota V4 -> V13, mas NÃO implantado nesta rodada.
- pipeline de imagens preparado para `product_options` com até 20 mídias compactas, mas NÃO implantado nesta rodada.

## Testes realizados

- geração V27: OK;
- JSON válido: OK;
- checks estáticos premium: OK;
- GitHub Action `Build Flow V27 Premium UX`: OK após tornar o commit gerado tolerante a concorrência;
- busca/paginação Supabase 20 por página: OK;
- busca `sabonete`: 10 produtos reais: OK;
- picker premium com nome/preço/foto: OK;
- quantidades: 3 selecionados -> 3 campos visíveis, default 1, demais ocultos: OK;
- RPCs candidatas: somente `postgres`/`service_role`: OK.

## Produção preservada

- `flow-cestas-comercial-v3` continua `active`, `default_for_new_sessions=true`, handler V12.
- V4 continua `draft`, `default_for_new_sessions=false`, `candidate_not_live=true`.
- `bling_order_sync_enabled=false` permanece inalterado.

## Antes de publicar a V27

1. validar o JSON V27 no validador oficial da Meta;
2. ajustar qualquer restrição específica de ChipsSelector/CheckboxGroup reportada pela Meta;
3. criar Flow DRAFT separado;
4. smoke visual no número de homologação, incluindo Android de tela pequena;
5. confirmar densidade real com 20 fotos e tempo de carregamento;
6. testar revisão, cliente existente/novo, pedido real em rollback controlado e `nfm_reply`;
7. somente após aprovação explícita, promover V4 e implantar a Edge candidata.
