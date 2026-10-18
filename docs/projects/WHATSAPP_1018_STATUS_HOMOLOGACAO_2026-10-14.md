# Atendimento 1018 — estado verificado (14/10/2026)

## Confirmado diretamente nos serviços reais

- Meta WABA do número 1018: conta `dona-antonia-1018`, isolada do 0975.
- Meta Flow `1646700793791407`, nome `Dona Antonia 1018 Atendimento Piloto`, **PUBLISHED**, validação vazia (nenhum erro). Tipo **estático**, apenas 4 intenções; não contém catálogo dinâmico nem checkout.
- Publicação do Flow **não enviou mensagens** e **não alterou a rota atual** do atendimento 1018/0975.
- Nova Edge Function isolada `admin-whatsapp-1018-pilot-v1` publicada (v4); consultas a produtos, ofertas, cestas, metadados/preview Meta e cotação de carrinho **somente leitura**, com contas e canais fixados em 1018.
- Teste negativo via rede do próprio Supabase: nova Edge Function respondeu HTTP 401 sem sessão.
- Fonte canônica `storefront-v2` respondeu HTTP 200 na API `offers`, com 78 ofertas no teste; também respondeu a `home`, `products` e `product` com dados reais.
- Painel `vitrine/admin/atendimento/piloto-1018.html` preparado na branch isolada; **não publicado no site público**. Seleção real de produtos e cestas, cotação de carrinho e link de prévia Meta preparados.
- Testes CI no GitHub para Fluxo, isolamento, SQL, projeção de catálogo e cálculo de carrinho.

## Bloqueios de segurança e funcionalidade para usar com clientes

1. O Flow publicado é **apenas menu**. Não há canal de dados dinâmico da Meta, atendimento de carrinho/pedido confirmado de ponta a ponta, nem integração de webhook pilotada em produção. O cliente ainda não consegue concluir uma compra só pelo WhatsApp.
2. A rotina atual de autenticação automática do Admin precisa de reforço antes de permitir qualquer operação nova sensível na Meta ou emissão de pedidos. A nova função mantém escritas bloqueadas; a exceção `preview_cart` é leitura/cálculo sem pedido ou reserva.
3. A API pública atual do `storefront-v2?action=home` inclui campos internos de reajustes ocultos de cestas. **O piloto filtra todos esses campos**, retornando somente preço final visível, mas a privacidade da API pública existente precisa de revisão separada sem quebrar a precificação do site.
4. O painel novo vive apenas na branch `agent/whatsapp-1018-reversible-pilot-20261013` / draft PR #1092. Não mesclar alterações do worker/migrações nem trocar rota do 1018 sem homologação e aceite explícito.
5. Teste de mensagens reais exige telefone destinatário interno autorizado e implementação dos caminhos de retorno/estado/compra com revalidação, auditoria e idempotência.

## Próxima entrega de produção

- Criar fluxo de compra efetivo ligado ao catálogo e pedidos canônicos, mantendo o valor oculto embutido no preço final da cesta.
- Homologar confirmação/revisão/alteração, indisponibilidade, duplicidade, atendimento humano e rollback, sob autorização de operador forte.
- Ligar apenas canal 1018 após testes e aprovação explícita, com 0975 inalterado.
- A função temporária usada na criação/publicação/consulta do Flow foi desativada e exige JWT (não executa mais provisionamento).

Não marcar ativação concluída antes de evidências de compra real e rollback.
