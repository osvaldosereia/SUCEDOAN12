# Cestas/Kits: montagem guiada por termos, carrosséis e reserva de estoque

## Objetivo

Transformar a criação e manutenção de **Cestas e Kits** no Vitrine/Admin em um fluxo operacional simples: primeiro a operação define os termos/famílias que compõem o modelo (por exemplo `Arroz`, `Feijão`, `Óleo`, `Açúcar`), depois cada termo vira um carrossel de produtos compatíveis para seleção, quantidade por cesta/kit e, por fim, criação de um lote real com reserva explícita de estoque.

O fluxo deve reaproveitar o modelo canônico atual de Cestas/Kits, lotes, famílias de substituição, estoque avulso, estoque reservado, preço oculto, impressão e histórico. Não deve criar um segundo sistema paralelo.

## Princípios

1. **Uma entidade comercial única.** `basket_templates` continua sendo a fonte comercial de Cestas/Kits. `basket_kit_templates` representa a composição operacional interna, nunca uma segunda entidade comercial pública.
2. **Modelo não reserva estoque.** Definir termos, escolher produtos e editar a composição-base não reduz o estoque avulso.
3. **Lote operacional reserva estoque.** A reserva nasce somente quando o usuário confirma `Criar lote / reservar` para uma quantidade concreta de cestas/kits.
4. **Montagem física e venda são estados diferentes.** Reservar um lote não significa que ele já está fisicamente montado; marcar como montado também não significa publicar automaticamente no site.
5. **Histórico é imutável.** Alterações no modelo afetam somente lotes futuros. Lotes já montados/consumidos e pedidos passados preservam sua composição histórica.
6. **Famílias explícitas prevalecem sobre busca textual.** Termos como `Arroz` devem reutilizar o catálogo de famílias/sugestões já existente quando houver família configurada; busca textual é fallback para localizar produtos ainda não associados.
7. **Sem estoque, sem reserva.** O sistema nunca confirma um lote cuja necessidade total ultrapasse o estoque avulso disponível de qualquer componente.
8. **Sem publicação automática.** Criar ou montar lote não ativa venda automaticamente.

## Fluxo principal

### 1. Criar ou editar o modelo comercial

A ação `Nova Cesta/Kit` deve pedir somente os dados comerciais essenciais:

- nome público;
- categoria oficial;
- imagem;
- preço final da cesta/kit;
- observação interna opcional;
- estado ativo/inativo do modelo.

Categorias oficiais permanecem:

- Cestas Completas;
- Cestas Só Alimento;
- Kits Limpeza e Higiene;
- Kits Limpeza;
- Kits Higiene.

Após salvar os dados básicos, o usuário entra na etapa de composição guiada.

### 2. Definir termos/famílias da composição

O editor deve possuir uma área `Itens da cesta/kit` com entrada rápida para termos separados, por exemplo:

`Arroz` · `Feijão` · `Óleo` · `Açúcar` · `Macarrão`

Cada termo vira uma **posição persistente do modelo** e deve poder:

- ser adicionado;
- ser renomeado;
- ser removido quando ainda não houver dependência histórica;
- ser reordenado por arrastar ou controles simples;
- apontar para uma família configurada existente;
- usar busca textual quando não houver família configurada.

A associação termo → família deve ser explícita e reutilizável. Exemplo: o termo `Arroz` pode estar associado à família `arroz` já configurada em Sugestões de produtos.

### 3. Carrossel de produtos por termo

Cada termo aparece como uma faixa/carrossel independente, um abaixo do outro.

Exemplo visual conceitual:

- **ARROZ** → cards dos arrozes autorizados;
- **FEIJÃO** → cards dos feijões autorizados;
- **ÓLEO** → cards dos óleos autorizados.

Cada card deve mostrar, sem abrir o cadastro do produto:

- foto;
- nome;
- embalagem/peso;
- código interno;
- EAN/GTIN quando houver;
- preço de custo;
- preço de venda;
- estoque vendável total;
- quantidade já reservada em cestas/kits;
- estoque avulso disponível;
- status ativo/inativo;
- indicação clara `Sem estoque` quando aplicável.

Produtos sem estoque podem aparecer para referência, mas não podem ser selecionados para uma nova reserva.

### 4. Seleção e quantidade por cesta/kit

Ao clicar em um produto, ele se torna o produto principal daquela posição. O usuário informa a quantidade **por unidade de cesta/kit**.

Exemplo:

- Arroz Bonini 5 kg — `2 por cesta`;
- Feijão Carioca — `3 por cesta`;
- Óleo de soja 900 ml — `1 por cesta`.

Cada posição deve preservar as regras já existentes quando aplicáveis:

- produto principal;
- quantidade por cesta/kit;
- removível ou obrigatório;
- quantidade editável ou fixa;
- quantidade mínima e máxima;
- família de produtos substitutos/autorizados;
- ajustes comerciais por remoção/adição já suportados pelo modelo atual.

Um mesmo produto não deve aparecer duplicado em duas posições do mesmo modelo sem confirmação explícita da operação, porque isso altera a necessidade total de estoque.

### 5. Resumo financeiro do modelo

Durante a composição, uma faixa fixa deve mostrar em tempo real:

- custo somado dos produtos principais;
- soma dos preços de venda dos produtos;
- preço final definido da cesta/kit;
- valor oculto = preço final − soma comercial considerada pela regra vigente;
- quantidade de posições;
- alertas de produto inativo ou sem estoque.

A regra existente de **valor oculto** deve continuar sendo preservada. Alterar um produto no pedido público não elimina esse valor oculto quando o modelo/lote exigir sua manutenção.

## Criação do lote e reserva de estoque

### 6. Informar quantidade a montar

Depois de definir a composição, o usuário informa a quantidade do lote, por exemplo `10`.

Antes da confirmação, o sistema calcula a necessidade consolidada:

| Produto | Por cesta | Lote | Necessário | Avulso disponível | Saldo após reserva |
| --- | ---: | ---: | ---: | ---: | ---: |
| Arroz | 2 | 10 | 20 | 85 | 65 |
| Feijão | 3 | 10 | 30 | 54 | 24 |
| Óleo | 1 | 10 | 10 | 12 | 2 |

Se qualquer componente ficar negativo, a criação do lote deve ser bloqueada e o produto problemático deve aparecer destacado.

### 7. Momento exato da reserva

Existem três níveis distintos:

1. **Modelo em edição** — não reserva estoque.
2. **Prévia do lote** — ainda não reserva estoque; apenas simula necessidade.
3. **Lote confirmado em montagem** — reserva imediatamente a necessidade total dos componentes.

Portanto, clicar apenas em produtos ou salvar o modelo não reduz o avulso. A reserva ocorre na confirmação explícita `Criar lote / reservar`.

A reserva deve ser transacional: ou todos os componentes são reservados, ou nenhum é. Uma alteração de estoque concorrente entre a prévia e a confirmação exige nova validação antes do commit.

### 8. Estados operacionais do lote

A UI deve apresentar estados compreensíveis, sem expor detalhes técnicos desnecessários:

- **Em montagem** — lote real confirmado; estoque já reservado; ainda não declarado fisicamente pronto;
- **Montado** — montagem física confirmada; estoque continua reservado;
- **Pausado** — montado, mas venda desligada;
- **Esgotado** — quantidade disponível igual a zero;
- **Cancelado** — lote cancelado de forma segura e estoque remanescente devolvido ao avulso, quando permitido.

Internamente, a implementação pode mapear esses estados para os campos existentes ou introduzir o mínimo de estado adicional necessário. A UI não deve depender diretamente de nomes técnicos do banco.

### 9. Marcar como montado

`Marcar como montado` confirma que as unidades foram fisicamente separadas/montadas. Essa ação:

- não altera a composição;
- não reserva estoque novamente;
- não ativa o lote automaticamente no site;
- registra operador e horário;
- habilita impressão operacional do lote.

### 10. Ativar/Pausar venda

A publicação permanece uma ação separada:

- `Ativar venda` exige lote montado, quantidade > 0, modelo/categoria ativos e componentes válidos;
- `Pausar venda` retira o lote da vitrine sem devolver estoque ao avulso;
- esgotamento retira o lote da vitrine automaticamente pelo catálogo canônico.

## Reserva, consumo e devolução

O cálculo de estoque deve continuar distinguindo:

- estoque físico/vendável;
- estoque reservado em cestas/kits;
- estoque avulso disponível.

Ao confirmar um lote de `N` unidades, a reserva por produto é `quantidade_por_cesta × N`.

Quando unidades do lote forem consumidas por pedidos, a reserva correspondente continua representada pelo lote/alocação até a conclusão do fluxo existente de consumo de estoque. O motor não deve descontar duas vezes.

Ao cancelar ou reduzir um lote ainda elegível para edição, somente a quantidade efetivamente liberada retorna ao estoque avulso.

Nenhuma reversão é permitida quando houver pedido/alocação histórica que torne a operação destrutiva. A UI deve explicar o bloqueio.

## Edição de lote

Preservar as regras de segurança já existentes para reabrir/editar lotes.

Um lote sem uso histórico pode permitir edição de:

- nome público;
- valor;
- quantidade total;
- composição;
- vínculo com outro lote quando aplicável;
- observação.

Toda alteração que mude necessidade de componente deve executar uma operação atômica de **delta de reserva**:

- aumentar necessidade → valida e reserva somente a diferença;
- reduzir necessidade → libera somente a diferença;
- trocar produto → libera o antigo e reserva o novo na mesma transação.

Se a nova necessidade não puder ser atendida, nenhuma parte da edição deve ser persistida.

## Modelos, termos e lotes existentes

A implantação deve ser compatível com o histórico atual.

- Modelos existentes permanecem utilizáveis.
- Composição atual pode ser convertida em posições/termos sem alterar lotes históricos.
- Quando não for possível inferir uma família com segurança, criar uma posição com rótulo baseado no produto atual e manter o produto como principal, deixando a família para revisão humana.
- Lotes históricos não devem ser regravados.
- Lotes em edição/montados existentes devem manter suas regras de segurança e códigos.
- O kit legado `Kit Limpeza e Higiene` deve continuar sendo tratado dentro da entidade comercial unificada; não reintroduzir catálogo comercial paralelo baseado em `basket_kit_templates`.

A promoção de kits standalone legados para a entidade comercial única é pré-requisito lógico desta experiência. Se a implementação iniciar antes da migração específica já preparada para isso, o plano deve incorporar a promoção equivalente antes de liberar a nova tela.

## Funcionalidades existentes que devem permanecer

A nova UX não elimina as capacidades já construídas:

- criar e editar modelo;
- excluir/arquivar modelo com segurança;
- criar lote;
- duplicar lote;
- editar lote quando permitido;
- código curto de lote no formato de 2 letras + 1 número;
- nome público por lote;
- preço por lote;
- valor oculto;
- foto/imagem;
- composição com foto, nome e quantidade;
- `Ver composição`;
- `Marcar como montado`;
- ativar/pausar venda;
- impressão A4 com nome, código, valor, quantidade e produtos;
- histórico de lotes e pedidos;
- vínculo entre lotes quando aplicável;
- famílias/sugestões de substituição;
- estoque avulso versus estoque em cestas/kits.

## UX da página principal de Cestas/Kits

A página principal deve continuar leve e orientada à operação.

### Cabeçalho

Ações principais:

- `Nova Cesta/Kit`;
- `Categorias`;
- `Famílias/Sugestões`.

Filtros por categoria usam as categorias oficiais já cadastradas.

### Card do modelo

Cada modelo mostra somente informações operacionais importantes:

- imagem;
- nome;
- categoria;
- preço atual;
- estoque público disponível;
- lotes em montagem;
- lotes montados;
- estado de venda;
- ações `Editar`, `Novo lote`, `Duplicar`, `Ver lotes`.

Detalhes pesados devem ser carregados somente quando abertos.

### Editor guiado

O editor deve ser vertical e previsível:

1. dados comerciais;
2. termos/posições;
3. carrosséis dos produtos;
4. resumo financeiro;
5. criação/simulação do lote;
6. confirmação da reserva.

A interface deve funcionar bem em desktop e celular. No celular, cada carrossel pode usar scroll horizontal com cards grandes o suficiente para foto, estoque e seleção sem abrir modal.

## API e domínio

A implementação deve preservar os endpoints canônicos existentes quando possível e adicionar interfaces específicas somente onde a responsabilidade for nova.

Responsabilidades a separar:

1. **Catálogo de posições/famílias** — carregar termos e produtos elegíveis com estoque e dados comerciais.
2. **Persistência do modelo** — salvar dados comerciais e composição-base sem reservar estoque.
3. **Prévia do lote** — calcular necessidade consolidada e saldo previsto sem mutação.
4. **Confirmação do lote** — revalidar estoque e criar/reservar atomicamente.
5. **Alteração da reserva** — aplicar delta transacional em edição/cancelamento elegível.
6. **Publicação** — continuar usando disponibilidade canônica e `sale_enabled`, sem duplicar regra no frontend.

O frontend não deve recalcular estoque público ou disponibilidade final por conta própria; deve exibir valores retornados pelo backend/camadas canônicas.

## Concorrência e consistência

A confirmação de lote é operação de estoque e deve ser segura contra duas pessoas montando lotes ao mesmo tempo.

Requisitos:

- revalidar estoque no servidor durante a confirmação;
- bloquear/serializar os produtos envolvidos pelo menor escopo necessário durante a transação;
- nunca confiar somente na prévia mostrada no navegador;
- erro de concorrência deve retornar os produtos cuja disponibilidade mudou e permitir atualizar a tela;
- idempotência para evitar dupla reserva em repetição de requisição/recarregamento.

## Erros e mensagens

Erros devem ser traduzidos para mensagens operacionais, por exemplo:

- `Óleo Ypê: precisa de 10, mas há somente 7 avulsos.`
- `O estoque mudou enquanto o lote era criado. Revise os itens destacados.`
- `Este lote já possui pedido vinculado e não pode ter a composição alterada.`
- `Produto inativo: escolha outro item da família Arroz.`

Não mostrar códigos internos de erro como mensagem principal ao usuário.

## Auditoria

Registrar eventos relevantes com operador e horário:

- criação/edição de modelo;
- alteração de termo/família;
- criação de lote;
- confirmação da reserva;
- alteração de quantidade/composição;
- marcação como montado;
- ativação/pausa de venda;
- cancelamento/liberação de reserva;
- arquivamento de modelo.

## Testes obrigatórios

A implementação deve seguir TDD e possuir contratos/regressões para, no mínimo:

1. termo configurado carrega todos os produtos autorizados da família;
2. produto sem estoque aparece sinalizado e não pode ser selecionado para nova reserva;
3. modelo salvo não altera estoque avulso;
4. prévia do lote não altera estoque;
5. confirmar lote reserva exatamente `quantidade_por_cesta × quantidade_do_lote`;
6. lote com dois componentes reserva ambos atomicamente;
7. insuficiência em um componente faz rollback completo;
8. duas confirmações concorrentes não podem reservar o mesmo estoque além do disponível;
9. edição que aumenta quantidade reserva somente o delta;
10. edição que reduz quantidade libera somente o delta;
11. troca de produto faz liberação/reserva na mesma transação;
12. marcar como montado não duplica reserva;
13. ativar venda não duplica reserva;
14. pausar venda não libera reserva;
15. cancelamento elegível libera estoque remanescente;
16. lote com histórico de pedido bloqueia edição destrutiva;
17. valor oculto continua preservado;
18. impressão A4 continua disponível para lote montado;
19. catálogo público continua escondendo lote não montado, pausado, esgotado ou com regra canônica indisponível;
20. storefront raiz e `/vitrine` continuam com comportamento equivalente.

## Critérios de aceite

O trabalho está concluído quando a operação consegue, sem abrir cadastro de produto:

1. criar uma Cesta/Kit;
2. cadastrar os termos desejados;
3. ver um carrossel por termo;
4. escolher um produto por posição e sua quantidade;
5. enxergar estoque total, reservado e avulso;
6. informar quantas cestas/kits serão montados;
7. ver a necessidade consolidada antes de confirmar;
8. confirmar o lote e observar a reserva refletida no estoque;
9. marcar fisicamente o lote como montado;
10. imprimir o lote;
11. ativar ou pausar sua venda de forma independente;
12. editar/duplicar lotes dentro das regras de segurança;
13. manter pedidos/lotes históricos intactos.

## Fora de escopo

- criar um novo motor de catálogo público;
- substituir o motor de pedidos existente;
- alterar regras fiscais/Bling;
- automatizar escolha de marcas sem configuração humana;
- permitir reserva acima do estoque disponível;
- apagar fisicamente histórico de lotes ou pedidos;
- reintroduzir Make.com ou outro orquestrador para este fluxo.
