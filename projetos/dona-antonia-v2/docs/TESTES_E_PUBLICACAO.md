# Plano de verificação antes de qualquer publicação

## Bling e catálogo
- [ ] CSV de 802 produtos com 59 campos oficiais passa no importador; SKUs exclusivos.
- [ ] Uma unidade de venda por SKU (UN), sem gerar SKU de fardo/caixa.
- [ ] O EAN da unidade e o DUN da caixa permanecem ligados ao SKU correto.
- [ ] Nenhum produto inativo, zerado, vencido ou sem preço aparece disponível.
- [ ] Preços/custos em centavos e classificação fiscal só vêm do cadastro autorizado.
- [ ] Um evento repetido do Bling não duplica produtos nem altera uma cesta.

## Admin
- [ ] Criar/editar um tipo e associar múltiplos SKUs, inclusive marcas diferentes.
- [ ] Remover um SKU de um tipo não o exclui do catálogo.
- [ ] Cada tamanho possui seus próprios tipos, quantidades e ordem.
- [ ] Não permitir tipo duplicado no mesmo tamanho.
- [ ] Produtos de sabor/aroma continuam independentes; sem produto-pai.
- [ ] Edição de estoques e status registra auditoria e exige permissão.

## Site
- [ ] Abrir qualquer um dos cinco tamanhos.
- [ ] Mostrar primeiro a opção vendável mais barata para cada tipo.
- [ ] Trocar arroz por outro arroz altera preço, mantendo tipo e quantidade.
- [ ] Quantidade +/− altera totais imediatamente, sem recarregar página.
- [ ] Remover tipo zera quantidade; restaurar volta a permitir escolha.
- [ ] Produto esgotado no checkout não é confirmado silenciosamente.
- [ ] Pagamento/entrega seguem regras operacionais e são validados no servidor.
- [ ] Pedido repetido via clique duplo/rede instável não duplica venda.
- [ ] Funciona em celular básico, internet fraca e teclado/acessibilidade.

## Homologação, isolamento e custos
- [ ] Deploy de produção atual não lê arquivos da pasta projetos/dona-antonia-v2.
- [ ] CI testa somente o projeto novo, sem workers permanentes.
- [ ] SQL novo executado em homologação separada; nenhuma migração na base antiga.
- [ ] Erro de API Bling não perde pedido e usa retentativa com limite.
- [ ] Plano de rollback preserva pedidos e site atual.
- [ ] Aprovação explícita antes de trocar o domínio.
