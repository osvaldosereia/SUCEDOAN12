# ANA própria — cadastro assistido de clientes e sincronização com Bling

Data: 2026-10-05
Status: design aprovado em conversa; especificação para revisão antes do plano de implementação

## 1. Objetivo

Evoluir a **ANA própria da Central de Atendimento da Dona Antônia** para ajudar a formar e manter o cadastro canônico de clientes a partir das conversas de WhatsApp, sem depender do PapoAI e sem obrigar o cliente a sair do WhatsApp quando isso não for necessário.

O objetivo não é transformar a ANA em um robô que altera qualquer dado livremente. O objetivo é reduzir cadastro manual e duplicidade usando três mecanismos coordenados:

1. identificação canônica pelo telefone da conversa;
2. extração estruturada de dados explicitamente informados pelo cliente;
3. confirmação proporcional ao risco antes de promover dados para cadastro confirmado.

O Supabase/Admin continua sendo a **fonte canônica do cliente**. O Bling recebe uma projeção operacional do cliente quando houver motivo comercial para isso; não deve virar a base primária nem receber todo contato que apenas iniciou uma conversa.

## 2. Escopo e decisões aprovadas

Esta especificação cobre:

- reconhecimento automático do cliente da conversa;
- criação de cliente provisório no Admin quando não existir correspondência segura;
- leitura das mensagens recentes pela ANA para extrair dados cadastrais;
- diferenciação entre dado observado, sugerido, confirmado e persistido;
- pedido de dados faltantes dentro do próprio WhatsApp;
- uso de WhatsApp Flow como caminho estruturado preferencial quando necessário;
- cadastro externo somente como fallback;
- mudança da regra de prontidão para o Bling, separando cadastro comercial de cadastro fiscal completo;
- sincronização e atualização do mesmo contato no Bling, inclusive quando inicialmente não houver CPF/CNPJ;
- interface de acompanhamento na lateral direita do Atendimento;
- trilha de auditoria e regras de segurança.

Ficam fora deste primeiro desenho:

- emissão automática de NF-e pela ANA;
- alteração automática de pedido, preço, estoque ou forma de pagamento pela ANA;
- criação automática de endereço principal a partir de uma frase ambígua;
- envio de dados pessoais para serviços externos além do que for estritamente necessário ao modelo usado pela ANA e ao Bling homologado;
- qualquer dependência de PapoAI para raciocínio, cadastro ou sincronização.

## 3. Estado atual relevante

O projeto já possui:

- `customers` como cadastro canônico;
- `customer_phones`, `customer_addresses`, `customer_emails` e `customer_identity_profiles_v1`;
- resolução de telefone brasileiro com variantes e proteção contra ambiguidade;
- `conversations.customer_id` e `conversations.wa_contact_e164`;
- cadastro e edição de cliente pelo próprio Atendimento;
- `ops2_admin_customer_save_v2` como caminho canônico de persistência administrativa;
- `ops2_customer_registration_state_v1` para derivar estado do cadastro;
- `ops2_maybe_enqueue_customer_bling_v1` para enfileirar sincronização com Bling;
- Bling Hub com jobs, links de entidade e auditoria;
- ANA própria em modo de prévia, usando histórico recente canônico da conversa e contexto controlado server-side.

A regra atual considera `bling_ready=true` apenas quando o cliente possui nome, telefone, documento válido e endereço utilizável, salvo quando já existe `bling_contact_id`. Isso precisa ser revisto: o Bling permite contatos com cadastro mínimo sujeito às configurações de campos obrigatórios da própria conta, e a Dona Antônia precisa distinguir **contato comercial** de **cadastro fiscal completo**.

Também existe uma política anterior da ANA que proíbe coleta de CPF/CNPJ e endereço completo pelo chat. Esta especificação **substitui essa restrição de forma limitada e explícita**: a ANA própria poderá solicitar e processar dados cadastrais necessários quando houver finalidade de cadastro/pedido, seguindo as regras de confirmação e minimização definidas abaixo.

## 4. Fonte de verdade e estados do cliente

O cliente deve possuir estados derivados distintos. Eles não substituem `customers`; são estados operacionais calculados a partir do cadastro canônico.

### 4.1 `identity_ready`

Requisitos mínimos:

- nome utilizável;
- telefone WhatsApp canônico.

Significa: sabemos quem é a pessoa operacionalmente para continuar o atendimento.

### 4.2 `commercial_ready`

Requisitos mínimos:

- `identity_ready=true`;
- identidade do telefone sem ambiguidade;
- cadastro ativo.

CPF e endereço **não são obrigatórios** para este estado.

Significa: o cliente pode ser usado como contato comercial e pode ser projetado para o Bling quando existir um gatilho comercial.

### 4.3 `fiscal_ready`

Requisitos:

- `commercial_ready=true`;
- CPF/CNPJ válido quando exigido pela operação fiscal;
- endereço de entrega/fiscal confirmado com os campos necessários à operação;
- cidade atendida quando aplicável às regras da Dona Antônia.

Significa: o cadastro contém os dados necessários para etapas fiscais que dependem deles.

### 4.4 `bling_linked`

Verdadeiro quando existe um vínculo canônico conhecido entre o `customer_id` e um contato Bling (`customers.bling_contact_id` e/ou `bling_hub_entity_links_v2`).

`bling_linked` não significa `fiscal_ready`.

## 5. Quando criar cliente no Admin

### 5.1 Conversa com correspondência única

Quando o telefone da conversa resolve para exatamente um cliente:

- reutilizar o cadastro;
- vincular `conversations.customer_id` se necessário;
- nunca criar duplicata.

### 5.2 Telefone sem correspondência

A ANA/Atendimento pode criar um cliente **provisório** quando houver pelo menos:

- telefone canônico da própria conversa;
- nome informado explicitamente pelo cliente ou já disponível de fonte confiável da conversa.

O telefone nunca vem do modelo. Ele vem do registro canônico da conversa.

O cliente provisório recebe estado de identidade apropriado (`provisional`) até que haja confirmação suficiente.

### 5.3 Telefone ambíguo

Se as variantes do telefone apontarem para mais de um cliente:

- não criar novo cliente;
- não escolher automaticamente;
- apresentar resolução manual ou usar documento confirmado para desambiguar quando houver regra determinística já homologada.

## 6. Motor de extração cadastral da ANA

A extração cadastral deve ser um contrato separado da ANA de resposta. Não reutilizar texto livre de sugestão como fonte de gravação.

### 6.1 Entrada

Por padrão, analisar as **últimas 30 mensagens de texto canônicas** da conversa, com limite adicional de tamanho total para custo e segurança.

A entrada deve incluir somente:

- direção da mensagem;
- texto;
- timestamp;
- autoria canônica quando conhecida;
- estado atual dos campos cadastrais já existentes;
- lista dos campos que ainda estão faltando.

Não enviar para o modelo dados de outros clientes nem tabelas administrativas irrelevantes.

### 6.2 Saída estruturada

O modelo deve devolver JSON estrito com candidatos por campo, por exemplo:

- `name`;
- `cpf_cnpj`;
- `email`;
- `postal_code`;
- `street`;
- `number`;
- `complement`;
- `neighborhood`;
- `city`;
- `state`;
- `reference`.

Cada candidato deve conter:

- valor normalizado;
- confiança de 0 a 1;
- evidência curta/identificador das mensagens de origem;
- classificação `explicit`, `derived` ou `ambiguous`;
- recomendação `auto_apply`, `confirm` ou `ignore`.

### 6.3 Regra fundamental

A ANA só pode extrair **fatos que o cliente ou atendente afirmou explicitamente no contexto da própria conversa**. Ela não pode:

- inferir CPF a partir de nome;
- completar endereço por conhecimento externo sem o cliente ter informado dado suficiente;
- transformar endereço de terceiro em endereço principal automaticamente;
- assumir que um endereço citado em contexto passado continua atual;
- sobrescrever dado confirmado com candidato de confiança inferior.

## 7. Política de confiança e gravação

### 7.1 Autoaplicação permitida

Pode gravar automaticamente sem nova pergunta apenas quando todas as condições forem verdadeiras:

- campo de baixo risco operacional;
- valor explícito e inequívoco;
- confiança >= 0,98;
- não há conflito com valor confirmado já existente;
- evidência vem da própria conversa selecionada;
- validador determinístico aceita o formato.

Campos inicialmente elegíveis para autoaplicação:

- nome, quando o cliente explicitamente se identifica;
- e-mail, quando explicitamente informado e sintaticamente válido;
- complemento/referência, quando claramente vinculados ao endereço em edição.

### 7.2 Confirmação obrigatória

Sempre exigir confirmação antes de promover para dado confirmado:

- CPF/CNPJ;
- rua, número, bairro, cidade e CEP quando formarem ou substituírem endereço principal;
- qualquer dado que conflite com valor confirmado existente;
- qualquer dado extraído de mensagem com contexto de terceiro (`minha mãe`, `meu funcionário`, `entrega para...` etc.);
- confiança abaixo de 0,98 e acima do limite mínimo de sugestão.

### 7.3 Ignorar

Não sugerir para gravação quando:

- confiança < 0,80;
- valor for contraditório entre mensagens recentes;
- origem não puder ser associada a mensagem real;
- o campo exigir validação determinística e falhar nela.

Os limiares devem ser configuráveis server-side, não no navegador.

## 8. Confirmação pelo cliente

A confirmação deve acontecer preferencialmente no próprio WhatsApp.

Exemplo conceitual:

`Encontrei estes dados para seu cadastro: CPF final 123-45 e endereço Rua X, 120, Bairro Y. Está correto?`

A resposta pode ser:

- botão/Flow `Confirmar`;
- botão/Flow `Corrigir`;
- texto livre inequívoco (`sim`, `está correto`), desde que associado a uma solicitação de confirmação ainda válida.

A confirmação deve possuir ID e expiração. Um `sim` antigo não pode confirmar uma sugestão nova.

## 9. Como pedir os dados faltantes

A ANA deve pedir **uma coisa por vez**, mantendo o padrão atual de mensagens curtas.

Prioridade sugerida:

1. nome, se faltar;
2. CPF/CNPJ quando necessário para completar o cadastro fiscal/pedido;
3. CEP ou endereço;
4. número;
5. complemento/referência se necessário.

Se o cliente informar vários dados espontaneamente em uma única mensagem, a ANA pode extrair todos e confirmar em conjunto quando fizer sentido.

## 10. WhatsApp Flow e cadastro externo

### 10.1 Preferência

Ordem preferencial:

1. conversa natural com a ANA;
2. WhatsApp Flow quando o cliente preferir formulário ou quando faltarem vários campos;
3. formulário web externo somente como fallback.

### 10.2 WhatsApp Flow

O Flow deve preencher campos estruturados sem tirar o cliente do WhatsApp. A resposta do Flow entra no mesmo pipeline canônico de cadastro e validação; não cria uma segunda base.

### 10.3 Cadastro externo

Usar apenas quando:

- Flow estiver indisponível;
- o recurso necessário não puder ser coletado com segurança dentro do WhatsApp;
- houver requisito específico de UX/validação não suportado pelo Flow.

O link deve ser temporário, associado ao `customer_id`/jornada e nunca confiar apenas em telefone digitado pelo usuário para escolher o cadastro.

## 11. Política de sincronização com Bling

### 11.1 Princípio

**Não sincronizar todo lead do WhatsApp para o Bling.**

O Bling é projeção comercial/fiscal. O Supabase é a fonte canônica.

### 11.2 Gatilhos para criar contato no Bling

Um cliente `commercial_ready` pode ser criado no Bling quando ocorrer pelo menos um dos gatilhos:

- pedido criado/confirmado no site ou Admin;
- ação explícita do atendente `Sincronizar com Bling`;
- necessidade de criar venda/orçamento no Bling;
- outro evento comercial explicitamente homologado no futuro.

Somente conversar, perguntar preço ou receber oferta não é gatilho suficiente.

### 11.3 Bling sem CPF

O sincronizador deve permitir criação do contato sem CPF/CNPJ **quando a configuração real da conta Bling aceitar o payload mínimo**.

Antes do cutover, deve existir um teste de homologação da conta Dona Antônia verificando quais campos foram configurados como obrigatórios no Bling. Se CPF/documento estiver configurado como obrigatório na conta, a automação não deve contornar essa regra; deve manter o job bloqueado com motivo operacional claro.

### 11.4 Atualização posterior

Quando CPF/endereço forem confirmados depois:

- atualizar o mesmo contato Bling;
- preservar `bling_contact_id`;
- nunca criar um segundo contato apenas porque o primeiro nasceu incompleto.

A idempotência continua por `customer_id` canônico + link Bling.

### 11.5 Fiscalização separada

`commercial_ready` autoriza contato comercial no Bling.

`fiscal_ready` é a condição para operações fiscais que realmente exigirem aqueles dados.

A criação de contato no Bling não prova que o cliente está apto para NF-e.

## 12. Interface na lateral direita do Atendimento

Na aba `Visão geral`, incluir um bloco compacto de **Cadastro**.

Exemplo de informações:

- estado: Provisório / Comercial / Fiscal completo;
- progresso: `4 de 8 dados`;
- Nome ✓;
- WhatsApp ✓;
- CPF —;
- CEP —;
- Endereço —;
- Número —;
- Bairro —;
- Cidade —;
- Bling: Não sincronizado / Sincronizado / Bloqueado por campos obrigatórios.

Ações:

- `ANA buscar dados na conversa`;
- `Pedir dados ao cliente`;
- `Revisar sugestões`;
- `Editar cadastro`;
- `Sincronizar com Bling` quando permitido.

Sugestões da ANA devem mostrar origem e confiança sem exibir raciocínio interno.

## 13. Persistência proposta

Criar estruturas próprias para sugestões e confirmações, em vez de gravar diretamente o JSON do modelo em `customers`.

### 13.1 `customer_profile_suggestions_v1`

Campos conceituais:

- `id`;
- `customer_id`;
- `conversation_id`;
- `field_name`;
- `suggested_value` JSON/texto normalizado;
- `confidence`;
- `evidence_message_ids`;
- `classification`;
- `status` (`pending`, `auto_applied`, `confirmed`, `rejected`, `expired`);
- `model`/versão da política;
- timestamps.

### 13.2 `customer_profile_confirmation_requests_v1`

Campos conceituais:

- `id`;
- `customer_id`;
- `conversation_id`;
- lista de sugestões;
- estado (`pending`, `confirmed`, `corrected`, `expired`, `cancelled`);
- `expires_at`;
- mensagem outbound associada;
- mensagem/evento de confirmação associado;
- timestamps.

Nenhuma destas tabelas substitui o cadastro canônico.

## 14. Caminho único de gravação

Toda promoção de sugestão para cadastro confirmado deve passar por serviço/RPC server-side que:

1. revalida sessão/autoridade da ação;
2. revalida telefone e identidade canônica;
3. aplica validadores determinísticos de CPF/CNPJ, e-mail, CEP e endereço;
4. verifica conflitos e duplicidade;
5. usa/adapta `ops2_admin_customer_save_v2` ou sucessor canônico;
6. registra auditoria de origem (`ana_auto`, `ana_confirmed_customer`, `admin_manual`, `flow`);
7. atualiza estado derivado do cliente;
8. decide se existe gatilho comercial para Bling;
9. nunca permite ao navegador escolher livremente outro telefone para a conversa.

## 15. Auditoria e privacidade

Registrar para cada alteração automatizada:

- cliente;
- conversa;
- campo alterado;
- valor anterior e novo valor de forma adequada à sensibilidade;
- origem das mensagens;
- confiança;
- política/modelo;
- se foi autoaplicado ou confirmado;
- ator quando houver atendente.

CPF/CNPJ não deve aparecer integralmente em logs operacionais comuns. A UI pode mascarar o documento fora de formulários de edição autorizados.

Não armazenar cadeia de raciocínio do modelo.

## 16. Relação com a ANA atual

A ANA atual de prévia de resposta permanece separada do novo motor de cadastro.

Separação proposta:

```text
ANA resposta
→ decide/sugere texto de atendimento
→ não grava cadastro

ANA cadastro
→ extrai candidatos estruturados
→ política determinística decide autoaplicar / confirmar / ignorar
→ gravação somente por serviço canônico
```

Não usar a resposta textual da ANA como instrução para SQL.

A política anterior `never_collect_in_chat=[CPF/CNPJ,endereço completo]` deve ser substituída por uma política de **coleta com finalidade e confirmação**, somente no fluxo de cadastro. A ANA de resposta geral não deve sair pedindo CPF/endereço fora desse contexto.

## 17. Tratamento de erros e conflitos

Casos obrigatórios:

- telefone ambíguo: bloquear automação e encaminhar para revisão;
- CPF já pertencente a outro cliente: bloquear e mostrar conflito;
- endereço contraditório: pedir confirmação;
- confirmação expirada: gerar nova solicitação;
- Bling rejeita payload por campo obrigatório: manter cliente no Admin, registrar job bloqueado/retry conforme tipo do erro e mostrar motivo;
- modelo indisponível: cadastro manual/Flow continuam funcionando;
- baixa confiança: nunca gravar automaticamente.

Falha da ANA nunca deve impedir atendimento humano.

## 18. Rollout

### Fase 1 — leitura e sugestão

- ANA extrai dados, mas não grava automaticamente;
- atendente revisa na lateral;
- medir acerto e conflitos.

### Fase 2 — confirmação pelo cliente

- confirmação contextual no WhatsApp;
- promoção automática apenas após confirmação válida;
- Flow para coleta estruturada.

### Fase 3 — autoaplicação de baixo risco

- somente campos permitidos e confiança >= limite homologado;
- kill switch server-side;
- métricas por campo.

### Fase 4 — Bling comercial

- separar `commercial_ready` de `fiscal_ready`;
- homologar criação de contato mínimo na conta real;
- sincronizar somente em gatilhos comerciais;
- atualizar o mesmo contato quando o cadastro evoluir.

## 19. Testes obrigatórios

### Identidade

- telefone único reutiliza cliente;
- telefone ambíguo não cria nem escolhe cliente;
- telefone sem cadastro cria provisório somente com nome confiável;
- variantes brasileiras com/sem nono dígito preservam identidade.

### Extração

- dado explícito gera candidato com evidência;
- dado inferido não é promovido;
- endereço de terceiro exige confirmação;
- conflito com dado confirmado nunca sobrescreve automaticamente;
- baixa confiança não grava.

### Confirmação

- confirmação válida promove apenas sugestões associadas;
- `sim` antigo não confirma solicitação nova;
- correção do cliente rejeita sugestão anterior.

### Bling

- conversa sem evento comercial não gera job;
- pedido confirmado com cliente `commercial_ready` pode gerar sync sem CPF quando a conta aceitar;
- CPF/endereço posterior atualiza o mesmo `bling_contact_id`;
- payload rejeitado por configuração obrigatória não cria duplicata;
- `fiscal_ready=false` continua bloqueando operação fiscal dependente dos dados.

### Segurança

- `anon` não executa escrita administrativa;
- viewer não promove dados nem sincroniza Bling;
- telefone da conversa não é escolhido pelo payload do navegador;
- logs não expõem CPF integral;
- prompts/instruções do cliente não podem transformar saída do modelo em comando operacional livre.

## 20. Métricas de sucesso

Acompanhar:

- % de conversas identificadas automaticamente;
- % de novos clientes provisórios que chegam a `commercial_ready`;
- % que chegam a `fiscal_ready`;
- precisão por campo das sugestões da ANA;
- taxa de confirmação/rejeição pelo cliente;
- conflitos de identidade evitados;
- duplicatas de cliente criadas;
- contatos Bling criados sem pedido (objetivo: próximo de zero);
- jobs Bling bloqueados por campos obrigatórios;
- tempo médio entre primeiro contato e cadastro suficiente para pedido.

## 21. Critérios de aceite arquitetural

A solução só está pronta para implementação quando o plano preservar estes princípios:

1. Supabase/Admin permanece a fonte canônica.
2. ANA própria, não PapoAI, executa a inteligência de cadastro.
3. IA produz candidatos estruturados; não executa SQL livre.
4. Dados de maior risco exigem confirmação contextual.
5. Telefone e identidade vêm do estado canônico da conversa, não do modelo.
6. Bling pode receber cadastro comercial incompleto somente por gatilho comercial e somente se a conta aceitar.
7. Fiscalização permanece separada de simples existência do contato no Bling.
8. Atualizações enriquecem o mesmo contato, sem duplicação.
9. Flow é preferido ao formulário externo quando coleta estruturada for necessária.
10. Falha da IA não bloqueia atendimento humano ou cadastro manual.
