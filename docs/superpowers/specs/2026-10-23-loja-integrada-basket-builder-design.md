# Desenho: Montador de Cestas na Loja Integrada

**Status:** proposta corrigida para revisão; integração do ajuste ao carrinho é um gate técnico  
**Loja-alvo:** Super Cestas Dona Antônia  
**Branch:** `agent/li-basket-builder-design-20261023`

## Objetivo

Oferecer, dentro da própria Loja Integrada, um montador para Cesta Mini, Econômica, Pequena, Média e Grande. O cliente escolhe o modelo, troca marcas entre produtos equivalentes, ajusta quantidades, inclui extras e finaliza pelo carrinho e checkout nativos.

## Regra de preço

- Cada cesta tem um preço comercial composto pelos itens selecionados e **um único ajuste oculto fixo por cesta**.
- A única fonte do ajuste é o valor fixo do molde em Vitrine/Admin. Não usar nem aplicar adicional condicional ou outro segundo ajuste. Os campos condicionais existentes no banco ficam fora do cálculo.
- No modelo inicial, o preço comercial deve corresponder à soma dos produtos da composição padrão mais esse único ajuste fixo.
- Trocas e quantidades alteradas mudam o total pela diferença dos produtos afetados; remoção reduz o total conforme o item removido; extras acrescentam seu preço vigente. O ajuste fixo permanece uma vez por cesta.
- O cliente vê o total atualizado e os itens por nome/marca/quantidade. Não vê preço unitário, subtotal de componentes nem o valor do ajuste oculto. SKU permanece nos dados dos produtos enviados ao carrinho/pedido, mas não precisa aparecer na composição pública.
- O número do ajuste não pode ser embutido em JavaScript público nem retornado separadamente ao navegador. Se necessário, o servidor usa a fonte Vitrine/Admin existente e retorna apenas o total calculado.

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
- A inclusão de código personalizado funciona em páginas da loja, mas checkout/finalização ficam fechados para esse código.
- A documentação consultada descreve links de carrinho montados pelo lojista, mas não um fluxo documentado para que o comprador acrescente um preço calculado do molde ao carrinho mantendo os componentes como linhas individuais.
- A Loja Integrada valida novamente os preços e disponibilidade ao avançar para checkout. Portanto, um total exibido apenas no montador não garante que o checkout cobrará esse valor.

## Abordagem proposta

1. Criar uma página de conteúdo nativa, inicialmente inativa, com uma região de montagem identificável.
2. Desenvolver um script pequeno, sem dependências externas, versionado neste repositório. Inserir no gerenciador de código da Loja Integrada no rodapé das páginas permitidas, com uma guarda de caminho para inicializar somente no montador.
3. Reconciliar composição, alternativas, SKUs, marcas, preços e disponibilidade com produtos reais da Loja Integrada depois de confirmar o catálogo/canal correto do Bling.
4. Manter o cálculo do preço no mecanismo interno de Vitrine/Admin. O navegador recebe somente o total comercial atualizado, sem valor do ajuste separado.
5. Acrescentar cada componente ao carrinho pelo fluxo nativo somente se o total final do carrinho aceitar o ajuste oculto e continuar identificando os produtos individuais.
6. Manter o checkout nativo e preservar Pagamento na Entrega.

### Gate obrigatório de preço e carrinho

A implementação só atende ao objetivo se o total exibido no montador for igual ao valor cobrado pelo carrinho/checkout, incluindo **um único ajuste oculto fixo por cesta**, e se os SKUs/componentes individuais continuarem corretamente identificados para o Bling.

Esse mecanismo ainda não foi confirmado. A simples inserção dos itens pelo formulário nativo tende a somar seus preços de catálogo e pode deixar o ajuste fixo fora do total. Não será exibido um total fictício no montador enquanto o carrinho cobrar outro valor.

Se não houver uma forma compatível com o carrinho nativo, interromper a integração de preço e trazer o conflito para decisão. Não contornar com ajuste condicional, preço fictício, alteração massiva de catálogo, linha de ajuste exposta, checkout externo ou API não documentada.

## Comportamento proposto

- Seleção de um dos cinco modelos e carregamento de suas quantidades-base.
- Troca de marcas apenas por opções equivalentes aprovadas e disponíveis.
- Aumento/redução de quantidades respeitando estoque atual; impedir quantidades negativas e acima da disponibilidade.
- Remoção de itens opcionais e restauração da composição-base.
- Inclusão de extras somente por ação explícita.
- Resumo com nomes/marcas e quantidades, sem preços individuais; o total comercial é recalculado a cada alteração, mantendo um ajuste fixo por cesta.
- Mensagens claras para estado vazio, indisponibilidade, erro ao carregar a cesta e falha ao adicionar ao carrinho.

## Plano de validação

1. Reconciliar os cinco moldes e seus valores fixos com os produtos reais da Loja Integrada depois de confirmar o canal correto do Bling.
2. Com produto real sincronizado, adicionar uma linha ao carrinho pelo mecanismo nativo e observar total e SKU.
3. Validar modelo padrão, substituição de marca, quantidade, remoção e extra; comparar total do montador com carrinho/checkout.
4. Confirmar que o cálculo aplica somente um ajuste fixo por cesta, sem adicional condicional ou qualquer outro segundo ajuste.
5. Conferir que preço individual e valor do ajuste não aparecem separados ao cliente e que o pedido mantém os componentes/SKUs esperados pelo Bling.
6. Abrir checkout para leitura e confirmar comportamento nativo e Pagamento na Entrega. Não enviar pedido, iniciar pagamento nem emitir NF-e.
7. Manter a loja em manutenção e a página do montador inativa até aprovação; DNS e domínio permanecem inalterados.

## Limitações e riscos conhecidos

- Não há produtos na Loja Integrada hoje; preço, disponibilidade, substituições, carrinho e checkout não podem ser testados de ponta a ponta.
- A identidade do canal/conta do Bling e a origem dos 178 produtos vistos pela ponte antiga continuam sem confirmação. A ponte/token não será usada para escrita.
- O carrinho pode recalcular o total somente pelos preços atuais dos componentes individuais e não cobrar o ajuste fixo; este é o gate principal.
- Alterações de código podem afetar o tema e não têm suporte de código pela Loja Integrada. O script deve carregar somente na página do montador.
- O checkout não aceita personalização por esses trechos de código.

## Fora do escopo

Trocar tema, ativar a loja, mudar DNS/domínio, publicar preços inventados, cadastrar produtos fictícios, alterar estoque ou configuração do Bling, criar pedidos de teste, executar pagamento, emitir NF-e ou modificar a PR #1357.
