# Dona Antônia Operations 2.0 — PROJECT MASTER

> **Status:** Projeto Final Consolidado — pronto para homologação e posterior implementação por etapas.
> **Data:** 2026-09-25.
> **Regra:** este documento NÃO autoriza alteração de produção por si só. A implementação começa somente após aprovação explícita do usuário.

---

# 1. Visão do projeto

A Dona Antônia terá uma arquitetura simples, profissional e altamente automatizada, sem tentar reproduzir um ERP dentro do Supabase.

## Princípio central

**Bling executa o ERP.  
Dona Antônia executa as regras próprias do negócio.  
PapoAI cuida do canal WhatsApp.  
OpenAI/ChatGPT supervisiona e explica.  
Funcionário atua principalmente no mundo físico.**

## Objetivos

1. reduzir ao mínimo os cliques dos funcionários;
2. eliminar duplicidade de fontes de verdade;
3. usar recursos nativos do Bling antes de programar equivalentes;
4. manter o site rápido;
5. suportar pedidos pelo site e WhatsApp;
6. automatizar aprovação, reserva, impressão, sincronização, fiscal e pós-venda onde seguro;
7. manter supervisão humana clara pela Control Tower;
8. manter trilha de auditoria;
9. evitar crons, polling, Edge Functions e tabelas sem necessidade;
10. permitir evolução futura sem perder contexto.

---

# 2. Escopo operacional real

A empresa possui:
- uma operação física;
- delivery próprio;
- atendimento Cuiabá e Várzea Grande;
- site + WhatsApp;
- 1–2 carros;
- dois tablets internos;
- leitores EAN;
- impressão térmica;
- pagamento na entrega;
- sem multi-loja;
- sem PDV de balcão;
- sem marketplace.

Não será construído:
- WMS completo;
- sistema de frota;
- CRM paralelo;
- ERP paralelo;
- data lake;
- microserviço por módulo;
- multi-filial;
- ordem de produção;
- gestão de comissão.

---

# 3. Arquitetura final

## 3.1 Site Dona Antônia
Responsabilidades:
- catálogo;
- cestas;
- ofertas;
- carrinho;
- checkout;
- identificação do cliente;
- regras de cidade;
- pedido mínimo;
- experiência mobile;
- histórico amigável;
- preço comercial.

Não será fonte oficial de:
- estoque físico;
- fiscal;
- financeiro;
- fornecedor;
- compra.

## 3.2 Vitrine/Admin
Será reduzido a poucas superfícies próprias:

1. **Central**
2. **Pedidos / Nova venda WhatsApp**
3. **Tablet Separação**
4. **Estoque Mobile — Balanço / Avaria / Retorno**
5. **Entregador**

Telas especializadas do Bling serão usadas quando forem superiores:
- Check-in de Recebimentos;
- Checkout;
- fiscal;
- compras;
- financeiro;
- lotes;
- devoluções.

## 3.3 Bling
Fonte oficial de:
- produto ERP/fiscal;
- estoque físico;
- saldo virtual/reservas;
- depósitos;
- lotes/validade;
- fornecedor;
- pedido de venda ERP;
- pedido de compra;
- NF-e;
- DANFE;
- contas a pagar;
- contas a receber;
- devoluções;
- movimentações de estoque;
- Check-in;
- Checkout.

## 3.4 Supabase
Manter somente o que é específico da Dona Antônia:
- site;
- cestas personalizáveis;
- espelho/cache para performance;
- pedido canônico local;
- rota local;
- vínculo de PapoAI;
- Control Tower;
- ledger mínimo;
- approval queue;
- regras especiais;
- ponte com Bling.

## 3.5 PapoAI
Responsável por:
- canal WhatsApp;
- FAQ;
- IA de atendimento;
- Flow;
- áudio/imagem/localização;
- templates;
- handoff humano;
- follow-up.

Não será ERP e não escreverá diretamente no Bling.

## 3.6 OpenAI / ChatGPT
Responsável por:
- análise;
- relatórios;
- explicações;
- investigação;
- recomendação;
- copiloto da Control Tower;
- futuramente MCP Dona Antônia.

A IA nunca será fonte de verdade operacional.

---

# 4. Fontes de verdade

| Domínio | Fonte oficial |
|---|---|
| Produto fiscal/ERP | Bling |
| GTIN/SKU/NCM/CEST | Bling |
| Preço regular | Bling |
| Cesta personalizada | Dona Antônia |
| Preço comercial da cesta | Dona Antônia |
| Estoque físico | Bling |
| Saldo vendável | saldo virtual Bling refletido localmente |
| Lote/validade | Bling |
| Oferta por validade | regra Dona Antônia baseada em lote |
| Cliente ERP/fiscal | Bling |
| Conversa WhatsApp | PapoAI |
| Pedido canônico | Dona Antônia + registro ERP no Bling |
| Compra | Bling |
| XML CNPJ | Bling/SEFAZ |
| XML CPF | staging Dona Antônia |
| Fornecedor | Bling |
| Fiscal | Bling |
| Financeiro | Bling |
| Rota local | Dona Antônia |
| Eventos/auditoria | ledger Dona Antônia |
| Documentação | GitHub |

---

# 5. Motor único de pedido

Todas as origens convergem no mesmo motor:

- site;
- WhatsApp manual;
- rascunho PapoAI;
- recompra;
- futura ação ChatGPT autorizada.

O motor valida:
- cliente;
- endereço;
- área atendida;
- itens;
- cestas;
- preço;
- mínimo;
- estoque vendável;
- pagamento previsto;
- idempotência;
- versão do pedido.

A origem vira apenas metadado.

---

# 6. Fluxo principal de venda

## 6.1 Pedido nasce

### Site
Cliente fecha pedido.

### WhatsApp
Atendente usa **Nova venda WhatsApp** ou revisa rascunho PapoAI.

Resultado:
- pedido em `Aguardando confirmação`;
- sem reserva;
- sem separação;
- sem fiscal.

## 6.2 Confirmação
Preferencialmente pelo WhatsApp:

**Confirmar pedido** / **Cancelar**

Quando cliente confirma:
- revisão/versionamento é validado;
- pedido vira Aprovado;
- Bling recebe/atualiza situação;
- reserva entra;
- picking térmico é disparado;
- Control Tower atualiza.

## 6.3 Impressão automática
Bobina ~85 mm:
- pedido;
- cliente;
- QR;
- foto;
- nome;
- EAN;
- quantidade;
- gôndola;
- prateleira.

Itens ordenados pela localização.

Cesta imprime componentes reais.

## 6.4 Separação
Funcionário trabalha com papel.

Ao terminar:
- lê QR;
- toca **SEPARADO**;
- ou **PROBLEMA**.

## 6.5 Conferência
Preferência: Bling Checkout.

- EAN;
- Picking/Packing;
- checkout parcial;
- Verificado;
- usuário identificado.

Depois de Verificado:
- baixa/estoque segue automação homologada;
- fiscal entra no fluxo;
- documentos são gerados.

## 6.6 Fiscal
Direção principal:
- NF-e antes da saída;
- pagamento efetivo depois, no domicílio.

Dependente de homologação contábil sobre:
- Portaria 262/2023 MT;
- CNAE;
- grupo pagamento da NF-e;
- POS;
- cesta/rateio.

## 6.7 Expedição
Pedido apto entra automaticamente em fila.

Sistema:
- agrupa;
- sugere rota;
- gera romaneio;
- atribui carro.

## 6.8 Entrega
Tela:
- Maps;
- WhatsApp;
- Entregue;
- Não entregue.

Em Entregue:
- pagamento efetivo;
- split permitido;
- soma precisa fechar;
- financeiro Bling reconciliado;
- pedido concluído.

---

# 7. Pagamento

Separar três conceitos:

1. **previsto** — cliente informou;
2. **fiscal** — informação da NF-e conforme política;
3. **efetivo** — recebido de verdade.

Meios:
- PIX;
- dinheiro;
- crédito;
- alimentação;
- refeição;
- split.

Nunca marcar recebido sem evidência/ação autorizada.

---

# 8. Cestas personalizáveis

Cesta permanece uma regra própria.

Motor:
`base_price + deltas`

Bling recebe os **componentes efetivamente vendidos**, não apenas um kit-pai variável.

Benefícios:
- estoque real;
- Checkout real;
- lote;
- FEFO;
- fiscal por produto;
- picking correto.

A política fiscal da diferença entre soma de componentes e preço comercial precisa ser homologada.

Candidato preferido:
- ratear o preço comercial entre os componentes;
- evitar usar `other_expenses` como margem artificial.

---

# 9. Estoque

## 9.1 Fonte oficial
Bling.

Supabase mantém somente espelho.

## 9.2 Saldo para o site
Preferência:
- saldo virtual Bling do depósito Geral;
- refletido por webhook.

## 9.3 Depósitos
Somente dois:

### Geral
Vendável.

### Quarentena
Não vendável:
- avaria;
- vencido;
- retorno;
- recall;
- dúvida.

---

# 10. Balanço

A experiência mobile deve continuar rápida:

EAN -> produto -> quantidade -> confirmar -> próximo.

Mas:
**contagem não regulariza automaticamente toda diferença.**

Se bate:
- fecha.

Se diverge:
- abre reconciliação.

Investigar:
- venda não baixada;
- entrada;
- fator de caixa;
- devolução;
- perda;
- compra CPF;
- erro de cadastro.

Perda real segue regularização fiscal.

---

# 11. Avaria, perda e vencimento

## Avaria
EAN -> motivo -> quantidade -> Quarentena.

Depois:
- devolução fornecedor; ou
- descarte/perda.

## Vencido
- bloquear venda;
- remover oferta;
- Quarentena;
- fila de descarte;
- baixa fiscal homologada.

## Perda/extravio
SEFAZ-MT analisada aponta uso de CFOP 5.927 nos cenários pertinentes.

Funcionário nunca escolhe CFOP.

---

# 12. Lotes, validade e ofertas

Bling = lote, saldo, validade, FEFO.

Dona Antônia = regra:
- 60–90 dias: 10%;
- 30–59: 20%;
- <30: 40%.

Oferta é limitada ao **saldo dos lotes elegíveis**.

Não descontar estoque novo só porque existe um lote velho.

Produto só é desativado se não houver lote vendável.

---

# 13. Compras e recebimento

## CNPJ
SEFAZ -> Bling -> Check-in.

Check-in:
- EAN;
- DUN;
- quantidade;
- lote;
- validade;
- falta;
- dano;
- incorreto;
- recusado.

Só depois:
- estoque;
- financeiro.

## Devolução ao fornecedor
Bling gera a partir da nota de entrada.

## Caixa -> unidade
Usar:
- DUN quando houver;
- regra fornecedor/produto;
- revisão quando ambígua.

---

# 14. XML CPF

XML CPF:
- pode enriquecer cadastro;
- fornecedor;
- custo gerencial;
- evidência.

Nunca:
- AP empresarial automático;
- estoque fiscal regular automático;
- baixa fiscal automática.

Origem:
`cpf_pending_regularization`

A política fiscal final depende do contador.

---

# 15. Cliente e identidade

Telefone = canal.

CPF/CNPJ = identidade fiscal forte.

Matching:
1. Bling ID;
2. CPF/CNPJ;
3. telefone + evidências;
4. nome/endereço apenas sugestão.

Cliente pode existir operacionalmente antes de ter CPF.

Pedido mantém snapshot do endereço usado.

---

# 16. PapoAI

Nova integração:
- ponte mínima;
- eventos canônicos;
- idempotência;
- versão do resumo;
- confirmação;
- cancelamento;
- localização;
- handoff.

Não reativar arquitetura antiga.

---

# 17. Rota e entregador

Custom Dona Antônia.

Entrada:
- endereço;
- pin WhatsApp;
- coordenada validada.

Sistema:
- geocodifica uma vez;
- calcula rota quando conjunto muda;
- permite dois carros.

Entregador:
- uma parada por vez;
- Maps;
- WhatsApp;
- pagamento;
- tentativa.

---

# 18. Cancelamentos e devoluções

## Antes da saída
Cancelar pedido e, se necessário, NF-e conforme estágio.

## Depois da saída
Não é cancelamento simples.

Mercadoria não entregue:
- retorna;
- NF-e de entrada/retorno referenciando original;
- Quarentena;
- inspeção;
- Geral ou perda.

## Devolução pós-entrega
- nota de devolução;
- retorno;
- inspeção;
- refund separado.

## Troca
- devolução original;
- nova saída.

---

# 19. Pós-venda e CDC

Como venda ocorre fora do estabelecimento:
- fluxo de cancelamento;
- solicitação de devolução;
- reclamação;
- arrependimento;
- confirmação eletrônica.

Ocorrências:
- item errado;
- falta;
- avaria;
- vencido;
- qualidade;
- entrega;
- pagamento.

---

# 20. Recall

Por lote:
- bloquear venda;
- Quarentena;
- localizar clientes afetados;
- comunicar;
- receber retorno;
- destino conforme fornecedor/Anvisa.

Sem módulo sanitário complexo.

---

# 21. Control Tower

Página inicial do Admin.

## Cards
- pedidos;
- separação;
- entrega;
- fiscal;
- pagamento;
- estoque;
- vencimento;
- compras;
- PapoAI;
- integrações.

## Precisa de você
Fila única de exceções.

## Automações
- última execução;
- resultado;
- falha;
- próxima ação;
- pausa quando permitido.

## Timeline
Humano + automação + IA + Bling + PapoAI.

## Copiloto
Botões:
- O que precisa da minha atenção?
- Resuma o dia.
- O que falhou?
- Compare com o Bling.
- Investigue este pedido.
- Revise XML.
- Revise financeiro.

---

# 22. Modelo mínimo da Control Tower

Somente três estruturas conceituais:

## ops_events
Eventos de negócio relevantes.

## ops_attention
Pendências atuais.

## ops_approvals
Aprovações de ações sensíveis.

Não criar uma tabela para cada automação.

---

# 23. Segurança

Perfis:

### Owner
Tudo.

### Supervisor
Exceções operacionais.

### Operador
Separação/conferência.

### Entregador
Rota/pagamento.

### Automation/IA
Conta técnica com mínimo privilégio.

O PIN compartilhado atual não é modelo final.

---

# 24. IA

## Pode executar sozinha
- relatório;
- resumo;
- classificação;
- reconciliação de leitura;
- follow-up;
- impressão;
- status por evento determinístico.

## Exige aprovação
- valor;
- cancelamento crítico;
- fiscal excepcional;
- ajuste extraordinário;
- ação em massa;
- conversão ambígua.

## Nunca sozinha
- inventar pagamento;
- inventar estoque;
- apagar dados;
- resolver ambiguidade fiscal sem regra;
- alterar credenciais.

---

# 25. Webhooks e confiabilidade

Preferência:
evento -> fila -> processamento -> reconciliação.

Bling:
- eventos duplicados são possíveis;
- ordem não é garantida;
- receptor responde rápido;
- processamento assíncrono.

Crons:
somente rede de segurança.

---

# 26. Anti-sobrecarga

Regra:
**se nada aconteceu, nada deve rodar.**

Evitar:
- polling;
- dashboard chamando APIs externas em massa;
- IA rodando em vazio;
- worker ocioso permanente;
- espelhos completos sem motivo.

Usar:
- webhook;
- cache pequeno;
- read models;
- contexto mínimo para IA;
- reconciliação eventual.

---

# 27. Hardware

## Tablet 1
Separação:
- QR;
- Separado;
- Problema;
- Reimprimir.

## Tablet 2
Checkout/conferência Bling.

## Estoque mobile
- Balanço;
- Avaria/Vencido;
- Retorno.

## Impressora térmica
Uso para:
- picking 85 mm;
- DANFE Simplificado Tipo 2 quando homologado;
- reimpressão.

## POS
Validar dados exigidos pela regra MT.

---

# 28. POCs obrigatórios

1. Bling situações/escopos.
2. Pedido Aguardando confirmação.
3. Reserva após aprovação.
4. Webhooks.
5. Picking térmico.
6. Checkout.
7. Balanço.
8. Lotes/FEFO.
9. Cestas/fiscal.
10. Fiscal domiciliar.
11. PapoAI.
12. Rota.
13. Control Tower.
14. Quarentena/devoluções.
15. Check-in/fornecedor.

---

# 29. Cutover

Sem big-bang.

## Shadow
Nova arquitetura observa.

## Canary
1 pedido.

## Lote pequeno
Alguns pedidos.

## Cutover
Todos os pedidos novos.

Pedidos antigos:
- legado;
- somente leitura.

---

# 30. Cleanup

Só depois da estabilidade:

1. provar zero dependência;
2. provar zero tráfego útil;
3. backup;
4. remover cron;
5. remover função;
6. remover tabela;
7. smoke test;
8. atualizar documentação.

Nunca migrar e apagar simultaneamente.

---

# 31. Bloqueadores/gates restantes

## Contador
- entrega domiciliar;
- campos da NF-e;
- cesta/rateio;
- CFOP perdas;
- devoluções;
- compras CPF;
- regime tributário.

## Bling
- Situações/Módulos;
- usuários;
- Check-in;
- Checkout;
- lotes;
- Geral/Quarentena;
- webhooks.

## Hardware
- tablets;
- leitores;
- impressora;
- POS.

## PapoAI
- payload real;
- localização;
- templates;
- confirmação;
- handoff.

---

# 32. Critério de sucesso

Happy path:
- cliente pede;
- confirma;
- imprime sozinho;
- funcionário separa;
- confere;
- fiscal/estoque seguem;
- rota monta;
- entregador entrega;
- pagamento fecha;
- Bling concilia;
- Control Tower limpa a pendência.

Objetivo:
**quase nenhuma interação humana digital fora das ações físicas e exceções.**

---

# 33. Regra final de desenvolvimento

Antes de criar uma função, tabela ou automação, responder:

1. Qual problema real resolve?
2. Bling/PapoAI/OpenAI já resolve?
3. Precisa rodar sem evento?
4. Qual é a fonte de verdade?
5. Qual é o custo?
6. Qual é a falha se parar?
7. Como será auditado?
8. Como será removido?

Se não houver resposta clara, não criar.

---

# 34. Decisão final

A Dona Antônia Operations 2.0 NÃO será um ERP paralelo.

Será:
- site rápido;
- Admin mínimo;
- Bling no centro;
- WhatsApp/PapoAI integrado;
- automação orientada a eventos;
- operação mobile simples;
- Control Tower supervisionando;
- IA como copiloto;
- documentação contínua;
- poucos componentes próprios, cada um com função clara.
