# Novo site Dona Antônia — roteiro técnico completo

## 1. Objetivo do projeto

Construir uma nova loja virtual da Dona Antônia do zero, sem copiar a estrutura, os componentes ou a lógica do site atual. O novo projeto deve preservar apenas os contratos de dados e as integrações necessárias para continuar vendendo.

A nova aplicação será mantida inicialmente em um único arquivo `index.html`, com HTML, CSS e JavaScript juntos. Essa decisão facilita manutenção manual, publicação e testes. O código interno, porém, será organizado por seções e funções pequenas, evitando um arquivo confuso.

Prioridades, nesta ordem:

1. pedido simples e confiável pelo WhatsApp;
2. carregamento rápido no celular;
3. catálogo sempre disponível, mesmo quando uma fonte falhar;
4. carrinho e checkout sem cadastro obrigatório;
5. compatibilidade com Firebase, Make e Bling;
6. facilidade para editar configurações e aparência;
7. SEO local para Cuiabá e Várzea Grande;
8. evolução por fases sem alterar o site de produção antes da aprovação.

---

## 2. Regras fundamentais

- O projeto novo ficará isolado em `/site-do-zero/`.
- O `index.html` da raiz não será alterado durante a construção.
- Nenhum trecho de JavaScript, CSS ou HTML antigo será copiado.
- Os dados existentes poderão continuar sendo consumidos, porque produtos, cestas, kits, cupons e pedidos precisam manter compatibilidade operacional.
- O WhatsApp é o canal principal. Firebase e Make são integrações secundárias e não podem impedir a abertura do WhatsApp.
- Toda operação crítica deve apresentar uma mensagem clara ao usuário.
- O site deve continuar utilizável quando uma imagem falhar, um endpoint estiver lento ou a internet oscilar.
- O código deve funcionar sem biblioteca visual, framework ou processo de compilação.
- As dependências externas devem ser reduzidas ao mínimo.

---

## 3. Arquitetura do HTML único

O arquivo será dividido internamente nesta ordem:

1. metadados, SEO e dados estruturados;
2. variáveis visuais em CSS;
3. estilos básicos e responsivos;
4. estrutura fixa da página;
5. configurações editáveis;
6. utilitários;
7. camada de dados;
8. normalização dos registros;
9. estado central da aplicação;
10. roteador;
11. catálogo e busca;
12. carrinho, favoritos e preços;
13. cestas e kits;
14. checkout;
15. WhatsApp;
16. Firebase e Make;
17. renderização;
18. eventos;
19. inicialização;
20. diagnóstico e tratamento de erros.

Mesmo em um único arquivo, cada bloco terá um cabeçalho grande e funções com responsabilidade única.

---

## 4. Configurações editáveis

No começo do JavaScript haverá um único objeto `CONFIG`, reunindo tudo que pode mudar:

- nome da loja;
- URL oficial;
- telefone do WhatsApp;
- pedido mínimo;
- cidades atendidas;
- horário limite para entrega no mesmo dia;
- número de dias mostrados no agendamento;
- caminhos dos arquivos JSON;
- URL do Firebase;
- webhook de pedidos do Make;
- webhook de consulta de cliente;
- regras de desconto;
- chave e versão do cache;
- recursos habilitados ou desabilitados;
- modo de teste e modo de produção.

O modo de teste deve abrir o WhatsApp normalmente, mas não gravar pedidos reais no Firebase ou Make até a integração ser ativada conscientemente.

---

## 5. Fontes de dados e tolerância a falhas

### 5.1 Produtos

O carregamento deverá testar fontes em sequência:

1. catálogo rápido publicado no GitHub;
2. catálogo completo publicado no GitHub;
3. Firebase Realtime Database;
4. último catálogo válido salvo no navegador.

Um arquivo vazio, inválido ou sem produtos não poderá ser considerado sucesso.

### 5.2 Recursos independentes

Cestas, kits, cupons e banners serão carregados separadamente. A falha de um desses arquivos não poderá derrubar os produtos.

### 5.3 Cache

- catálogo válido salvo em `localStorage`;
- versão registrada junto com a data de atualização;
- conteúdo antigo exibido imediatamente;
- atualização em segundo plano;
- substituição do cache somente depois da validação do novo conteúdo;
- botão de tentar novamente quando nenhuma fonte funcionar.

### 5.4 Validação mínima de produto

Um produto válido precisa ter:

- identificador;
- nome;
- preço maior que zero;
- situação ativa;
- estoque maior que zero para ficar comprável.

Produtos incompletos podem aparecer como indisponíveis para diagnóstico, mas não entram no carrinho.

---

## 6. Contrato normalizado de produto

Independentemente do nome original dos campos, o site trabalhará internamente com:

```text
id
firebaseKey
codigo
nome
slug
preco
precoOriginal
precoOferta
validadeOferta
estoque
situacao
categoria
subcategoria
subsubcategoria
marca
embalagem
descricao
gtin
ean
validade
gondola
prateleira
localizacao
imagens[]
imagemPrincipal
```

A normalização deve aceitar variações como `nome`/`name`, `preco`/`price`, `url_imagem`/`imagem` e `gtin`/`ean`.

---

## 7. Páginas e rotas

A aplicação será uma SPA leve, baseada em hash, para funcionar em hospedagem estática sem configuração de servidor.

Rotas previstas:

- `#/` — início;
- `#/ofertas` — produtos em oferta;
- `#/categorias` — lista de categorias;
- `#/categoria/{slug}` — produtos da categoria;
- `#/subcategoria/{slug}`;
- `#/marca/{slug}`;
- `#/busca/{termo}`;
- `#/produto/{referencia}` — página individual;
- `#/favoritos`;
- `#/cestas`;
- `#/cesta/{referencia}`;
- `#/kits`;
- `#/kit/{referencia}`;
- `#/checkout`;
- `#/informacoes`.

Cada mudança de rota deve:

1. atualizar o conteúdo sem recarregar a página;
2. fechar menus e modais abertos;
3. rolar para o início;
4. atualizar o título do navegador;
5. manter o carrinho;
6. permitir voltar pelo navegador.

---

## 8. Estrutura visual

### 8.1 Cabeçalho

- logo;
- nome da loja;
- campo de busca;
- acesso aos favoritos;
- acesso ao carrinho;
- menu hambúrguer;
- valor e quantidade do carrinho.

### 8.2 Navegação móvel

Barra fixa inferior com:

- Início;
- Categorias;
- Ofertas;
- Favoritos;
- Compra.

### 8.3 Desktop

- conteúdo centralizado;
- largura máxima controlada;
- quatro cards por linha como padrão;
- seis colunas somente em áreas compactas apropriadas;
- carrinho em painel lateral;
- sem barras de rolagem internas desnecessárias.

### 8.4 Mobile

- interface operável com uma mão;
- botões com pelo menos 44 px;
- cards em duas colunas;
- imagens quadradas;
- texto sem sobrepor imagens;
- barra inferior respeitando a área segura do aparelho;
- checkout em tela completa.

---

## 9. Página inicial

Ordem inicial proposta:

1. aviso operacional curto;
2. vantagens da compra;
3. ofertas de hoje;
4. cestas básicas;
5. essenciais da compra do mês;
6. categorias;
7. kits promocionais;
8. escolhidos para você;
9. marcas mais procuradas;
10. aqui tem;
11. informações de entrega e pagamento;
12. rodapé.

Cada seção deve ser renderizada apenas se tiver conteúdo válido.

No desktop, produtos comuns usam grade. No celular, algumas seções podem usar rolagem horizontal controlada. Banners são tratados como conteúdo independente e nunca podem deslocar ou quebrar os cards.

---

## 10. Cards de produto

Cada card terá:

- imagem quadrada;
- embalagem;
- nome;
- validade, quando houver;
- preço original riscado, quando houver desconto;
- preço atual;
- percentual de desconto;
- botão de favorito;
- botão “Adicionar”;
- seletor de quantidade após a primeira adição;
- indicação de indisponível;
- aviso discreto de desconto por quantidade.

A imagem terá `loading="lazy"`, dimensões declaradas e fallback. Somente as primeiras imagens visíveis serão prioritárias.

---

## 11. Busca

A busca deve aceitar:

- nome;
- marca;
- categoria;
- subcategoria;
- código interno;
- EAN/GTIN;
- palavras sem acento;
- múltiplas palavras em qualquer ordem.

Regras:

- não reconstruir o campo a cada tecla;
- não apagar espaços digitados;
- aplicar atraso curto de aproximadamente 180 ms;
- priorizar código exato, nome iniciado pelo termo e depois palavras contidas;
- mostrar quantidade de resultados;
- manter o termo ao abrir e voltar de um produto.

---

## 12. Página individual de produto

Deve mostrar:

- até três imagens;
- nome completo;
- embalagem;
- marca;
- código e EAN quando úteis;
- preço e oferta;
- validade;
- estoque disponível;
- seletor de quantidade;
- descrição;
- categoria e subcategoria;
- produtos relacionados;
- botão de contato pelo WhatsApp;
- aviso de pagamento na entrega.

O produto deve ser localizado por Firebase key, ID, código, EAN ou slug.

---

## 13. Carrinho

O carrinho será salvo no navegador e terá validade configurável.

Funções:

- adicionar;
- aumentar;
- diminuir;
- remover;
- limpar;
- respeitar estoque;
- manter ordem de adição;
- recalcular valores imediatamente;
- mostrar pedido mínimo;
- mostrar descontos separados;
- preservar cestas e kits;
- expirar carrinhos antigos para evitar pedido com preço ultrapassado.

Nunca confiar apenas no preço salvo. Ao abrir o checkout, os itens devem ser reconciliados com o catálogo atual.

---

## 14. Preços e descontos

A ordem de cálculo será explícita e testável:

1. preço normal;
2. oferta ativa e dentro da validade;
3. cupom aplicável;
4. desconto por validade e quantidade;
5. desconto de atacado;
6. ajuste fixo de cesta;
7. ajuste de kit;
8. arredondamento monetário;
9. total final.

Toda diferença entre a soma dos itens e o total final deve ser enviada ao Make de forma compatível com os campos de desconto ou outras despesas usados no Bling.

---

## 15. Cestas básicas

Cada cesta terá:

- id;
- código;
- nome;
- imagem;
- descrição;
- preço de referência;
- lista de produtos com quantidade;
- substitutos opcionais.

Fluxo:

1. abrir a cesta;
2. resolver cada código contra o catálogo;
3. mostrar os produtos;
4. permitir ajustar quantidades quando a cesta for personalizável;
5. informar itens indisponíveis;
6. recalcular o valor;
7. adicionar todos os itens ao carrinho;
8. registrar no carrinho que vieram de uma cesta;
9. informar alterações na mensagem do WhatsApp e no pedido.

A cesta não deve ser adicionada quando faltar produto obrigatório sem substituto disponível.

---

## 16. Kits promocionais

Cada kit terá:

- período de início e fim;
- preço promocional;
- preço original calculado;
- composição fixa;
- limite manual;
- estoque calculado pelo produto mais limitante;
- percentual de desconto;
- status ativo.

O kit só aparece quando:

- estiver ativo;
- estiver dentro do período;
- todos os produtos estiverem disponíveis;
- houver capacidade de estoque;
- o valor representar promoção válida.

Ao adicionar, os itens entram individualmente e um ajuste registra o preço final do kit.

---

## 17. Cupons

O sistema deverá suportar:

- percentual;
- valor fixo;
- pedido mínimo;
- validade;
- categorias;
- marcas;
- palavras-chave;
- cliente novo;
- ativação e remoção;
- mensagem clara de motivo quando inválido.

A consulta do CPF não pode ser obrigatória para navegar, mas pode ser exigida na finalização e usada para validar cupom de primeira compra.

---

## 18. Favoritos e personalização

Favoritos ficarão no `localStorage`.

A personalização deverá ser opcional e baseada somente em:

- produtos vistos;
- categorias visitadas;
- favoritos;
- itens adicionados;
- pedidos concluídos.

Dados pessoais como nome, CPF, telefone e endereço não entram no perfil de recomendação.

O usuário poderá ativar, desativar e apagar o histórico.

---

## 19. Checkout

O checkout será curto, sem criação de conta.

Etapas:

1. revisar itens;
2. revisar valores;
3. cupom;
4. CPF e busca opcional de cadastro;
5. escolher data de entrega;
6. preencher dados;
7. escolher pagamento;
8. confirmar e abrir WhatsApp.

Campos:

- nome completo;
- CPF;
- WhatsApp;
- e-mail;
- CEP;
- cidade;
- bairro;
- rua/avenida;
- quadra;
- número;
- referência;
- data de entrega;
- pagamento;
- observações.

Cidades aceitas inicialmente: Cuiabá e Várzea Grande.

Pagamentos:

- dinheiro;
- Pix;
- cartão de débito;
- cartão de crédito;
- vale-alimentação;
- vale-refeição.

As próximas datas devem excluir domingos e feriados nacionais configurados. Entrega para o mesmo dia respeita o horário limite.

---

## 20. Envio pelo WhatsApp

A mensagem deverá conter:

- número local do pedido;
- data de entrega;
- itens e quantidades;
- indicação de cesta ou kit;
- itens alterados ou retirados de cesta;
- valor normal;
- descontos separados;
- total final;
- nome;
- telefone;
- endereço;
- referência;
- pagamento;
- pedido de confirmação.

Regra crítica: o link do WhatsApp deve ser aberto pela ação direta do clique do usuário. Processos de rede não podem bloquear a abertura.

Fluxo recomendado:

1. validar o formulário;
2. construir o pedido e a mensagem;
3. salvar uma cópia local;
4. abrir o WhatsApp imediatamente;
5. tentar Firebase e Make em seguida;
6. manter uma fila local quando a internet falhar;
7. não duplicar pedidos graças à chave de idempotência.

---

## 21. Pedido para Firebase

Estrutura mínima:

```text
/pedidos/{id}
  id
  numero_pedido
  idempotency_key
  origem
  status
  status_separacao
  criado_em
  atualizado_em
  cliente
  entrega
  pagamento
  itens[]
  cupom
  kitPromocional
  atacado
  validadeQuantidade
  separacao
  envio
  bling
  integracao
  historico[]
```

Cada item deve enviar código, Firebase key, EAN, nome, quantidade, preço, imagem, categoria, gôndola e prateleira para suportar separação e conferência.

---

## 22. Pedido para Make e Bling

O payload manterá:

- `pedido.id`;
- `pedido.numero`;
- `pedido.idempotencyKey`;
- `pedido.itens[]`;
- total;
- total dos produtos;
- desconto;
- outras despesas;
- dados do cliente;
- endereço;
- agendamento;
- pagamento;
- metadados da versão do site e catálogo.

Requisitos operacionais:

- uma única venda com todos os itens;
- contato criado ou atualizado antes da venda;
- nome nunca vazio;
- prevenção de venda idêntica;
- controle de até três requisições por segundo ao Bling;
- novas tentativas com espera;
- log do erro no pedido;
- confirmação do ID da venda no Firebase.

---

## 23. Banners

Os banners serão implementados depois do catálogo e checkout estarem estáveis.

Regras:

- formato vertical igual à proporção dos cards;
- até oito por posicionamento;
- rotação da ordem a cada acesso;
- período de início e fim;
- ativo/inativo;
- destino por produto, categoria, subcategoria, marca, kit ou cesta;
- remoção visual quando produto estiver sem estoque ou oferta estiver vencida;
- carregamento depois do conteúdo crítico;
- falha de banner nunca afeta produtos.

---

## 24. Desempenho

Metas técnicas:

- HTML inicial pequeno e sem framework;
- conteúdo principal visível rapidamente;
- CSS crítico no próprio arquivo;
- uma leitura de catálogo por inicialização;
- busca e filtros sobre índices em memória;
- imagens AVIF/WebP quando disponíveis;
- dimensões fixas para evitar salto de tela;
- `loading="lazy"` fora da primeira dobra;
- nenhum carrossel pesado de terceiros;
- eventos delegados;
- renderização em lotes;
- limite inicial de cards e carregamento progressivo;
- cache validado;
- ausência de service worker na primeira versão.

---

## 25. Acessibilidade e usabilidade

- contraste adequado;
- navegação por teclado;
- foco visível;
- `aria-label` em botões de ícone;
- textos de erro associados aos campos;
- botões grandes;
- nenhum fechamento inesperado ao digitar;
- confirmação de ações importantes;
- carregamento, vazio e erro com mensagens diferentes;
- suporte a zoom;
- respeito a `prefers-reduced-motion`.

---

## 26. SEO local

- título e descrição por rota;
- canonical;
- Open Graph;
- dados estruturados de `OnlineStore`, `Product`, `Offer`, `ItemList` e `BreadcrumbList`;
- texto natural sobre delivery em Cuiabá e Várzea Grande;
- URLs compartilháveis;
- nome, preço, imagem, disponibilidade e validade da oferta na página do produto;
- páginas específicas para cestas e kits.

Como o projeto usa hash durante o desenvolvimento, a publicação final deverá manter páginas auxiliares ou geração estática para produtos e coleções que precisem de indexação completa.

---

## 27. Segurança e privacidade

- nunca incluir segredo administrativo no HTML;
- Firebase público limitado ao necessário pelas regras;
- sanitizar toda string antes de inserir no HTML;
- validar URLs de imagem e links;
- não executar HTML vindo do catálogo;
- limitar tamanho de respostas;
- timeout de rede;
- não registrar CPF ou endereço no console;
- consentimento para personalização;
- links visíveis para política de privacidade e termos.

---

## 28. Diagnóstico

O modo de diagnóstico deverá mostrar somente quando ativado por configuração:

- versão do app;
- fonte do catálogo;
- quantidade de produtos;
- quantidade disponível;
- tempo de carregamento;
- status de cestas, kits, cupons e banners;
- itens inválidos descartados;
- erros de rede sem dados pessoais.

---

## 29. Plano de programação por fases

### Fase 0 — isolamento e documentação

- criar pasta separada;
- criar este roteiro;
- criar branch exclusiva;
- não alterar produção.

### Fase 1 — fundação funcional

- HTML único;
- layout responsivo;
- configuração central;
- carregamento com fallback;
- normalização de produtos;
- home simples;
- busca;
- categorias;
- página de produto;
- carrinho local;
- checkout básico;
- mensagem e abertura do WhatsApp;
- dados de demonstração quando nenhuma fonte responder.

### Fase 2 — catálogo comercial completo

- ofertas;
- validade;
- favoritos;
- filtros;
- marcas;
- produtos relacionados;
- paginação progressiva;
- reconciliação de carrinho e estoque.

### Fase 3 — cestas, kits e cupons

- composição e substitutos;
- personalização de cesta;
- preço fixo e ajustes;
- capacidade de kit;
- cupons e primeira compra;
- mensagem detalhada de cesta/kit.

### Fase 4 — checkout definitivo e integrações

- busca de cliente;
- calendário de entrega;
- máscaras e validações;
- payload definitivo;
- Firebase;
- fila local;
- Make;
- idempotência;
- confirmação da integração.

### Fase 5 — conteúdo, banners e personalização

- banners inteligentes;
- seções da home;
- escolhidos para você;
- consentimento;
- histórico local;
- páginas informativas.

### Fase 6 — desempenho, SEO e testes

- auditoria de carregamento;
- auditoria mobile;
- acessibilidade;
- dados estruturados;
- páginas indexáveis;
- testes de falha;
- testes de pedido;
- comparação controlada com produção.

### Fase 7 — publicação gradual

- publicar em URL de teste;
- validar pedidos reais controlados;
- monitorar Firebase e Make;
- corrigir divergências;
- congelar alterações no site antigo;
- trocar a raiz somente depois da aprovação;
- manter rollback imediato.

---

## 30. Testes de aceitação

O projeto não estará pronto para substituir a produção até passar por todos estes testes:

1. abre em Android, iPhone, iPad e desktop;
2. primeira tela não pula durante carregamento;
3. catálogo aparece com conexão rápida, lenta e oscilante;
4. catálogo em cache aparece sem internet;
5. arquivo de catálogo vazio aciona outra fonte;
6. imagens quebradas usam fallback;
7. busca aceita espaço e acento;
8. produto abre por ID, código, EAN e slug;
9. carrinho respeita estoque;
10. carrinho sobrevive ao recarregamento;
11. oferta vencida não é aplicada;
12. total coincide com os itens e ajustes;
13. pedido mínimo é respeitado;
14. cesta padrão adiciona composição correta;
15. cesta alterada é descrita corretamente;
16. kit respeita estoque e período;
17. cupom válido e inválido geram respostas corretas;
18. checkout informa todos os campos pendentes;
19. WhatsApp abre com a mensagem completa;
20. WhatsApp abre mesmo quando Firebase ou Make falham;
21. pedido não é duplicado ao recarregar;
22. Firebase recebe todos os dados de separação;
23. Make recebe o contrato esperado;
24. Bling recebe uma venda com todos os itens;
25. voltar do navegador preserva a navegação;
26. barra inferior não cobre o fim da página;
27. o site continua utilizável sem banners;
28. nenhuma informação pessoal aparece em logs públicos;
29. produção permanece intacta até a aprovação;
30. rollback foi testado.

---

## 31. Critério de conclusão

O novo site será considerado concluído quando for mais simples que o atual, carregar de forma previsível, permitir localizar produtos rapidamente, calcular corretamente a compra, abrir o WhatsApp sem bloqueio e registrar o mesmo pedido nas integrações sem duplicidade.

A simplicidade será medida pela experiência do cliente e pela facilidade de manutenção, não apenas pela quantidade de arquivos.