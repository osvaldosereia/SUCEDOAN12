# Desenho: Montador de Cestas na Loja Integrada

**Status:** proposta para revisão; não implementada  
**Loja-alvo:** Super Cestas Dona Antônia  
**Branch:** `agent/li-basket-builder-design-20261023`

## Objetivo

Oferecer, dentro da própria Loja Integrada, um montador para Cesta Mini, Econômica, Pequena, Média e Grande. O cliente escolhe o modelo, troca marcas entre produtos equivalentes, ajusta quantidades, inclui extras e envia cada produto como linha individual ao carrinho e checkout nativos.

## Restrições e decisões

- A loja antiga continua em funcionamento; domínio definitivo e DNS ficam intocados.
- A loja nova permanece em manutenção durante configuração e testes.
- Não usar o código do montador antigo, extensões pagas de kits, banco paralelo, checkout próprio, sistema próprio de pedidos ou integração fiscal própria.
- Preservar o pagamento na entrega já ativo.
- Cada item vendido permanece um produto real da Loja Integrada, com SKU e estoque sincronizados pelo Bling.
- O total é a soma dos preços vigentes na Loja Integrada para os itens e quantidades selecionados. Não há ajuste oculto por cesta.
- Reutilizar os dados de composição somente como referência para reconstruir os cinco modelos. Validar cada alternativa contra o catálogo atual da Loja Integrada depois de confirmar a origem do catálogo no Bling. Descartar opções sem SKU utilizável, inativas ou sem disponibilidade.
- Não importar/exportar produtos enquanto a conta/canal e o catálogo do Bling não estiverem confirmados. A Loja Integrada está sem produtos e já possui categorias; importar às cegas pode criar duplicidade ou sobrescrever uma árvore incompatível.
- Não alterar, desativar ou reutilizar os 13 trechos existentes de código (incluindo os legados “CF - ...”).

## Ambiente verificado

- Conta autenticada no painel: **Super Cestas Dona Antônia**.
- Plano Crescimento; loja nova continua em manutenção.
- Tema ativo: **Tema Mix de Imagens**. A personalização atual oferece página de conteúdo, gerenciador de arquivos, inclusão de HTML/CSS/JS e edição CSS; não há motivo identificado para trocar de tema.
- A lista de produtos da conta está vazia. Dois cartões de “Produto Exemplo” vistos na prévia do tema não aparecem no catálogo e não serão tratados como produtos reais.
- Categorias ativas existentes: Cestas Básicas, Material de Limpeza e Mercearia Básica. Há também duas categorias de canecas inativas. A origem/compatibilidade com a árvore do Bling precisa ser conciliada antes da sincronização.
- Aplicativo Bling aparece instalado no painel da Loja Integrada. Isso, por si só, não comprova que o canal correto e a sincronização estão configurados no Bling.
- Pagamento na Entrega aparece ativo.
- O gerenciador permite scripts em páginas de loja, mas a Loja Integrada fecha o checkout para código personalizado. Portanto, o montador não tentará modificar checkout nem página de finalização.
- A documentação pública consultada descreve links de carrinho montados pelo lojista, não um fluxo documentado para escolhas dinâmicas do comprador. A inserção de itens escolhidos pelo visitante precisa ser verificada no carrinho nativo com produtos reais antes de liberar.

## Abordagem selecionada

1. Criar uma página de conteúdo nativa, mantida inativa até a aprovação do fluxo, com uma região de montagem identificável e conteúdo acessível sem JavaScript.
2. Desenvolver um script pequeno, sem dependências externas, versionado neste repositório. Inserir esse script no gerenciador de código da Loja Integrada no rodapé das páginas permitidas, com uma guarda de caminho: ele só carrega e inicializa na página do montador.
3. Manter a configuração dos modelos no próprio script versionado, formada por grupos de produtos e alternativas identificadas por SKU. O script não usa token, chave privada, Supabase ou chamadas de servidor.
4. Carregar preço, disponibilidade, identificação e SKU a partir de dados públicos/visíveis da própria loja, ou usar os dados de produto fornecidos pelo mecanismo nativo que a validação técnica confirmar. Nunca confiar em estoque ou preço antigo vindo do Supabase ou embutido na configuração.
5. Acrescentar as linhas selecionadas ao carrinho usando o mesmo formulário/ação que a página nativa de produto da Loja Integrada usa. Verificar sucesso no carrinho e manter as linhas separadas, para que o Bling reconheça SKU e quantidade de cada componente.
6. Deixar o fechamento e a seleção de Pagamento na Entrega para o checkout nativo.

O ponto 5 é um gate técnico: até um produto real ser sincronizado e o comportamento nativo de adicionar ao carrinho ser observado, não há confirmação suficiente para escrever ou publicar um integrador. Se a plataforma não expuser um caminho compatível com o formulário nativo, a decisão volta para revisão; não será substituída por uma API não documentada sem teste controlado.

## Comportamento proposto

- Seleção de um dos cinco modelos e carregamento das quantidades-base.
- Em cada grupo, seleção entre marcas/itens equivalentes válidos no catálogo atual.
- Aumento e redução de quantidades com limite derivado da disponibilidade atual do produto; impedir quantidades negativas e impedir quantidade maior que o estoque visível.
- Remoção de itens opcionais e restauração dos itens-base.
- Inclusão de extras somente por ação explícita do cliente.
- Resumo sempre visível com produto, marca, SKU quando disponível, quantidade e subtotal; total atualizado a cada mudança.
- Estado vazio, indisponibilidade, erro ao carregar produto e falha no carrinho apresentados com mensagens claras.
- Sem desconto oculto por modelo, arredondamento artificial ou preço fixo de demonstração.

## Plano de validação

1. Reconstruir a composição de cada modelo com produtos atualmente ativos, SKUs válidos, preço e disponibilidade do catálogo da Loja Integrada.
2. Com pelo menos um produto real da conta confirmado, validar a submissão nativa de uma linha e observar o carrinho sem finalizar o pedido.
3. Validar seleção de cada modelo, substituição de marca, quantidades, extras, soma de preço, estoque zero/limite e atualização do carrinho.
4. Conferir se carrinho/pedido preservam SKUs e linhas individuais conforme o mapeamento esperado pelo Bling.
5. Abrir o checkout para leitura e confirmar que permanece nativo e que Pagamento na Entrega continua oferecido. Não enviar pedido, iniciar pagamento ou emitir NF-e.
6. Manter loja em manutenção e página do montador inativa até que o usuário aprove a publicação de teste; domínio e DNS permanecem inalterados.

## Limitações e riscos conhecidos

- Não existe catálogo de produtos na Loja Integrada neste momento; logo, preços, disponibilidade, troca de marcas, carrinho e checkout não podem ser testados de ponta a ponta ainda.
- A identidade do canal/conta do Bling e a origem dos 178 produtos observados na ponte antiga continuam sem confirmação. Essa ponte/token não será usada para escrita.
- Alterações de código personalizado podem afetar o tema e não têm suporte de código pela Loja Integrada; limitar o carregamento à página do montador e fazer teste visual em desktop e celular.
- O checkout não aceita personalização por esses trechos de código.
- A integração carrinho precisa de verificação empírica com produto real; a existência de campo de código HTML/JS não comprova uma API de carrinho oficialmente suportada.

## Fora do escopo

Trocar tema, ativar a loja, mudar DNS/domínio, publicar preços inventados, cadastrar produtos fictícios, alterar configurações ou estoque do Bling, criar pedidos de teste, executar pagamento, emitir NF-e, ou modificar a PR #1357.
