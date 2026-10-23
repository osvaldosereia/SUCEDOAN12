# Desenho: Montador de Cestas na Loja Integrada

**Status:** proposta corrigida para revisão; integração de preço ao carrinho ainda é um gate técnico  
**Loja-alvo:** Super Cestas Dona Antônia  
**Branch:** `agent/li-basket-builder-design-20261023`

## Objetivo

Oferecer, dentro da própria Loja Integrada, um montador para Cesta Mini, Econômica, Pequena, Média e Grande. O cliente escolhe o modelo, troca marcas entre produtos equivalentes, ajusta quantidades, inclui extras e finaliza pelo carrinho e checkout nativos.

## Regras de preço — decisão corrigida

- As cestas têm preço comercial próprio. O total **não** é a soma pública dos preços dos componentes.
- Preservar o ajuste oculto fixo de cada molde. Preservar também a configuração do ajuste condicional, que só se aplica quando a regra está habilitada e o produto condicionado participa da composição.
- A consulta atual do catálogo interno mostra ajuste fixo preenchido para os cinco moldes ativos. Os valores condicionais também estão cadastrados, mas a flag de aplicação está desativada nos cinco registros atuais. Não ativar essa regra nem trocar valores sem uma decisão explícita.
- O preço inicial permanece o preço comercial definido para o molde. Trocas e quantidades alteradas mudam o total apenas pela diferença de preço dos produtos afetados; remover produto aplica a redução configurada; extras somam seu preço vigente.
- O cliente vê o total atualizado da cesta e a composição por nome/marca/quantidade. Não vê preço unitário, subtotal de componentes ou o valor do ajuste oculto, nem recebe SKU como parte da apresentação pública. SKU permanece no dado do produto que vai ao pedido.
- Valores ocultos não podem ser embutidos em JavaScript público nem retornados separadamente ao navegador. Se for necessário calcular um orçamento no servidor, reutilizar a fonte Vitrine/Admin existente e retornar somente o total calculado.

## Restrições

- A loja antiga continua em funcionamento; domínio definitivo e DNS ficam intocados.
- A loja nova permanece em manutenção durante configuração e testes.
- Não usar o código do montador antigo, extensões pagas de kits, banco paralelo, checkout próprio, sistema próprio de pedidos ou integração fiscal própria.
- Preservar o pagamento na entrega já ativo.
- Os componentes selecionados devem continuar sendo produtos reais, com SKU e estoque sincronizados pelo Bling.
- Não importar/exportar produtos enquanto a conta/canal e o catálogo do Bling não estiverem confirmados. A Loja Integrada está sem produtos e já possui categorias; importar às cegas pode criar duplicidade ou sobrescrever uma árvore incompatível.
- Não alterar, desativar ou reutilizar os 13 trechos de código existentes (incluindo os legados “CF - ...”).

## Ambiente verificado

- Conta autenticada no painel: **Super Cestas Dona Antônia**.
- Plano Crescimento; loja nova continua em manutenção.
- Tema ativo: **Tema Mix de Imagens**. A personalização atual oferece página de conteúdo, gerenciador de arquivos, inclusão de HTML/CSS/JS e edição CSS; não há motivo identificado para trocar de tema.
- A lista de produtos da conta está vazia. Dois cartões de “Produto Exemplo” vistos na prévia do tema não aparecem no catálogo e não serão tratados como produtos reais.
- Categorias ativas existentes: Cestas Básicas, Material de Limpeza e Mercearia Básica. Há também duas categorias de canecas inativas. A origem/compatibilidade com a árvore do Bling precisa ser conciliada antes da sincronização.
- Aplicativo Bling aparece instalado no painel da Loja Integrada. Isso, por si só, não comprova que o canal correto e a sincronização estão configurados no Bling.
- Pagamento na Entrega aparece ativo.
- O gerenciador permite scripts em páginas de loja, mas o checkout fica fechado para código personalizado. O montador não tentará modificar checkout nem página de finalização.
- A documentação consultada descreve links de carrinho montados pelo lojista, não um fluxo documentado para escolhas dinâmicas do comprador nem para transportar um ajuste oculto a um carrinho com componentes individuais.
- A Loja Integrada atualiza preço e disponibilidade ao validar o carrinho no checkout. Por isso, um total calculado apenas na página do montador não é prova de que o checkout cobrará esse valor.

## Abordagem proposta

1. Criar uma página de conteúdo nativa, inicialmente inativa, com uma região de montagem identificável.
2. Desenvolver um script pequeno, sem dependências externas, versionado neste repositório. Inserir no gerenciador de código da Loja Integrada no rodapé das páginas permitidas, com uma guarda de caminho para inicializar somente no montador.
3. Buscar composição, alternativas e regras a partir da fonte de dados existente, após validar no catálogo da própria Loja Integrada os produtos, SKUs, marcas, preços e disponibilidade reais. Não usar estoque/preço antigo do Supabase como disponibilidade da LI.
4. Manter a regra de preço oculta no servidor ou na fonte interna. O navegador recebe apenas a composição pública permitida e o total comercial já calculado, sem ajuste fixo/condicional separado.
5. Adicionar ao carrinho cada componente individualmente pelo fluxo nativo, caso a plataforma aceite esse fluxo sem alterar o preço dos produtos.
6. Manter o checkout nativo e preservar Pagamento na Entrega.

### Gate obrigatório de compatibilidade de preço e carrinho

A interface só poderá ser considerada pronta se o total que o cliente vê no montador for igual ao total cobrado pelo carrinho/checkout, incluindo os ajustes ocultos aplicáveis, e se o pedido continuar identificando cada SKU/componente para o Bling.

Ainda não foi confirmado um mecanismo oficial de carrinho de comprador que aceite o preço calculado do molde enquanto mantém produtos individuais como linhas do carrinho. Esse comportamento precisa ser comprovado com produto real. Não basta exibir um total diferente na página do montador, pois o checkout nativo valida os preços vigentes da LI.

Se o carrinho nativo não aceitar esse total com as linhas individuais exigidas, pausar esse requisito e trazer as alternativas para decisão. Não contornar com preço fictício, alteração em massa de catálogo, ajuste separado exposto ao cliente, checkout externo ou API não documentada.

## Comportamento proposto

- Seleção de um dos cinco modelos e carregamento de suas quantidades-base.
- Troca de marcas apenas por opções equivalentes aprovadas e disponíveis.
- Aumento/redução de quantidades respeitando estoque atual; impedir quantidades negativas e acima da disponibilidade.
- Remoção de itens opcionais e restauração da composição-base.
- Inclusão de extras somente por ação explícita.
- Resumo com nomes/marcas e quantidades, sem preços individuais; o total comercial é recalculado a cada alteração.
- Mensagens claras para estado vazio, indisponibilidade, erro ao carregar a cesta e falha ao adicionar ao carrinho.

## Plano de validação

1. Reconciliar os cinco moldes e suas regras com os produtos reais da Loja Integrada depois de confirmar o canal correto do Bling.
2. Com produto real sincronizado, adicionar uma linha ao carrinho pelo mecanismo nativo e observar o total e o SKU.
3. Validar modelo padrão, substituição de marca, quantidade, remoção e extra; comparar total do montador com carrinho/checkout.
4. Validar o molde com e sem o produto condicionado segundo a flag atual, sem ativar regra desativada.
5. Conferir se preço individual e ajuste oculto não aparecem como valores separados ao cliente e se o pedido mantém os componentes/SKUs esperados pelo Bling.
6. Abrir checkout para leitura e confirmar comportamento nativo e Pagamento na Entrega. Não enviar pedido, iniciar pagamento nem emitir NF-e.
7. Manter a loja em manutenção e a página do montador inativa até aprovação; DNS e domínio permanecem inalterados.

## Limitações e riscos conhecidos

- Não há produtos na Loja Integrada hoje; preço, disponibilidade, substituições, carrinho e checkout não podem ser testados de ponta a ponta.
- A identidade do canal/conta do Bling e a origem dos 178 produtos vistos pela ponte antiga continuam sem confirmação. A ponte/token não será usada para escrita.
- O carrinho pode recalcular o total usando apenas os preços atuais dos produtos individuais e ignorar o total comercial do molde; este é o gate principal.
- Alterações de código podem afetar o tema e não têm suporte de código pela Loja Integrada. O script deve carregar somente na página do montador.
- O checkout não aceita personalização por esses trechos de código.

## Fora do escopo

Trocar tema, ativar a loja, mudar DNS/domínio, publicar preços inventados, cadastrar produtos fictícios, alterar estoque ou regras do Bling, criar pedidos de teste, executar pagamento, emitir NF-e ou modificar a PR #1357.
