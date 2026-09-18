# DECISIONS AND GUARDRAILS — Marketing Admin

## Decisões permanentes

1. O módulo vive dentro do Admin Dona Antônia, não como app isolado.
2. Documentação fica separada do Customer & Marketing OS.
3. Campanha é a entidade raiz.
4. Render determinístico é preferido à geração por IA.
5. IA de imagem usa qualidade low por padrão nesta fase.
6. Uma geração por padrão; regenerar somente por ação explícita ou falha real.
7. Vídeo V1 é 10s fixo e não generativo.
8. O mesmo asset visual deve ser reaproveitado entre canais.
9. Aprovação humana é obrigatória antes de publicação nesta fase.
10. WhatsApp Status não usa endpoint não documentado.
11. Facebook Story fica manual/cross-share enquanto publicação direta não estiver oficialmente homologada.
12. Tokens ficam no Vault.
13. Token nunca aparece no frontend, commit, log ou chat.
14. Graph API version nunca deve ter fallback chutado.
15. Falha ambígua após chamada ao provedor vai para revisão humana; não retry automático.
16. Nenhum cron de publicação é ativado antes de canary.
17. Limite diário 0 significa nenhuma publicação.
18. Um canary abre um canal por vez.
19. Make pode servir como evidência/proxy temporário, mas não substitui a verdade do Supabase/Marketing Brain.
20. Não copiar segredo bruto de conexão Make para o projeto; usar OAuth próprio ou integração/proxy formal.

## Segurança externa

Publicação direta exige:
- publishing_enabled;
- kill_switch desligado;
- canary/live;
- limite diário;
- gate do canal;
- conexão verified;
- credencial;
- ID da conta;
- mídia provider-ready;
- asset approved.

## Custos

- zero IA para render determinístico;
- evitar vídeo generativo;
- evitar chamadas OpenAI em carregamento de página;
- shortlists antes de IA;
- métricas agregadas antes de IA;
- logs de custo;
- nenhuma automação recorrente cara sem necessidade.

## Qualidade

Nunca usar automaticamente imagem:
- rejected;
- montagem lado-a-lado;
- comparativo;
- banner;
- tabela;
- revisão manual pendente,
quando houver opção visual melhor.

## Make

Conexões confirmadas:
- Facebook `7490477`;
- Facebook `7650626`;
- Pinterest `7490792` (necessita reautorização para listar boards).

IDs confirmados:
- Facebook Page Super Cestas `1928140920768577`;
- Instagram `17841451162237654`.

Esses IDs podem ser usados para pré-preencher/validar o Connection Manager.
