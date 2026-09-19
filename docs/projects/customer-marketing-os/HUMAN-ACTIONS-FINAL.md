# HUMAN ACTIONS FINAL — Customer & Marketing OS

Atualizado em 19/09/2026 ~08:40 America/Cuiaba.

Este arquivo contém somente ações que dependem de intervenção humana ou de evidência orgânica real. A programação autônoma segura da CM-1 foi esgotada pelas Rodadas 06–14.

## Estado antes das ações humanas

- 20 critérios = 15 verified / 5 implemented / 0 blocked;
- safe_for_internal_homologation=true;
- external_activation_authorized=false;
- external side effect=false;
- Meta Direct OFF;
- canonical outbound OFF;
- publishing OFF;
- strategy AI OFF;
- marketing kill switch ON;
- orçamento IA=0.

Evidência atual:
- PapoAI receipts=19;
- catalog_open=65;
- catalog_search=50;
- product_view=0;
- cart events=466;
- orders=47;
- identity conflicts=2;
- opportunities=75 suppressed / 0 terminal;
- AI executions=0 / custo=0.

## Ordem recomendada das ações humanas

### 1. Validar a Central de Relacionamento no navegador

Abrir a Central canary com o PIN administrativo e confirmar:
- login por PIN funcionando;
- tela abre sem erro;
- navegação entre abas;
- Homologação CM-1 mostra o estado;
- Meta Foundation mostra o preflight;
- layout aceitável no celular e desktop.

Não descobrir nem alterar o PIN só para o teste.

Quando concluído, registrar a evidência da validação manual; o snapshot canônico ainda representa os gates de PIN como pending por desenho.

### 2. Revisar os 2 conflitos reais de identidade

Na Central de Relacionamento, em Qualidade dos Dados / Revisões de identidade:
- analisar os candidatos;
- quando houver certeza, escolher o cadastro correto;
- se nenhum candidato for seguro, escolher a opção equivalente;
- escrever justificativa;
- confirmar.

A decisão é humana. O sistema já possui auditoria append-only e não faz merge silencioso.

Depois, reexecutar o checklist. O critério 2 só deve virar verified quando não houver conflito pendente relevante e existir evidência real de resolução.

### 3. Gerar um Product View real no Comprar

Abrir o Comprar real:
- localizar um produto;
- clicar na imagem ou no nome;
- abrir o detalhe do produto.

Não precisa adicionar ao carrinho nem finalizar pedido.

O backend, room token, RPC, dedupe e collector já foram testados por contrato. Esta ação deve gerar o primeiro `product_view` real. Depois reexecutar o checklist e confirmar o critério 7.

### 4. Configurar o System User token do WhatsApp no Supabase Vault

Na Meta Business:
- usar/criar o System User correto da Dona Antônia;
- gerar token do app Meta correto;
- garantir as permissões `whatsapp_business_management` e `whatsapp_business_messaging`.

Não colar o token em chat, GitHub ou documentação.

No Supabase Vault, salvar o valor com o nome exato:

`dona_antonia_whatsapp_access_token_v1`

### 5. Executar Meta Foundation -> Verificar Meta agora

Depois do token no Vault:
- abrir a Central;
- entrar em Meta Foundation;
- clicar Verificar Meta agora.

O diagnóstico é read-only:
- GET-only;
- não envia mensagem;
- não publica;
- não habilita outbound;
- não ativa Meta Direct.

Confirmar:
- scopes management e messaging;
- WABA;
- Phone Number ID;
- qualidade do número;
- subscribed_apps;
- callback Meta Direct observado.

### 6. Homologar o callback Meta Direct

Se o diagnóstico ainda indicar `webhook_not_verified`, configurar na Meta o callback esperado:

`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-meta-direct-v1`

A verificação deve usar o verify token já gerenciado com segurança no Supabase/Edge; nunca registrar o segredo em docs/chat.

Após a confirmação externa, executar novamente Verificar Meta agora.

Não definir `direct_ready_flag=true` enquanto permissions e callback não estiverem comprovados.

### 7. Revisar/aceitar o Meta Policy Registry

O registry técnico está pronto:
- 8/8 políticas requeridas ativas;
- stale=0;
- source missing=0;
- fail-closed=8/8.

O responsável deve revisar e aceitar a política como gate humano. Readiness técnico não é autorização externa.

### 8. Aguardar lifecycle real de oportunidade

Hoje:
- 75 oportunidades suppressed;
- 0 dismissed;
- 0 converted;
- 0 expired;
- primeira expiração natural prevista para 23/09/2026 17:00:15 UTC (13:00:15 em Cuiabá).

Não alterar artificialmente os dados. Depois de um terminal real persistido, reexecutar o checklist; o critério 13 deve promover automaticamente.

### 9. Decidir sobre evidência real de Marketing Brain / IA

Critérios 15 e 18 estão tecnicamente programados e protegidos, mas sem evidência real porque:
- SUGGEST está OFF;
- orçamento IA=0;
- AI executions=0;
- custo=0.

O responsável deve decidir depois se quer uma execução governada real de SUGGEST/IA, com orçamento pequeno, limite diário e kill switch preservado.

Não ligar IA apenas para aumentar o checklist. Se não houver valor operacional real, manter OFF até existir caso de uso.

### 10. Autorização externa é uma decisão separada

Mesmo depois de todos os itens acima:
- Meta Direct não deve ser ativado automaticamente;
- outbound não deve ser ligado automaticamente;
- publishing não deve ser ligado automaticamente.

Qualquer ativação externa exige autorização explícita nova do responsável.

## Após cada ação

Depois de executar uma ação humana, informar ao assistente exatamente qual ação foi concluída. O assistente deve:
1. reconsultar o Supabase;
2. confirmar evidência real;
3. atualizar os documentos;
4. promover apenas o que for comprovado;
5. manter os demais gates fechados.

## Observação sobre manual gates

O read model atual expõe os gates de PIN, Policy Registry e Meta Direct como pending por desenho estático. A evidência humana deve ser confirmada primeiro; só depois o estado canônico pode ser atualizado de forma auditável. Não converter pending em aprovado antes da ação real.
