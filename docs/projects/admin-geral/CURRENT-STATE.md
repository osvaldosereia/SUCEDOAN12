# CURRENT STATE — Admin Geral

Atualizado: 2026-09-21
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: roadmap autônomo R1–R16 concluído programavelmente.
Execução autônoma: concluída.
Efeitos externos novos: proibidos sem gate/evidência específica.

## Estado das rodadas
- R1–R16: DONE

## Fechamento programável R16
- preflight final confirmou HEAD `d4ebe785c1699b7ddea9a28e8e31e5319f250574` antes da atualização documental.
- comparação com `main`: branch 210 commits à frente e 1 atrás; divergência paralela continua somente no commit `be2b3d54` de SEO/dados públicos de cestas, fora desta frente e não incorporado.
- workflow `Admin Geral contracts`, run `35581711967`, concluiu com `success` para o HEAD `d4ebe785...`.
- passaram R2 Design System, R1 Navigation, R3 Context Navigation, R10 Customer, R11 Operations, R12 Creative, R13 Marketing, R14 Operations, R15 Systems e o `R16 final fail-closed audit`.
- a falha anterior da asserção R15 era apenas ordenação textual da mensagem de runtime dormente; o contrato foi corrigido sem relaxar o requisito e o CI subsequente ficou verde.
- gates administrativos sensíveis continuam fail-closed; nenhuma homologação externa foi fabricada.
- rotas/capacidades migradas continuam preservadas de forma aditiva; mobile e desktop permanecem primeira classe.
- App Dona Antônia isolado não foi incorporado/modificado por esta frente.
- Supabase permanece runtime das novas automações; Make não foi adotado como novo runtime.

## R1–R16 — concluídas
- Fundação/inventário, Design System V2, Shell/responsividade, Central de Trabalho, Produtos/Categorias/Vitrine, Estoque/Gôndolas/Validade/Balanço, Cestas, Qualidade do Catálogo, Pedidos, Customer 360, Operações/Aprendizados, Estúdio Criativo/VIDEO, Marketing, Logística/Financeiro/Bling/Fiscal, Automações/Copiloto/Integrações/Saúde e Segurança/QA final concluídos com migração aditiva e contratos reais preservados.
- Central Comercial, Logística, Financeiro, Automation Builder e Copiloto permanecem dormentes por seus gates próprios.
- Nenhum gate externo/runtime foi aberto pela migração.

## Pendências externas — fora do DONE programável
- homologação real de credenciais Meta/Pinterest/WhatsApp e providers;
- publishing/outbound/canary real;
- geração de IA paga para homologação;
- sincronização Bling/SEFAZ/fiscal real;
- rotas/GPS/providers logísticos e mutações financeiras reais;
- testes com clientes, pedidos, identidades, consentimentos ou PIN administrativo reais.
Esses itens continuam exigindo gate/evidência/ação humana próprios e não foram simulados para declarar o código pronto.

## Estado terminal desta automação
O roadmap autônomo R1–R16 terminou. Novas alterações nesta frente só devem ocorrer por nova demanda, regressão comprovada ou homologação humana específica. Não continuar criando melhorias após este checkpoint apenas porque existe capacidade de programar mais.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing, outbound ou canary;
- não disparar geração paga/IA apenas para testar UI;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados sem nova validação/demanda;
- não criar ou alterar pedido/cliente/publicação real como teste;
- não testar PIN administrativo nem resolver identidade real sem evidência/ação humana exigida;
- não emitir documento fiscal, sincronizar Bling real, publicar rota ou alterar financeiro real apenas para homologar interface.

## Pós-R16 — correção visual e usabilidade da homologação (21/09/2026)
- demanda explícita recebida após análise de telas reais em produção; R1–R16 continuam DONE e esta é uma correção de homologação, não uma R17;
- criado `admin/admin-visual-standard-v3.css` como camada visual comum para o Admin: conteúdo, painéis, tipografia, botões, inputs, touch targets, tablet/mobile e workspaces especializados;
- Admin principal/Cestas, Nomes dos produtos, Atendimento, Gôndolas, Pedidos, Imagens IA, Estúdio Criativo, Marketing, Relacionamento, Inteligência e Aprendizados passaram a carregar o padrão V3;
- Nomes dos produtos e Imagens IA passaram a usar o Shell/Subpage Navigation canônico em vez de menu manual duplicado;
- Atendimento foi integrado ao Shell canônico, mantendo suas tabs e lógica local;
- Balanço rápido recebeu `contagem/admin-visual-v3.css`: continua mobile-first, mas usa melhor a largura no desktop, aumenta legibilidade e mantém ações grandes/sticky;
- problema real de timeout em Nomes dos produtos tratado: frontend preparado para consulta de até 60 s com feedback após 12 s e endpoint `admin-product-names-v1` otimizado para contagens por status sem carregar até 5.000 linhas apenas para contar;
- Edge Function `admin-product-names-v1` v2 foi implantada no Supabase mantendo `verify_jwt=false` como na versão anterior e sem alterar contratos de revisão/processamento;
- workflow `Admin Geral contracts` run 35601154154 passou com sucesso, incluindo o novo passo `Visual standard V3` e todos os contratos R1–R16;
- nenhuma flag externa, publishing, outbound, canary, Bling/fiscal, logística/financeiro real ou IA paga foi ativada;
- frontend V3 permanece na branch do Admin até a integração deliberada com `main`; não declarar o visual novo como publicado antes dessa integração.

## Pós-R16 — Admin como produto único / Global Shell V3 (21/09/2026)
- screenshots reais confirmaram que o usuário ainda percebia Atendimento, Relacionamento, Marketing, Balanço e outras ferramentas como aplicativos diferentes;
- critério corrigido: separação técnica por módulos não pode aparecer como separação de produto;
- criado `admin/admin-global-shell-v3.js/css`, que fornece cabeçalho global, navegação canônica, menu lateral desktop, drawer mobile, estado ativo e acesso ao Comprar para módulos especializados;
- Relacionamento agora mantém seus painéis como navegação secundária dentro do Admin, não como sidebar concorrente;
- Inteligência e Aprendizados mantêm seus cabeçalhos de página dentro do shell global;
- VIDEO foi convertido visualmente do tema standalone escuro para a linguagem visual do Admin, preservando seu workflow;
- Balanço rápido passou a abrir dentro do shell global mantendo operação mobile-first;
- ferramentas operacionais externas ao diretório /admin também foram integradas: Cadastro rápido, Validades, Cestas rápidas e Kits;
- o Module Registry agora inclui Cadastro rápido, Validades e Kits como módulos canônicos; Cestas rápidas usa o módulo Cestas;
- a navegação operacional Contagem/Cadastro/Validades/Cestas/Kits permanece como navegação secundária contextual;
- nenhum runtime, gate externo, Make legado, publicação, outbound, Bling/fiscal ou dado real foi alterado por esta unificação visual;
- testes `admin-global-shell-v3-contract.test.mjs` e Visual Standard V3 estão no CI.
