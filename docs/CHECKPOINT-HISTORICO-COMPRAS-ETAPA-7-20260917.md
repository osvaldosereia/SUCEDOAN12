# Checkpoint — Ofertas Personalizadas — Etapa 7

Data: 17/09/2026  
Status: **CONCLUÍDA**

## Entregas realizadas

### Ranking dedicado no Supabase

Foi criada a função:

- `get_personalized_offers_v1(conversation_id, limit)`

Migrations:

- `supabase/migrations/20260918002500_personalized_offers_v1.sql`
- `supabase/migrations/20260918003200_fix_personalized_offers_web_scope_v1.sql`

A função somente ordena ofertas já existentes e válidas. Ela não cria desconto, não altera preço e não transforma produto comum em oferta.

O ranking considera:

- produto já comprado pelo cliente;
- número de compras anteriores;
- afinidade por categoria;
- afinidade por subcategoria;
- cesta/carrinho atual;
- produto complementar;
- recência de compra;
- ofertas rejeitadas recentemente;
- excesso de exposição recente.

### Regra web correta

O Chat Comprar é um canal web. Por isso, a etapa foi corrigida para **não usar `is_whatsapp_active` como filtro do catálogo web**.

Continuam obrigatórios para a oferta personalizada:

- `is_offer=true`;
- produto ativo;
- produto fisicamente verificado;
- estoque atual maior que zero;
- preço atual válido.

### API de produtos

`shopping-chat-products-v1` foi publicada em produção na versão 15.

Na tela geral de **Ofertas**, quando existe cliente identificado com histórico real:

1. o backend carrega as ofertas válidas;
2. aplica o ranking personalizado;
3. apresenta primeiro as mais relacionadas ao histórico/carrinho;
4. mantém todas as outras ofertas gerais disponíveis.

Se não existe histórico real, a tela continua funcionando normalmente, sem fingir personalização.

### Interface

`comprar/products.js` passou a mostrar o motivo quando uma oferta recebe prioridade, por exemplo:

- “Você já compra este produto e ele está em oferta”;
- “Oferta em uma categoria que você costuma comprar”;
- “Oferta em um tipo de produto que você costuma comprar”;
- “Combina com a cesta que está no seu pedido”.

Também aparece uma explicação curta:

> Primeiro aparecem ofertas mais próximas das suas compras. As demais ofertas continuam disponíveis abaixo.

O preço continua sendo calculado pelas regras comerciais já existentes do Comprar.

### Validação de cobertura

Foi feita conferência diretamente no Supabase.

Resultado atual do contrato:

- ofertas válidas encontradas: 13;
- ofertas devolvidas pelo ranking: 13;
- todas as ofertas gerais preservadas: **sim**.

Assim, a personalização muda a ordem, mas não esconde ofertas válidas.

### Testes

Criado:

- `scripts/test-comprar-personalized-offers-v1.mjs`

O workflow **Testar Sala de Compra** concluiu com sucesso:

- run `35289762134`;
- JavaScript do cliente: sucesso;
- estrutura pública: sucesso;
- Edge Functions: sucesso;
- segurança do chat público: sucesso;
- regras de pedido/outbound: sucesso.

## Arquitetura

- sem Make;
- Supabase como fonte de verdade;
- histórico apenas influencia ordenação;
- catálogo/preço/estoque atuais sempre vencem o histórico;
- nenhuma inferência de desconto;
- cliente sem histórico mantém experiência geral.

## Próximo passo

**Etapa 8 — Importação do histórico antigo do Bling**

Antes da importação em massa, fazer auditoria não destrutiva da integração atual, credenciais, IDs externos, estrutura dos pedidos e estratégia de idempotência/reconciliação.
