# Cadastro IA de produtos V3 — ambiente separado

Esta aplicação é independente do admin. Nenhum arquivo de `producao/` é alterado.

## Arquivos

- `index.html`: aplicação mobile de teste.
- `cadastro-produtos-4-fotos-make-v3.blueprint.json`: cenário exclusivo para importar no Make.

## Destinos usados

- Cadastro e atualização de produtos: Firebase `/produtos/{firebaseKey}`.
- Acompanhamento temporário: Firebase `/cadastros_ia_jobs/{jobId}`.
- Imagem final: GitHub `site/img/produtos_3/{bucket}/{ano}/{mes}/arquivo.webp`.
- As quatro fotos originais não são salvas no GitHub.
- A aplicação não altera `site/produtos.json`.

## Instalar o cenário no Make

1. Crie um cenário vazio e importe `cadastro-produtos-4-fotos-make-v3.blueprint.json`.
2. O módulo 1 já aponta para o webhook `Cadastro Produto 4 Fotos V3`. Apenas confirme que ele permanece selecionado após a importação.
3. No módulo 3, informe somente um token **novo** do GitHub com acesso ao repositório `osvaldosereia/SUCEDOAN12`.
4. Não reutilize o token que estava no blueprint antigo anexado. Revogue-o no GitHub antes de iniciar os testes.
5. Os módulos 6, 9 e 12 já usam a conexão nativa da OpenAI configurada no Make. Não é necessário cadastrar uma chave manual no cenário.
6. No módulo 12, mantenha `gpt-image-1.5`.
7. Salve o cenário, use **Run once** e deixe-o ativo depois do primeiro teste.

O módulo 10 utiliza Make Code. Se a conta do Make não possuir esse aplicativo, o cenário não será executado e precisará ser adaptado para módulos nativos.

## Configurar a aplicação

1. Abra a aplicação pelo endereço HTTPS do site.
2. Toque na engrenagem.
3. Confirme:
   - Firebase: `https://cedar-chemist-310801-default-rtdb.firebaseio.com`
   - nó: `produtos`
   - webhook já salvo: `https://hook.eu1.make.com/nc3k6i1t24d2ivywdrpphrhm3ij5871e`
4. Salve.

## Funcionamento

### Produto existente

1. Leia ou digite o EAN.
2. A aplicação consulta a chave direta, `gtin` e `codigo`.
3. Se houver EAN duplicado, escolha o produto correto.
4. Edite o cadastro essencial.
5. O botão salvar executa `PATCH` apenas naquele produto em `/produtos`.

### Produto novo

1. Tire as fotos de frente, EAN e validade.
2. Tire a foto de informações ou marque **Não tem**.
3. Informe categoria, subcategoria, custo, preço, fornecedor e estoque.
4. O Make lê as imagens, pesquisa SEO e NCM e gera a imagem final.
5. A imagem final é salva no GitHub.
6. O produto é salvo exclusivamente no Firebase `/produtos` com `situacao: "I"`.
7. A aplicação abre o cadastro completo para conferência e correção.

## Campos essenciais gravados

`nome`, `descricao`, `descricao_curta`, `validade`, `gtin`, `ncm`, `categoria`, `subcategoria`, `marca`, `embalagem`, `preco_custo`, `preco`, `fornecedor`, `tags`, `estoque`, `gondola`, `prateleira`, campos de imagem e auditoria da IA.

Quando a confiança do NCM estiver abaixo de 85%, `ncm` fica vazio e a sugestão é guardada em `ncm_sugerido` para revisão.

## Teste recomendado

1. Primeiro, pesquise um EAN já cadastrado e confirme que a edição afeta somente o produto escolhido.
2. Depois, use um produto novo com custo e preço de teste.
3. Confira a execução módulo a módulo no Make.
4. Confirme a imagem no GitHub e o registro em `/produtos/{firebaseKey}`.
5. Revise NCM, validade, preço, custo e fornecedor antes de ativar o produto.

## Segurança

As chaves da OpenAI e do GitHub ficam somente no Make. Nunca devem ser colocadas no HTML. A rota deve ser usada somente por funcionários e as regras do Firebase devem restringir escrita administrativa antes da publicação definitiva.
